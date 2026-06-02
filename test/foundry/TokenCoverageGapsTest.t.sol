// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../../contracts/Token.sol";
import "./UUPSProxy.sol";

/**
 * @title TokenCoverageGapsTest
 * @dev Tests targeting remaining structural coverage gaps:
 *
 *   1. ERC20FeeUpgradeable.__ERC20Fee_init — initialFee > MAX_FEE_BASIS_POINTS → revert
 *   2. ERC20FeeUpgradeable.__ERC20Fee_init — feeCollector_ == address(0) → revert
 *   3. ERC20RecoverableUpgradeable.recoverERC20 — transfer() returns false → TransferFailed
 *   4. Token._update collector == from with feeAmount > 0 branch (fee stays, no 2nd transfer)
 *   5. Token._update mint path (from == address(0)) → no fee, no security checks
 *   6. Token._update burn path (to == address(0)) → no fee, no security checks
 */

/// @dev ERC-20 mock that returns `false` from transfer() instead of reverting
contract ReturnFalseMock {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    /// @dev Always returns false — simulates a non-standard ERC-20 failure
    function transfer(address, uint256) external pure returns (bool) {
        return false;
    }
}

contract TokenCoverageGapsTest is Test {
    address public admin;
    address public collector;
    address public user;

    uint256 constant INITIAL_SUPPLY = 500_000 * 10 ** 18;

    function setUp() public {
        admin = address(this);
        collector = address(0xC011EC70);
        user = address(0xA001);
    }

    // ─────────────────────────────────────────────
    // Helper: deploy a fresh token proxy
    // ─────────────────────────────────────────────
    function _deployToken(
        uint256 fee_,
        address collector_,
        address holder_
    ) internal returns (Token t) {
        Token impl = new Token();
        bytes memory initData = abi.encodeWithSelector(
            Token.initialize.selector,
            "Test Token",
            "TEST",
            INITIAL_SUPPLY,
            holder_,
            fee_,
            collector_,
            admin
        );
        UUPSProxy proxy = new UUPSProxy(address(impl), initData);
        t = Token(payable(address(proxy)));
        t.grantRole(t.MINTER_ROLE(), admin);
        t.grantRole(t.BURNER_ROLE(), admin);
        t.grantRole(t.PAUSER_ROLE(), admin);
        t.grantRole(t.FEE_ADMIN_ROLE(), admin);
        t.grantRole(t.RECOVERER_ROLE(), admin);
        t.grantRole(t.FREEZER_ROLE(), admin);
        t.grantRole(t.BLOCKER_ROLE(), admin);
    }

    // ─────────────────────────────────────────────
    // 1. __ERC20Fee_init — initialFee > MAX
    // ─────────────────────────────────────────────

    function test_init_feeExceedsMax_reverts() public {
        // Deploy bare implementation (initializers disabled in constructor)
        // We need a fresh impl without _disableInitializers — use a sub-deploy trick:
        // Call initialize directly on impl deployed without disableInitializers protection.
        // Since Token constructor calls _disableInitializers, we catch the proxy-level revert.
        Token impl = new Token();
        bytes memory initData = abi.encodeWithSelector(
            Token.initialize.selector,
            "Test Token",
            "TEST",
            INITIAL_SUPPLY,
            admin,
            1000,           // > MAX_FEE_BASIS_POINTS (999)
            collector,
            admin
        );
        // Proxy wraps the init revert — just assert it reverts (any reason)
        vm.expectRevert();
        new UUPSProxy(address(impl), initData);
    }

    function test_init_feeAtMax_succeeds() public {
        Token t = _deployToken(999, collector, admin);
        assertEq(t.fee(), 999);
    }

    // ─────────────────────────────────────────────
    // 2. __ERC20Fee_init — feeCollector_ == address(0)
    // ─────────────────────────────────────────────

    function test_init_zeroCollector_reverts() public {
        Token impl = new Token();
        bytes memory initData = abi.encodeWithSelector(
            Token.initialize.selector,
            "Test Token",
            "TEST",
            INITIAL_SUPPLY,
            admin,
            100,
            address(0),     // collector == address(0)
            admin
        );
        // Proxy wraps the init revert — just assert it reverts (any reason)
        vm.expectRevert();
        new UUPSProxy(address(impl), initData);
    }

    // ─────────────────────────────────────────────
    // 3. recoverERC20 — transfer() returns false
    // ─────────────────────────────────────────────

    function test_recoverERC20_transferReturnsFalse_reverts() public {
        Token t = _deployToken(0, collector, admin);

        ReturnFalseMock fakeMock = new ReturnFalseMock();
        fakeMock.mint(address(t), 1000);

        vm.expectRevert(ERC20RecoverableUpgradeable.TransferFailed.selector);
        t.recoverERC20(address(fakeMock), admin, 500);
    }

    // ─────────────────────────────────────────────
    // 4. _update: mint path (from == address(0)) — no fee, no security checks
    // ─────────────────────────────────────────────

    function test_update_mintPath_noFee() public {
        Token t = _deployToken(999, collector, admin); // high fee

        // Mint should NOT touch fee logic
        uint256 supplyBefore = t.totalSupply();
        t.mint(user, 1000);

        assertEq(t.totalSupply(), supplyBefore + 1000);
        assertEq(t.balanceOf(user), 1000);
        // Fee collector unchanged (mint bypasses fee)
        assertEq(t.balanceOf(collector), 0);
    }

    function test_update_mintPath_pausedReverts() public {
        Token t = _deployToken(0, collector, admin);
        t.pause();

        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        t.mint(user, 1000);
    }

    // ─────────────────────────────────────────────
    // 5. _update: burn path (to == address(0)) — no fee
    // ─────────────────────────────────────────────

    function test_update_burnPath_noFee() public {
        Token t = _deployToken(999, collector, admin); // high fee

        uint256 supplyBefore = t.totalSupply();
        uint256 burnAmount = 1000;

        // admin holds initial supply
        t.burn(admin, burnAmount);

        assertEq(t.totalSupply(), supplyBefore - burnAmount);
        // Fee collector unchanged (burn bypasses fee)
        assertEq(t.balanceOf(collector), 0);
    }

    // ─────────────────────────────────────────────
    // 6. _update: transfer with feeAmount=0 (fee=0) takes the else branch
    // ─────────────────────────────────────────────

    function test_update_zeroFee_normalTransfer() public {
        Token t = _deployToken(0, collector, admin);
        uint256 amount = 5000;

        uint256 userBefore = t.balanceOf(user);
        t.transfer(user, amount);

        assertEq(t.balanceOf(user), userBefore + amount);
        assertEq(t.balanceOf(collector), 0);
    }

    // ─────────────────────────────────────────────
    // 7. _update: feeAmount > 0 AND collector == from (fee stays, no 2nd transfer)
    // Already in TokenMiscTest but testing via direct Token path for coverage
    // ─────────────────────────────────────────────

    function test_update_collectorIsFrom_noSecondTransfer() public {
        // Deploy with collector == admin (who also holds initial supply)
        Token t = _deployToken(500, admin, admin); // 5% fee, collector = admin = holder

        address recipient = address(0xBBBB);
        uint256 sendAmount = 10_000;
        uint256 adminBefore = t.balanceOf(admin);

        t.transfer(recipient, sendAmount);

        uint256 feeAmount = (sendAmount * 500) / 10000; // 500 bps = 5% = 500
        uint256 netAmount = sendAmount - feeAmount;

        // Recipient gets net
        assertEq(t.balanceOf(recipient), netAmount);
        // Admin (== collector) deducted only netAmount (fee stays in admin's balance)
        assertEq(t.balanceOf(admin), adminBefore - netAmount);
    }

    // ─────────────────────────────────────────────
    // FUZZ: deploy with various valid fee values
    // ─────────────────────────────────────────────

    function testFuzz_init_validFeeRange(uint16 fee_) public {
        vm.assume(fee_ <= 999);
        Token t = _deployToken(fee_, collector, admin);
        assertEq(t.fee(), fee_);
    }

    function testFuzz_init_invalidFeeReverts(uint16 fee_) public {
        vm.assume(fee_ > 999);
        Token impl = new Token();
        bytes memory initData = abi.encodeWithSelector(
            Token.initialize.selector,
            "Test Token", "TEST", INITIAL_SUPPLY, admin, fee_, collector, admin
        );
        vm.expectRevert();
        new UUPSProxy(address(impl), initData);
    }
}
