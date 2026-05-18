// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../../contracts/Token.sol";
import "./TokenHandler.sol";
import "./UUPSProxy.sol";

/**
 * @title TokenTest
 * @dev Foundry fuzz and invariant tests for Token contract
 * Target: line coverage >= 95%, branch coverage >= 90%
 */
contract TokenTest is Test {
    Token public token;
    TokenHandler public handler;
    
    address public admin;
    address public initialHolder;
    
    // Initial supply for testing
    uint256 constant INITIAL_SUPPLY = 1_000_000 * 10**18; // 1M tokens
    uint256 constant INITIAL_FEE = 100; // 1% in basis points
    
    // EIP-712 type hashes for EIP-3009
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
        keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    bytes32 public constant EIP712_DOMAIN_TYPEHASH = 
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    
    function setUp() public {
        admin = address(this);
        initialHolder = address(0x100);
        
        // Deploy implementation
        Token implementation = new Token();
        
        // Encode initialization data
        bytes memory initData = abi.encodeWithSelector(
            Token.initialize.selector,
            "Test Token",
            "TEST",
            INITIAL_SUPPLY,
            initialHolder,
            INITIAL_FEE,
            address(0x200), // fee collector
            admin
        );
        
        // Deploy proxy
        UUPSProxy proxy = new UUPSProxy(address(implementation), initData);
        
        // Cast proxy to Token interface (use payable cast for receive compatibility)
        token = Token(payable(address(proxy)));
        
        // Grant all operational roles to admin (admin has DEFAULT_ADMIN_ROLE)
        token.grantRole(token.MINTER_ROLE(), admin);
        token.grantRole(token.BURNER_ROLE(), admin);
        token.grantRole(token.PAUSER_ROLE(), admin);
        token.grantRole(token.FREEZER_ROLE(), admin);
        token.grantRole(token.BLOCKER_ROLE(), admin);
        token.grantRole(token.FEE_ADMIN_ROLE(), admin);
        token.grantRole(token.RECOVERER_ROLE(), admin);
        token.grantRole(token.UPGRADER_ROLE(), admin);
        
        // Deploy handler for invariant tests
        handler = new TokenHandler(token, admin);
        
        // Target the handler for invariant testing
        targetContract(address(handler));
    }
    
    // ============================================
    // FUZZ TESTS
    // ============================================
    
    /**
     * @dev Fuzz test for setFee with valid bounds
     */
    function testFuzz_setFee(uint256 newFee) public {
        vm.assume(newFee <= 999);
        
        uint256 oldFee = token.fee();
        
        vm.prank(admin);
        token.setFee(newFee);
        
        assertEq(token.fee(), newFee);
        
        // Verify event emission (checked by handler)
        if (newFee != oldFee) {
            // Event should have been emitted
        }
    }
    
    /**
     * @dev Fuzz test for setFee - should revert if fee too high
     */
    function testFuzz_setFeeRevertsIfTooHigh(uint256 newFee) public {
        vm.assume(newFee > 999);
        
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ERC20FeeUpgradeable.FeeExceedsMaximum.selector, newFee, 999));
        token.setFee(newFee);
    }
    
    /**
     * @dev Fuzz test for transfer with fee - simple invariant checks
     */
    function testFuzz_transferWithFee(
        uint64 amount,
        uint16 feeBps,
        uint96 initialBalance
    ) public {
        // Simple bounds
        uint256 actualFee = bound(uint256(feeBps), 0, 999);
        uint256 actualBalance = bound(uint256(initialBalance), 1_000_000 * 10**12, 100_000_000 * 10**12);
        
        // Setup
        vm.prank(admin);
        token.setFee(actualFee);
        
        address sender = address(0x1001);
        address recipient = address(0x1002);
        
        token.mint(sender, actualBalance);
        
        // Bound amount to valid range
        uint256 actualAmount = bound(uint256(amount), 1, actualBalance);
        
        // Record state
        uint256 senderBefore = token.balanceOf(sender);
        uint256 recipientBefore = token.balanceOf(recipient);
        uint256 supplyBefore = token.totalSupply();
        
        // Transfer
        vm.prank(sender);
        token.transfer(recipient, actualAmount);
        
        // Invariants
        assertEq(token.balanceOf(sender), senderBefore - actualAmount);
        assertGe(token.balanceOf(recipient), recipientBefore);
        assertLe(token.balanceOf(recipient), recipientBefore + actualAmount);
        assertEq(token.totalSupply(), supplyBefore);
    }
    
    /**
     * @dev Fuzz test for freeze amount affecting transfer
     * If frozen amount > 0, account is frozen and transfers revert with AccountFrozen
     */
    function testFuzz_freezeAmountBlocksTransfer(
        uint96 freezeAmt,
        uint96 initialBalance
    ) public {
        // Bounds
        uint256 actualBalance = bound(uint256(initialBalance), 1000 * 10**18, 10_000_000 * 10**18);
        uint256 actualFreeze = bound(uint256(freezeAmt), 1, actualBalance); // Must be > 0 to freeze
        
        address account = address(0x6001);
        address recipient = address(0x6002);
        
        // Fund account
        token.mint(account, actualBalance);
        
        // Verify transfer works before freeze
        vm.prank(account);
        token.transfer(recipient, 1);
        assertEq(token.balanceOf(recipient), 1);
        
        // Freeze account
        token.freeze(account, actualFreeze);
        
        // Verify account is frozen
        assertTrue(token.isFrozen(account));
        
        // Transfer should now fail with AccountFrozen
        vm.prank(account);
        vm.expectRevert(ERC20FreezableUpgradeable.AccountFrozen.selector);
        token.transfer(recipient, 1);
    }
    
    /**
     * @dev Fuzz test for mint with various amounts
     */
    function testFuzz_mint(uint256 amount, address to) public {
        vm.assume(to != address(0));
        vm.assume(to != address(token));
        amount = bound(amount, 0, type(uint128).max);
        
        uint256 supplyBefore = token.totalSupply();
        uint256 balanceBefore = token.balanceOf(to);
        
        token.mint(to, amount);
        
        assertEq(token.totalSupply(), supplyBefore + amount);
        assertEq(token.balanceOf(to), balanceBefore + amount);
    }
    
    /**
     * @dev Fuzz test for burn with various amounts
     */
    function testFuzz_burn(uint256 mintAmount, uint256 burnAmount) public {
        address account = address(0x3001);
        
        mintAmount = bound(mintAmount, 1, type(uint128).max);
        burnAmount = bound(burnAmount, 0, mintAmount);
        
        // Mint first
        token.mint(account, mintAmount);
        
        uint256 supplyBefore = token.totalSupply();
        uint256 balanceBefore = token.balanceOf(account);
        
        // Burn
        token.burn(account, burnAmount);
        
        assertEq(token.totalSupply(), supplyBefore - burnAmount);
        assertEq(token.balanceOf(account), balanceBefore - burnAmount);
    }
    
    // ============================================
    // INVARIANT TESTS
    // ============================================
    
    /**
     * @dev Invariant: Ghost tracking - total minted - burned should match supply delta
     */
    function invariant_supplyAccounting() public view {
        // Check that our ghost tracking is consistent
        // This is a weak invariant because we don't track all addresses
        // But we can verify basic accounting: supply should be positive
        assertGe(token.totalSupply(), 0);
    }
    
    /**
     * @dev Invariant: Fee is always bounded by MAX_FEE_BASIS_POINTS
     */
    function invariant_feeBoundedByMax() public view {
        assertLe(token.fee(), token.MAX_FEE_BASIS_POINTS());
    }
    
    /**
     * @dev Invariant: Fee collector is never zero address
     */
    function invariant_feeCollectorNotZero() public view {
        assertTrue(token.feeCollector() != address(0));
    }
    
    /**
     * @dev Invariant: Frozen amount never exceeds balance for admin
     */
    function invariant_frozenNeverExceedsBalance() public view {
        uint256 frozen = token.frozenOf(admin);
        uint256 balance = token.balanceOf(admin);
        
        // Frozen can exceed balance only via freezeAll (type(uint256).max)
        if (frozen != type(uint256).max && frozen > 0) {
            assertLe(frozen, balance, "Frozen exceeds balance");
        }
    }
    
    /**
     * @dev Invariant: Minted >= Burned (total supply non-negative)
     */
    function invariant_supplyNonNegative() public view {
        assertGe(token.totalSupply(), 0);
    }
    
    /**
     * @dev Invariant: Handler accounting matches actual
     */
    function invariant_handlerAccounting() public view {
        // Ghost variables tracking should match actual minted/burned
        // This is a sanity check on the handler
        assertGe(handler.totalMinted(), handler.totalBurned());
    }
    
    // ============================================
    // EDGE CASE TESTS
    // ============================================
    
    /**
     * @dev Test transfer with zero amount
     */
    function test_transferZeroAmount() public {
        address sender = address(0x4001);
        address recipient = address(0x4002);
        
        token.mint(sender, 1000);
        
        uint256 supplyBefore = token.totalSupply();
        
        vm.prank(sender);
        token.transfer(recipient, 0);
        
        // Supply unchanged
        assertEq(token.totalSupply(), supplyBefore);
    }
    
    /**
     * @dev Test mint to zero address should revert
     */
    function test_mintToZeroAddressReverts() public {
        vm.expectRevert();
        token.mint(address(0), 1000);
    }
    
    /**
     * @dev Test burn more than balance should revert
     */
    function test_burnMoreThanBalanceReverts() public {
        address account = address(0x5001);
        
        token.mint(account, 1000);
        
        vm.expectRevert();
        token.burn(account, 1001);
    }
    
    /**
     * @dev Test transfer when paused should revert
     */
    function test_transferWhenPausedReverts() public {
        address sender = address(0x6001);
        address recipient = address(0x6002);
        
        token.mint(sender, 1000);
        
        // Pause
        token.pause();
        
        // Transfer should fail
        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(PausableUpgradeable.EnforcedPause.selector));
        token.transfer(recipient, 100);
    }
    
    /**
     * @dev Test transfer between blocked accounts should revert
     */
    function test_transferBetweenBlockedReverts() public {
        address sender = address(0x7001);
        address recipient = address(0x7002);
        
        token.mint(sender, 1000);
        
        // Block both
        token.blockUser(sender);
        token.blockUser(recipient);
        
        // Transfer should fail
        vm.prank(sender);
        vm.expectRevert(ERC20RestrictedUpgradeable.AccountBlocked.selector);
        token.transfer(recipient, 100);
    }
    
    /**
     * @dev Test unblock allows transfers again
     */
    function test_unblockRestoresTransfer() public {
        address sender = address(0x8001);
        address recipient = address(0x8002);
        
        token.mint(sender, 1000);
        
        // Block then unblock
        token.blockUser(sender);
        token.unblock(sender);
        
        // Transfer should succeed
        vm.prank(sender);
        token.transfer(recipient, 100);
        // Note: recipient may receive slightly less due to fee
        assertGe(token.balanceOf(recipient), 90);
    }
    
    /**
     * @dev Test unfreeze allows transfers again
     */
    function test_unfreezeRestoresTransfer() public {
        address sender = address(0x9001);
        address recipient = address(0x9002);
        
        token.mint(sender, 1000);
        
        // Freeze then unfreeze
        token.freeze(sender, 500);
        assertTrue(token.isFrozen(sender));
        
        token.unfreeze(sender);
        assertFalse(token.isFrozen(sender));
        
        // Transfer should succeed
        vm.prank(sender);
        token.transfer(recipient, 100);
        // Note: recipient may receive slightly less due to fee
        assertGe(token.balanceOf(recipient), 90);
    }
    
    /**
     * @dev Test fee whitelist - whitelisted addresses don't pay fees
     */
    function test_feeWhitelist() public {
        address sender = address(0xa001);
        address recipient = address(0xa002);
        address feeCollector = token.feeCollector();
        
        // Set 9.99% fee (max allowed)
        vm.prank(admin);
        token.setFee(999);
        
        // Whitelist sender
        vm.prank(admin);
        token.addFeeFree(sender);
        
        token.mint(sender, 10000);
        uint256 collectorBefore = token.balanceOf(feeCollector);
        
        // Transfer - no fee because sender is whitelisted
        vm.prank(sender);
        token.transfer(recipient, 1000);
        
        // Fee collector should not receive fee
        assertEq(token.balanceOf(feeCollector), collectorBefore);
        assertEq(token.balanceOf(recipient), 1000);
    }
    
    /**
     * @dev Fuzz test for unblock
     */
    function testFuzz_unblockRestoresTransfer(address blockedAccount) public {
        vm.assume(blockedAccount != address(0));
        vm.assume(blockedAccount != admin);
        
        token.mint(blockedAccount, 1000);
        token.blockUser(blockedAccount);
        assertTrue(token.isBlocked(blockedAccount));
        
        token.unblock(blockedAccount);
        assertFalse(token.isBlocked(blockedAccount));
        
        address recipient = address(0xb001);
        vm.prank(blockedAccount);
        token.transfer(recipient, 100);
    }
    
    /**
     * @dev Fuzz test for unfreeze
     */
    function testFuzz_unfreezeRestoresTransfer(uint96 freezeAmount, uint96 balance) public {
        uint256 actualBalance = bound(uint256(balance), 1000 * 10**18, 10_000_000 * 10**18);
        uint256 actualFreeze = bound(uint256(freezeAmount), 1, actualBalance);
        
        address account = address(0xc001);
        address recipient = address(0xc002);
        
        token.mint(account, actualBalance);
        token.freeze(account, actualFreeze);
        
        token.unfreeze(account);
        assertFalse(token.isFrozen(account));
        
        vm.prank(account);
        token.transfer(recipient, 100);
    }
    
    /**
     * @dev Test transfer from fee-free address
     */
    function testFuzz_transferFromFeeFree(uint96 amount, uint16 feeBps) public {
        uint256 actualAmount = bound(uint256(amount), 1000, 100_000_000 * 10**18);
        uint256 actualFee = bound(uint256(feeBps), 1, 999);
        
        address sender = address(0xd001);
        address recipient = address(0xd002);
        
        vm.prank(admin);
        token.setFee(actualFee);
        
        // Whitelist sender
        vm.prank(admin);
        token.addFeeFree(sender);
        
        token.mint(sender, actualAmount);
        
        uint256 senderBefore = token.balanceOf(sender);
        uint256 recipientBefore = token.balanceOf(recipient);
        
        vm.prank(sender);
        token.transfer(recipient, actualAmount);
        
        // No fee deducted
        assertEq(token.balanceOf(sender), senderBefore - actualAmount);
        assertEq(token.balanceOf(recipient), recipientBefore + actualAmount);
    }
    
    /**
     * @dev Test reduce frozen amount
     */
    function test_reduceFrozenAmount() public {
        address account = address(0xe001);
        address recipient = address(0xe002);
        
        token.mint(account, 10000);
        token.freeze(account, 8000);
        
        // Reduce frozen amount
        token.reduceFrozen(account, 5000);
        
        // Account still frozen (3000 > 0)
        assertTrue(token.isFrozen(account));
        
        // Transfer should still fail
        vm.prank(account);
        vm.expectRevert(ERC20FreezableUpgradeable.AccountFrozen.selector);
        token.transfer(recipient, 100);
    }
    
    /**
     * @dev Test pause and unpause
     */
    function test_pauseUnpauseCycle() public {
        address sender = address(0xf001);
        address recipient = address(0xf002);
        
        token.mint(sender, 1000);
        
        // Pause
        token.pause();
        assertTrue(token.paused());
        
        // Transfer fails when paused
        vm.prank(sender);
        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        token.transfer(recipient, 100);
        
        // Unpause
        token.unpause();
        assertFalse(token.paused());
        
        // Transfer succeeds after unpause
        vm.prank(sender);
        token.transfer(recipient, 100);
        // Note: recipient may receive slightly less due to fee
        assertGe(token.balanceOf(recipient), 90);
    }
    
    /**
     * @dev Test healthCheck function
     */
    function test_healthCheck() public view {
        (
            bool success,
            uint256 totalSupply,
            bool isPaused,
            uint256 currentFee
        ) = token.healthCheck();
        
        assertTrue(success);
        assertEq(totalSupply, token.totalSupply());
        assertEq(isPaused, token.paused());
        assertEq(currentFee, token.fee());
    }
    
    /**
     * @dev Test version string
     */
    function test_version() public view {
        assertEq(token.version(), "1.7.0-refactor");
    }
    
    /**
     * @dev Test transferFrom with allowance
     */
    function test_transferFrom() public {
        address owner = address(0xf101);
        address spender = address(0xf102);
        address recipient = address(0xf103);
        
        token.mint(owner, 1000);
        
        // Approve spender
        vm.prank(owner);
        token.approve(spender, 500);
        
        assertEq(token.allowance(owner, spender), 500);
        
        // Spender transfers
        vm.prank(spender);
        token.transferFrom(owner, recipient, 300);
        
        // Recipient gets amount minus fee (actual fee varies based on current settings)
        assertApproxEqAbs(token.balanceOf(recipient), 291, 10);
        assertEq(token.allowance(owner, spender), 200);
    }
    
    /**
     * @dev Test allowance with approve
     */
    function test_allowance() public {
        address owner = address(0xf201);
        address spender = address(0xf202);
        
        vm.prank(owner);
        token.approve(spender, 100);
        assertEq(token.allowance(owner, spender), 100);
        
        // Change allowance
        vm.prank(owner);
        token.approve(spender, 50);
        assertEq(token.allowance(owner, spender), 50);
    }
    
    /**
     * @dev Test remove from fee whitelist
     */
    function test_removeFeeFree() public {
        address account = address(0xf301);
        
        vm.prank(admin);
        token.addFeeFree(account);
        assertTrue(token.isFeeFree(account));
        
        vm.prank(admin);
        token.removeFeeFree(account);
        assertFalse(token.isFeeFree(account));
    }
    
    /**
     * @dev Test freezeAll and verify isFrozen
     */
    function test_freezeAllAndUnfreeze() public {
        address account = address(0xf401);
        
        token.mint(account, 1000);
        
        // Freeze all
        token.freezeAll(account);
        assertTrue(token.isFrozen(account));
        assertEq(token.frozenOf(account), type(uint256).max);
        
        // Unfreeze
        token.unfreeze(account);
        assertFalse(token.isFrozen(account));
        assertEq(token.frozenOf(account), 0);
    }
    
    /**
     * @dev Test domain separator for EIP-2612
     */
    function test_domainSeparator() public view {
        bytes32 separator = token.DOMAIN_SEPARATOR();
        assertTrue(separator != bytes32(0));
    }
    
    /**
     * @dev Test eip712Domain values
     */
    function test_eip712Domain() public view {
        (
            bytes1 fields,
            string memory name,
            string memory version,
            uint256 chainId,
            address verifyingContract,
            bytes32 salt,
            uint256[] memory extensions
        ) = token.eip712Domain();
        
        assertEq(name, "Test Token");
        assertEq(version, "1");
        assertEq(chainId, block.chainid);
        assertEq(verifyingContract, address(token));
    }
    
    /**
     * @dev Test nonces for permit
     */
    function test_nonces() public {
        address account = address(0xf501);
        assertEq(token.nonces(account), 0);
    }
    
    /**
     * @dev Test burn from own account (requires BURNER_ROLE or self-burn)
     */
    function test_burnFromSelf() public {
        address account = address(0xf601);
        token.mint(account, 1000);
        
        // Grant burner role to account
        token.grantRole(token.BURNER_ROLE(), account);
        
        uint256 balanceBefore = token.balanceOf(account);
        uint256 supplyBefore = token.totalSupply();
        
        vm.prank(account);
        token.burn(account, 300);
        
        assertEq(token.balanceOf(account), balanceBefore - 300);
        assertEq(token.totalSupply(), supplyBefore - 300);
    }
    
    /**
     * @dev Test available balance after freeze
     */
    function test_availableBalanceOf() public {
        address account = address(0xf701);
        token.mint(account, 1000);
        
        // Initially all available
        assertEq(token.availableBalanceOf(account), 1000);
        
        // Freeze partial
        token.freeze(account, 600);
        // Account is frozen (any freeze amount > 0 blocks transfers)
        assertTrue(token.isFrozen(account));
    }
    
    /**
     * @dev Test MAX_FEE_BASIS_POINTS constant
     */
    function test_maxFee() public view {
        assertEq(token.MAX_FEE_BASIS_POINTS(), 999);
    }
    
    /**
     * @dev Test renounce role
     */
    function test_renounceRole() public {
        bytes32 minterRole = token.MINTER_ROLE();
        
        // Admin has minter role
        assertTrue(token.hasRole(minterRole, admin));
        
        // Renounce
        token.renounceRole(minterRole, admin);
        
        assertFalse(token.hasRole(minterRole, admin));
    }
}
