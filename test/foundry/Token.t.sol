// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../../contracts/Token.sol";
import "./TokenHandler.sol";
import "./UUPSProxy.sol";

/**
 * @title TokenTest
 * @dev Foundry fuzz and invariant tests for Token v2.0.0
 */
contract TokenTest is Test {
    Token public token;
    TokenHandler public handler;

    address public admin;
    address public initialHolder;
    address public feeCollector;
    address public custodyTreasury;

    uint256 constant INITIAL_SUPPLY = 1_000_000 * 10 ** 18; // 1M tokens
    uint256 constant INITIAL_TRANSFER_FEE = 10; // 0.10%
    uint256 constant INITIAL_CUSTODY_FEE = 50; // 0.50%

    function setUp() public {
        admin = address(this);
        initialHolder = address(0x100);
        feeCollector = address(0x200);
        custodyTreasury = address(0x201);

        Token implementation = new Token();

        bytes memory initData = abi.encodeWithSelector(
            Token.initialize.selector,
            "Test Token",
            "TEST",
            INITIAL_SUPPLY,
            initialHolder,
            INITIAL_TRANSFER_FEE,
            feeCollector,
            INITIAL_CUSTODY_FEE,
            custodyTreasury,
            admin,
            3 days
        );

        UUPSProxy proxy = new UUPSProxy(address(implementation), initData);
        token = Token(payable(address(proxy)));

        // Operational roles for the unit/fuzz tests (governance roles granted by initialize)
        token.grantRole(token.MINTER_ROLE(), admin);
        token.grantRole(token.BURNER_ROLE(), admin);
        token.grantRole(token.PAUSER_ROLE(), admin);
        token.grantRole(token.FREEZER_ROLE(), admin);
        token.grantRole(token.BLOCKER_ROLE(), admin);

        // Deploy handler for invariant tests
        handler = new TokenHandler(token, admin, initialHolder);
        targetContract(address(handler));
    }

    // ============================================
    // FUZZ TESTS
    // ============================================

    function testFuzz_setTransferFeeBps(uint256 newBps) public {
        newBps = bound(newBps, 0, token.MAX_TRANSFER_FEE_BPS());

        vm.prank(admin);
        token.setTransferFeeBps(newBps);

        assertEq(token.transferFeeBps(), newBps);
    }

    function testFuzz_setTransferFeeBpsRevertsIfTooHigh(uint256 newBps) public {
        newBps = bound(newBps, uint256(token.MAX_TRANSFER_FEE_BPS()) + 1, type(uint256).max);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ERC20TransferFeeUpgradeable.FeeExceedsMaximum.selector, newBps, 100));
        token.setTransferFeeBps(newBps);
    }

    /**
     * @dev Net path: sender pays exactly `amount`, recipient receives amount - fee
     */
    function testFuzz_transferWithFee(uint64 amount, uint16 feeBps, uint96 initialBalance) public {
        uint256 actualFee = bound(uint256(feeBps), 0, 100);
        uint256 actualBalance = bound(uint256(initialBalance), 1_000_000 * 10 ** 12, 100_000_000 * 10 ** 12);

        vm.prank(admin);
        token.setTransferFeeBps(actualFee);

        address sender = address(0x1001);
        address recipient = address(0x1002);

        token.mint(sender, actualBalance);

        uint256 actualAmount = bound(uint256(amount), 1, actualBalance);
        uint256 expectedFee = (actualAmount * actualFee) / 10000;

        uint256 senderBefore = token.balanceOf(sender);
        uint256 recipientBefore = token.balanceOf(recipient);
        uint256 collectorBefore = token.balanceOf(feeCollector);
        uint256 supplyBefore = token.totalSupply();

        vm.prank(sender);
        token.transfer(recipient, actualAmount);

        assertEq(token.balanceOf(sender), senderBefore - actualAmount);
        assertEq(token.balanceOf(recipient), recipientBefore + actualAmount - expectedFee);
        assertEq(token.balanceOf(feeCollector), collectorBefore + expectedFee);
        assertEq(token.totalSupply(), supplyBefore);
    }

    /**
     * @dev A frozen account cannot send (binary freeze)
     */
    function testFuzz_freezeBlocksTransfer(uint96 initialBalance) public {
        uint256 actualBalance = bound(uint256(initialBalance), 1000 * 10 ** 18, 10_000_000 * 10 ** 18);

        address account = address(0x6001);
        address recipient = address(0x6002);

        token.mint(account, actualBalance);

        vm.prank(account);
        token.transfer(recipient, 1);
        assertGe(token.balanceOf(recipient), 0);

        token.freeze(account);
        assertTrue(token.isFrozen(account));

        vm.prank(account);
        vm.expectRevert(ERC20FreezableUpgradeable.AccountFrozen.selector);
        token.transfer(recipient, 1);
    }

    function testFuzz_mint(uint256 amount, address to) public {
        vm.assume(to != address(0));
        vm.assume(to != address(token));
        vm.assume(to != feeCollector && to != custodyTreasury && to != initialHolder);
        amount = bound(amount, 0, type(uint128).max);

        uint256 supplyBefore = token.totalSupply();
        uint256 balanceBefore = token.balanceOf(to);

        token.mint(to, amount);

        assertEq(token.totalSupply(), supplyBefore + amount);
        assertEq(token.balanceOf(to), balanceBefore + amount);
    }

    function testFuzz_burn(uint256 mintAmount, uint256 burnAmount) public {
        address account = address(0x3001);

        mintAmount = bound(mintAmount, 1, type(uint128).max);
        burnAmount = bound(burnAmount, 0, mintAmount);

        token.mint(account, mintAmount);

        uint256 supplyBefore = token.totalSupply();
        uint256 balanceBefore = token.balanceOf(account);

        token.burn(account, burnAmount);

        assertEq(token.totalSupply(), supplyBefore - burnAmount);
        assertEq(token.balanceOf(account), balanceBefore - burnAmount);
    }

    // ============================================
    // INVARIANT TESTS
    // ============================================

    /**
     * @dev Fundamental invariant: the sum of balances over the tracked set
     * (handler actors + feeCollector + custodyTreasury) equals totalSupply.
     * All handler-triggered movements stay inside this set.
     */
    function invariant_sumOfBalancesEqualsTotalSupply() public view {
        address[] memory actors = handler.getActors();
        uint256 sum = token.balanceOf(feeCollector) + token.balanceOf(custodyTreasury);
        for (uint256 i = 0; i < actors.length; i++) {
            sum += token.balanceOf(actors[i]);
        }
        assertEq(sum, token.totalSupply(), "sum(balances) != totalSupply");
    }

    function invariant_transferFeeBoundedByMax() public view {
        assertLe(token.transferFeeBps(), token.MAX_TRANSFER_FEE_BPS());
    }

    function invariant_custodyFeeBoundedByMax() public view {
        assertLe(token.custodyFeeBps(), token.MAX_CUSTODY_FEE_BPS());
    }

    function invariant_feeCollectorNotZero() public view {
        assertTrue(token.feeCollector() != address(0));
    }

    function invariant_custodyTreasuryNotZero() public view {
        assertTrue(token.custodyTreasury() != address(0));
    }

    function invariant_cycleAtLeastOne() public view {
        assertGe(token.currentCycle(), 1);
    }

    function invariant_handlerAccounting() public view {
        assertGe(handler.totalMinted(), handler.totalBurned());
    }

    // ============================================
    // EDGE CASE TESTS
    // ============================================

    function test_transferZeroAmount() public {
        address sender = address(0x4001);
        address recipient = address(0x4002);

        token.mint(sender, 1000);

        uint256 supplyBefore = token.totalSupply();

        vm.prank(sender);
        token.transfer(recipient, 0);

        assertEq(token.totalSupply(), supplyBefore);
        assertEq(token.balanceOf(recipient), 0);
    }

    function test_mintToZeroAddressReverts() public {
        vm.expectRevert();
        token.mint(address(0), 1000);
    }

    function test_burnMoreThanBalanceReverts() public {
        address account = address(0x5001);

        token.mint(account, 1000);

        vm.expectRevert();
        token.burn(account, 1001);
    }

    function test_transferWhenPausedReverts() public {
        address sender = address(0x6001);
        address recipient = address(0x6002);

        token.mint(sender, 1000);

        token.pause();

        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(PausableUpgradeable.EnforcedPause.selector));
        token.transfer(recipient, 100);
    }

    function test_transferBetweenBlockedReverts() public {
        address sender = address(0x7001);
        address recipient = address(0x7002);

        token.mint(sender, 1000);

        token.blockAccount(sender);
        token.blockAccount(recipient);

        vm.prank(sender);
        vm.expectRevert(ERC20BlocklistUpgradeable.AccountBlocked.selector);
        token.transfer(recipient, 100);
    }

    function test_unblockRestoresTransfer() public {
        address sender = address(0x8001);
        address recipient = address(0x8002);

        token.mint(sender, 1000);

        token.blockAccount(sender);
        token.unblockAccount(sender);

        vm.prank(sender);
        token.transfer(recipient, 100);
        // 0.10% fee on 100 rounds to 0
        assertEq(token.balanceOf(recipient), 100);
    }

    function test_unfreezeRestoresTransfer() public {
        address sender = address(0x9001);
        address recipient = address(0x9002);

        token.mint(sender, 1000);

        token.freeze(sender);
        assertTrue(token.isFrozen(sender));

        token.unfreeze(sender);
        assertFalse(token.isFrozen(sender));

        vm.prank(sender);
        token.transfer(recipient, 100);
        assertEq(token.balanceOf(recipient), 100);
    }

    /**
     * @dev Exempt sender pays no fee even at max fee
     */
    function test_transferFeeExemption() public {
        address sender = address(0xa001);
        address recipient = address(0xa002);

        vm.prank(admin);
        token.setTransferFeeBps(100); // 1% (max)

        vm.prank(admin);
        token.addTransferFeeExempt(sender);

        token.mint(sender, 10000);
        uint256 collectorBefore = token.balanceOf(feeCollector);

        vm.prank(sender);
        token.transfer(recipient, 1000);

        assertEq(token.balanceOf(feeCollector), collectorBefore);
        assertEq(token.balanceOf(recipient), 1000);
    }

    function testFuzz_unblockRestoresTransfer(address blockedAccount) public {
        vm.assume(blockedAccount != address(0));
        vm.assume(blockedAccount != admin);
        vm.assume(blockedAccount != feeCollector && blockedAccount != custodyTreasury);

        token.mint(blockedAccount, 1000);
        token.blockAccount(blockedAccount);
        assertTrue(token.isBlocked(blockedAccount));

        token.unblockAccount(blockedAccount);
        assertFalse(token.isBlocked(blockedAccount));

        address recipient = address(0xb001);
        vm.prank(blockedAccount);
        token.transfer(recipient, 100);
    }

    function testFuzz_unfreezeRestoresTransfer(uint96 balance) public {
        uint256 actualBalance = bound(uint256(balance), 1000 * 10 ** 18, 10_000_000 * 10 ** 18);

        address account = address(0xc001);
        address recipient = address(0xc002);

        token.mint(account, actualBalance);
        token.freeze(account);

        token.unfreeze(account);
        assertFalse(token.isFrozen(account));

        vm.prank(account);
        token.transfer(recipient, 100);
    }

    /**
     * @dev Exempt sender: full amount delivered for any fee setting
     */
    function testFuzz_transferFromExempt(uint96 amount, uint16 feeBps) public {
        uint256 actualAmount = bound(uint256(amount), 1000, 100_000_000 * 10 ** 18);
        uint256 actualFee = bound(uint256(feeBps), 1, 100);

        address sender = address(0xd001);
        address recipient = address(0xd002);

        vm.prank(admin);
        token.setTransferFeeBps(actualFee);

        vm.prank(admin);
        token.addTransferFeeExempt(sender);

        token.mint(sender, actualAmount);

        uint256 senderBefore = token.balanceOf(sender);
        uint256 recipientBefore = token.balanceOf(recipient);

        vm.prank(sender);
        token.transfer(recipient, actualAmount);

        assertEq(token.balanceOf(sender), senderBefore - actualAmount);
        assertEq(token.balanceOf(recipient), recipientBefore + actualAmount);
    }

    function test_pauseUnpauseCycle() public {
        address sender = address(0xf001);
        address recipient = address(0xf002);

        token.mint(sender, 1000);

        token.pause();
        assertTrue(token.paused());

        vm.prank(sender);
        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        token.transfer(recipient, 100);

        token.unpause();
        assertFalse(token.paused());

        vm.prank(sender);
        token.transfer(recipient, 100);
        assertEq(token.balanceOf(recipient), 100);
    }

    function test_version() public view {
        assertEq(token.version(), "2.5.0");
    }

    /**
     * @dev transferFrom: net semantics, allowance spent for the stated amount
     */
    function test_transferFrom() public {
        address owner = address(0xf101);
        address spender = address(0xf102);
        address recipient = address(0xf103);

        // 1% for meaningful fee math on small amounts
        vm.prank(admin);
        token.setTransferFeeBps(100);

        token.mint(owner, 1000);

        vm.prank(owner);
        token.approve(spender, 500);

        assertEq(token.allowance(owner, spender), 500);

        vm.prank(spender);
        token.transferFrom(owner, recipient, 300);

        // 1% of 300 = 3 -> recipient receives 297
        assertEq(token.balanceOf(recipient), 297);
        assertEq(token.balanceOf(feeCollector), 3);
        assertEq(token.allowance(owner, spender), 200);
    }

    /**
     * @dev Infinite allowance is not decremented (OZ semantics restored in v2)
     */
    function test_infiniteAllowanceNotDecremented() public {
        address owner = address(0xf111);
        address spender = address(0xf112);
        address recipient = address(0xf113);

        token.mint(owner, 1000);

        vm.prank(owner);
        token.approve(spender, type(uint256).max);

        vm.prank(spender);
        token.transferFrom(owner, recipient, 300);

        assertEq(token.allowance(owner, spender), type(uint256).max);
    }

    function test_allowance() public {
        address owner = address(0xf201);
        address spender = address(0xf202);

        vm.prank(owner);
        token.approve(spender, 100);
        assertEq(token.allowance(owner, spender), 100);

        vm.prank(owner);
        token.approve(spender, 50);
        assertEq(token.allowance(owner, spender), 50);
    }

    function test_removeTransferFeeExempt() public {
        address account = address(0xf301);

        vm.prank(admin);
        token.addTransferFeeExempt(account);
        assertTrue(token.isTransferFeeExempt(account));

        vm.prank(admin);
        token.removeTransferFeeExempt(account);
        assertFalse(token.isTransferFeeExempt(account));
    }

    function test_freezeAndUnfreeze() public {
        address account = address(0xf401);

        token.mint(account, 1000);

        token.freeze(account);
        assertTrue(token.isFrozen(account));

        token.unfreeze(account);
        assertFalse(token.isFrozen(account));
    }

    function test_domainSeparator() public view {
        bytes32 separator = token.DOMAIN_SEPARATOR();
        assertTrue(separator != bytes32(0));
    }

    function test_eip712Domain() public view {
        (, string memory name, string memory version, uint256 chainId, address verifyingContract,,) =
            token.eip712Domain();

        assertEq(name, "Test Token");
        assertEq(version, "1");
        assertEq(chainId, block.chainid);
        assertEq(verifyingContract, address(token));
    }

    function test_nonces() public view {
        address account = address(0xf501);
        assertEq(token.nonces(account), 0);
    }

    function test_burnFromSelf() public {
        address account = address(0xf601);
        token.mint(account, 1000);

        token.grantRole(token.BURNER_ROLE(), account);

        uint256 balanceBefore = token.balanceOf(account);
        uint256 supplyBefore = token.totalSupply();

        vm.prank(account);
        token.burn(account, 300);

        assertEq(token.balanceOf(account), balanceBefore - 300);
        assertEq(token.totalSupply(), supplyBefore - 300);
    }

    function test_maxTransferFee() public view {
        assertEq(token.MAX_TRANSFER_FEE_BPS(), 100);
    }

    function test_maxCustodyFee() public view {
        assertEq(token.MAX_CUSTODY_FEE_BPS(), 200);
    }

    function test_renounceRole() public {
        bytes32 minterRole = token.MINTER_ROLE();

        assertTrue(token.hasRole(minterRole, admin));

        token.renounceRole(minterRole, admin);

        assertFalse(token.hasRole(minterRole, admin));
    }
}
