// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../../contracts/Token.sol";
import "../../contracts/TokenV2.sol";
import "./UUPSProxy.sol";

/**
 * @title TokenMiscTest
 * @dev Tests targeting remaining coverage gaps:
 *
 *  1. ERC20FeeUpgradeable — uncovered branches:
 *     - recipient whitelisted → no fee
 *     - setFeeCollector zero address reverts
 *     - setFeeCollector success + event
 *     - collector == from branch in Token._update (fee stays with sender)
 *
 *  2. ERC20FreezableUpgradeable — uncovered branches:
 *     - availableBalanceOf when frozen >= balance → returns 0
 *     - reduceFrozen below threshold reverts (InvalidFreezeAmount)
 *
 *  3. Token.sol — uncovered functions:
 *     - getSystemStatus()
 *     - emitHealthCheck()
 *     - isAdmin()
 *     - debugRoles()
 *     - _authorizeUpgrade() — UPGRADER_ROLE required
 *     - blockAddress() / unblock() public wrappers
 *     - freeze(address) single-arg public wrapper
 */
contract TokenMiscTest is Test {
    Token public token;

    address public admin;
    address public feeAdmin;
    address public feeFreeAccount;
    address public regularSender;
    address public regularRecipient;
    address public feeCollectorAddr;

    uint256 constant INITIAL_SUPPLY = 1_000_000 * 10 ** 18;
    uint256 constant INITIAL_FEE = 500; // 5%
    uint256 constant AMOUNT = 10_000 * 10 ** 18;

    function setUp() public {
        admin = address(this);
        feeAdmin = address(this); // admin == feeAdmin for simplicity
        feeFreeAccount = address(0xFEE00001);
        regularSender = address(0xFEE00002);
        regularRecipient = address(0xFEE00003);
        feeCollectorAddr = address(0xFEE00004);

        Token implementation = new Token();
        bytes memory initData = abi.encodeWithSelector(
            Token.initialize.selector,
            "Test Token",
            "TEST",
            INITIAL_SUPPLY,
            admin,
            INITIAL_FEE,
            feeCollectorAddr,
            admin
        );
        UUPSProxy proxy = new UUPSProxy(address(implementation), initData);
        token = Token(payable(address(proxy)));

        // Grant operational roles
        token.grantRole(token.MINTER_ROLE(), admin);
        token.grantRole(token.BURNER_ROLE(), admin);
        token.grantRole(token.PAUSER_ROLE(), admin);
        token.grantRole(token.FREEZER_ROLE(), admin);
        token.grantRole(token.BLOCKER_ROLE(), admin);
        token.grantRole(token.FEE_ADMIN_ROLE(), admin);
        token.grantRole(token.UPGRADER_ROLE(), admin);
    }

    // ─────────────────────────────────────────────
    // ERC20FeeUpgradeable — fee branches
    // ─────────────────────────────────────────────

    /// @dev recipient (to) is whitelisted → fee = 0
    function test_fee_recipientWhitelisted_noFee() public {
        token.mint(regularSender, AMOUNT);
        token.addFeeFree(regularRecipient); // whitelist the RECIPIENT

        uint256 senderBefore = token.balanceOf(regularSender);
        uint256 recipientBefore = token.balanceOf(regularRecipient);
        uint256 collectorBefore = token.balanceOf(feeCollectorAddr);

        vm.prank(regularSender);
        token.transfer(regularRecipient, AMOUNT);

        // Recipient gets full amount (no fee because isFeeFree[to])
        assertEq(token.balanceOf(regularRecipient), recipientBefore + AMOUNT);
        assertEq(token.balanceOf(regularSender), senderBefore - AMOUNT);
        // Fee collector receives nothing
        assertEq(token.balanceOf(feeCollectorAddr), collectorBefore);
    }

    /// @dev sender (from) is whitelisted → fee = 0 (confirms existing branch works)
    function test_fee_senderWhitelisted_noFee() public {
        token.mint(regularSender, AMOUNT);
        token.addFeeFree(regularSender); // whitelist the SENDER

        uint256 recipientBefore = token.balanceOf(regularRecipient);
        uint256 collectorBefore = token.balanceOf(feeCollectorAddr);

        vm.prank(regularSender);
        token.transfer(regularRecipient, AMOUNT);

        assertEq(token.balanceOf(regularRecipient), recipientBefore + AMOUNT);
        assertEq(token.balanceOf(feeCollectorAddr), collectorBefore);
    }

    /// @dev fee = 0 → no deduction at all
    function test_fee_zeroFee_exactTransfer() public {
        token.setFee(0);
        token.mint(regularSender, AMOUNT);

        uint256 collectorBefore = token.balanceOf(feeCollectorAddr);

        vm.prank(regularSender);
        token.transfer(regularRecipient, AMOUNT);

        assertEq(token.balanceOf(regularRecipient), AMOUNT);
        assertEq(token.balanceOf(feeCollectorAddr), collectorBefore);
    }

    /// @dev collector == from → fee stays with sender (branch: collector != from is false)
    function test_fee_collectorEqualsFrom_noExtraTransfer() public {
        // Set fee collector = regularSender
        token.setFeeCollector(regularSender);
        assertEq(token.feeCollector(), regularSender);

        token.mint(regularSender, AMOUNT);
        uint256 senderBefore = token.balanceOf(regularSender);
        uint256 recipientBefore = token.balanceOf(regularRecipient);

        vm.prank(regularSender);
        token.transfer(regularRecipient, AMOUNT);

        // Recipient gets net amount (AMOUNT - fee), fee stays with sender
        uint256 feeAmount = (AMOUNT * INITIAL_FEE) / 10000;
        uint256 netAmount = AMOUNT - feeAmount;
        assertEq(token.balanceOf(regularRecipient), recipientBefore + netAmount);
        // Sender paid net + kept fee (total deducted is just netAmount from balance perspective)
        // Sender balance: senderBefore - netAmount (fee NOT sent elsewhere)
        assertEq(token.balanceOf(regularSender), senderBefore - netAmount);
    }

    /// @dev setFeeCollector to zero address must revert
    function test_setFeeCollector_zeroAddressReverts() public {
        vm.expectRevert(ERC20FeeUpgradeable.InvalidFeeCollector.selector);
        token.setFeeCollector(address(0));
    }

    /// @dev setFeeCollector success + FeeCollectorUpdated event
    function test_setFeeCollector_success() public {
        address newCollector = address(0xC011EC70);

        vm.expectEmit(true, true, false, false, address(token));
        emit ERC20FeeUpgradeable.FeeCollectorUpdated(feeCollectorAddr, newCollector);

        token.setFeeCollector(newCollector);
        assertEq(token.feeCollector(), newCollector);
    }

    /// @dev non-FEE_ADMIN calling setFeeCollector reverts
    function test_setFeeCollector_nonAdminReverts() public {
        vm.prank(regularSender);
        vm.expectRevert();
        token.setFeeCollector(address(0xABCD));
    }

    // ─────────────────────────────────────────────
    // ERC20FreezableUpgradeable — uncovered branches
    // ─────────────────────────────────────────────

    /// @dev availableBalanceOf when frozen >= balance → 0
    function test_availableBalance_frozenExceedsBalance_returnsZero() public {
        address account = address(0xF0001);
        token.mint(account, 1000);

        // Freeze more than balance (type(uint256).max via freezeAll)
        token.freezeAll(account);

        assertEq(token.frozenOf(account), type(uint256).max);
        assertEq(token.availableBalanceOf(account), 0);
    }

    /// @dev availableBalanceOf when frozen == balance exactly → 0
    function test_availableBalance_frozenEqualsBalance_returnsZero() public {
        address account = address(0xF0002);
        token.mint(account, 1000);

        token.freeze(account, 1000); // frozen == balance

        assertEq(token.availableBalanceOf(account), 0);
    }

    /// @dev availableBalanceOf when frozen < balance → positive
    function test_availableBalance_partialFreeze_returnsRemainder() public {
        address account = address(0xF0003);
        token.mint(account, 1000);

        token.freeze(account, 600);

        assertEq(token.availableBalanceOf(account), 400);
    }

    /// @dev reduceFrozen below current frozen reverts InvalidFreezeAmount
    function test_reduceFrozen_belowCurrentReverts() public {
        address account = address(0xF0004);
        token.mint(account, 1000);
        token.freeze(account, 300);

        // Try to reduce by 500 when only 300 is frozen
        vm.expectRevert(ERC20FreezableUpgradeable.InvalidFreezeAmount.selector);
        token.reduceFrozen(account, 500);
    }

    /// @dev reduceFrozen to zero removes freeze
    function test_reduceFrozen_toZero_unfreezes() public {
        address account = address(0xF0005);
        token.mint(account, 1000);
        token.freeze(account, 500);

        token.reduceFrozen(account, 500);
        assertEq(token.frozenOf(account), 0);
        assertFalse(token.isFrozen(account));
    }

    // ─────────────────────────────────────────────
    // Token.sol — uncovered public functions
    // ─────────────────────────────────────────────

    function test_getSystemStatus() public view {
        (
            string memory ver,
            uint256 supply,
            bool isPaused,
            uint256 currentFee,
            address collector,
            uint256 blockNumber,
            uint256 timestamp
        ) = token.getSystemStatus();

        assertEq(ver, "1.7.0-refactor");
        assertEq(supply, token.totalSupply());
        assertEq(isPaused, false);
        assertEq(currentFee, token.fee());
        assertEq(collector, token.feeCollector());
        assertEq(blockNumber, block.number);
        assertEq(timestamp, block.timestamp);
    }

    function test_emitHealthCheck_emitsEvent() public {
        vm.expectEmit(false, false, false, false, address(token));
        emit Token.HealthCheck(block.timestamp, token.totalSupply(), false, token.fee(), admin);
        token.emitHealthCheck();
    }

    function test_isAdmin_returnsTrue() public view {
        assertTrue(token.isAdmin(admin));
    }

    function test_isAdmin_returnsFalse() public view {
        assertFalse(token.isAdmin(regularSender));
    }

    function test_debugRoles_adminHasRoles() public view {
        (bool isAdminRole, bool isMinter, bool isBurner) = token.debugRoles(admin);
        assertTrue(isAdminRole);
        assertTrue(isMinter);
        assertTrue(isBurner);
    }

    function test_debugRoles_regularHasNone() public view {
        (bool isAdminRole, bool isMinter, bool isBurner) = token.debugRoles(regularSender);
        assertFalse(isAdminRole);
        assertFalse(isMinter);
        assertFalse(isBurner);
    }

    // ─────────────────────────────────────────────
    // Token.sol — blockAddress / unblock wrappers
    // ─────────────────────────────────────────────

    function test_blockAddress_blocksAccount() public {
        token.mint(regularSender, AMOUNT);

        token.blockAddress(regularSender);
        assertTrue(token.isBlocked(regularSender));

        vm.prank(regularSender);
        vm.expectRevert(ERC20RestrictedUpgradeable.AccountBlocked.selector);
        token.transfer(regularRecipient, 1);
    }

    function test_blockAddress_nonBlockerReverts() public {
        vm.prank(regularSender);
        vm.expectRevert();
        token.blockAddress(regularRecipient);
    }

    function test_unblock_allowsTransferAgain() public {
        token.mint(regularSender, AMOUNT);
        token.blockAddress(regularSender);
        token.unblock(regularSender);

        assertFalse(token.isBlocked(regularSender));

        vm.prank(regularSender);
        token.transfer(regularRecipient, 1000);
        assertGe(token.balanceOf(regularRecipient), 0);
    }

    // ─────────────────────────────────────────────
    // Token.sol — freeze(address) single-arg wrapper
    // ─────────────────────────────────────────────

    function test_freeze_singleArg_freezesAll() public {
        address account = address(0xF0010);
        token.mint(account, AMOUNT);

        token.freeze(account); // calls freezeAll internally
        assertTrue(token.isFrozen(account));
        assertEq(token.frozenOf(account), type(uint256).max);
    }

    function test_freeze_singleArg_nonFreezerReverts() public {
        vm.prank(regularSender);
        vm.expectRevert();
        token.freeze(regularRecipient);
    }

    // ─────────────────────────────────────────────
    // Token.sol — _authorizeUpgrade (UUPS)
    // ─────────────────────────────────────────────

    function test_authorizeUpgrade_nonUpgraderReverts() public {
        TokenV2 newImpl = new TokenV2();

        vm.prank(regularSender);
        vm.expectRevert();
        token.upgradeToAndCall(address(newImpl), "");
    }

    function test_authorizeUpgrade_upgraderCanUpgrade() public {
        TokenV2 newImpl = new TokenV2();

        // Record state before upgrade
        uint256 supplyBefore = token.totalSupply();

        // Upgrader (admin) upgrades successfully
        token.upgradeToAndCall(address(newImpl), "");

        // Cast proxy to V2 interface — V2-specific function is now available
        TokenV2 tokenV2 = TokenV2(payable(address(token)));

        // State preserved after upgrade
        assertEq(tokenV2.totalSupply(), supplyBefore);

        // V2-specific function works (newVariable defaults to 0, so combined = totalSupply)
        assertEq(tokenV2.getCombinedValue(), supplyBefore);
    }

    // ─────────────────────────────────────────────
    // ERC20FeeUpgradeable — fuzz branches
    // ─────────────────────────────────────────────

    function testFuzz_fee_recipientWhitelisted(uint128 amount) public {
        vm.assume(amount > 0);
        token.mint(regularSender, amount);
        token.addFeeFree(regularRecipient);

        uint256 collectorBefore = token.balanceOf(feeCollectorAddr);

        vm.prank(regularSender);
        token.transfer(regularRecipient, amount);

        // No fee collected
        assertEq(token.balanceOf(feeCollectorAddr), collectorBefore);
        assertEq(token.balanceOf(regularRecipient), amount);
    }

    function testFuzz_availableBalance_frozenExceedsBalance(uint128 balance) public {
        vm.assume(balance > 0);
        address account = address(0xF00FF);
        token.mint(account, balance);
        token.freezeAll(account);

        assertEq(token.availableBalanceOf(account), 0);
    }
}
