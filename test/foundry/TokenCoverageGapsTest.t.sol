// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../../contracts/Token.sol";
import "./UUPSProxy.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title TokenCoverageGapsTest
 * @dev Tests targeting remaining structural coverage gaps (API v2.0.0):
 *
 *   1. __ERC20TransferFee_init — transferFeeBps > MAX_TRANSFER_FEE_BPS (100) → FeeExceedsMaximum
 *   2. __ERC20TransferFee_init — feeCollector_ == address(0) → InvalidFeeCollector
 *   3. __ERC20CustodyFee_init — custodyFeeBps > MAX_CUSTODY_FEE_BPS (200) → CustodyFeeExceedsMaximum
 *   4. __ERC20CustodyFee_init — custodyTreasury_ == address(0) → InvalidCustodyTreasury
 *   5. Token.initialize — defaultAdmin_ == address(0) → InvalidAdmin
 *   6. ERC20RecoverableUpgradeable.recoverERC20 — transfer() returns false → SafeERC20FailedOperation
 *   7. Token._update collector == from with feeAmount > 0 branch (fee stays, no 2nd transfer)
 *   8. Token._update mint path (from == address(0)) → no fee, no security checks, pause enforced
 *   9. Token._update burn path (to == address(0)) → no fee, no security checks, pause enforced
 *  10. Token._update transfer with feeAmount == 0 → else branch (plain ERC-20, single Transfer)
 *
 * Init-validation tests deploy through OZ ERC1967Proxy, which bubbles the
 * original revert data, so custom errors can be asserted precisely (the local
 * UUPSProxy helper wraps init failures in a generic string revert).
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
    address public treasury;
    address public user;

    uint256 constant INITIAL_SUPPLY = 500_000 * 10 ** 18;
    uint256 constant CUSTODY_FEE_BPS = 50; // 0.5%

    bytes32 constant TRANSFER_EVENT_SIG = keccak256("Transfer(address,address,uint256)");

    function setUp() public {
        admin = address(this);
        collector = address(0xC011EC70);
        treasury = address(0x7EEA5041);
        user = address(0xA001);
    }

    // ─────────────────────────────────────────────
    // Helpers: initialize calldata + proxy deploy
    // ─────────────────────────────────────────────

    /// @dev Build initialize calldata (v2.0.0 — 9 parameters)
    function _initData(
        address holder_,
        uint256 transferFeeBps_,
        address collector_,
        uint256 custodyFeeBps_,
        address treasury_,
        address admin_
    ) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(
            Token.initialize.selector,
            "Test Token",
            "TEST",
            INITIAL_SUPPLY,
            holder_,
            transferFeeBps_,
            collector_,
            custodyFeeBps_,
            treasury_,
            admin_
        );
    }

    /// @dev Deploy a fresh token proxy and grant the operational roles
    function _deployToken(uint256 fee_, address collector_, address holder_) internal returns (Token t) {
        Token impl = new Token();
        UUPSProxy proxy =
            new UUPSProxy(address(impl), _initData(holder_, fee_, collector_, CUSTODY_FEE_BPS, treasury, admin));
        t = Token(payable(address(proxy)));
        // Init grants DEFAULT_ADMIN / UPGRADER / FEE_MANAGER / RECOVERER only;
        // operational roles are granted here in the fixture.
        t.grantRole(t.MINTER_ROLE(), admin);
        t.grantRole(t.BURNER_ROLE(), admin);
        t.grantRole(t.PAUSER_ROLE(), admin);
        t.grantRole(t.FREEZER_ROLE(), admin);
        t.grantRole(t.BLOCKER_ROLE(), admin);
    }

    /// @dev Count the Transfer events among recorded logs
    function _countTransferLogs(Vm.Log[] memory logs) internal pure returns (uint256 count) {
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == TRANSFER_EVENT_SIG) {
                count++;
            }
        }
    }

    // ─────────────────────────────────────────────
    // 1. __ERC20TransferFee_init — transferFeeBps > MAX_TRANSFER_FEE_BPS
    // ─────────────────────────────────────────────

    function test_init_transferFeeExceedsMax_reverts() public {
        Token impl = new Token();
        bytes memory initData = _initData(admin, 101, collector, CUSTODY_FEE_BPS, treasury, admin);

        vm.expectRevert(abi.encodeWithSelector(ERC20TransferFeeUpgradeable.FeeExceedsMaximum.selector, 101, 100));
        new ERC1967Proxy(address(impl), initData);
    }

    function test_init_transferFeeAtMax_succeeds() public {
        Token t = _deployToken(100, collector, admin);
        assertEq(t.transferFeeBps(), 100);
        assertEq(t.MAX_TRANSFER_FEE_BPS(), 100);
    }

    // ─────────────────────────────────────────────
    // 2. __ERC20TransferFee_init — feeCollector_ == address(0)
    // ─────────────────────────────────────────────

    function test_init_zeroFeeCollector_reverts() public {
        Token impl = new Token();
        bytes memory initData = _initData(admin, 10, address(0), CUSTODY_FEE_BPS, treasury, admin);

        vm.expectRevert(ERC20TransferFeeUpgradeable.InvalidFeeCollector.selector);
        new ERC1967Proxy(address(impl), initData);
    }

    // ─────────────────────────────────────────────
    // 3. __ERC20CustodyFee_init — custodyFeeBps > MAX_CUSTODY_FEE_BPS
    // ─────────────────────────────────────────────

    function test_init_custodyFeeExceedsMax_reverts() public {
        Token impl = new Token();
        bytes memory initData = _initData(admin, 10, collector, 201, treasury, admin);

        vm.expectRevert(abi.encodeWithSelector(ERC20CustodyFeeUpgradeable.CustodyFeeExceedsMaximum.selector, 201, 200));
        new ERC1967Proxy(address(impl), initData);
    }

    function test_init_custodyFeeAtMax_succeeds() public {
        Token impl = new Token();
        UUPSProxy proxy = new UUPSProxy(address(impl), _initData(admin, 10, collector, 200, treasury, admin));
        Token t = Token(payable(address(proxy)));
        assertEq(t.custodyFeeBps(), 200);
        assertEq(t.MAX_CUSTODY_FEE_BPS(), 200);
    }

    // ─────────────────────────────────────────────
    // 4. __ERC20CustodyFee_init — custodyTreasury_ == address(0)
    // ─────────────────────────────────────────────

    function test_init_zeroCustodyTreasury_reverts() public {
        Token impl = new Token();
        bytes memory initData = _initData(admin, 10, collector, CUSTODY_FEE_BPS, address(0), admin);

        vm.expectRevert(ERC20CustodyFeeUpgradeable.InvalidCustodyTreasury.selector);
        new ERC1967Proxy(address(impl), initData);
    }

    // ─────────────────────────────────────────────
    // 5. initialize — defaultAdmin_ == address(0)
    // ─────────────────────────────────────────────

    function test_init_zeroAdmin_reverts() public {
        Token impl = new Token();
        bytes memory initData = _initData(admin, 10, collector, CUSTODY_FEE_BPS, treasury, address(0));

        vm.expectRevert(Token.InvalidAdmin.selector);
        new ERC1967Proxy(address(impl), initData);
    }

    // ─────────────────────────────────────────────
    // 6. recoverERC20 — transfer() returns false → SafeERC20FailedOperation
    // ─────────────────────────────────────────────

    function test_recoverERC20_transferReturnsFalse_reverts() public {
        Token t = _deployToken(0, collector, admin);

        ReturnFalseMock fakeMock = new ReturnFalseMock();
        fakeMock.mint(address(t), 1000);

        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(fakeMock)));
        t.recoverERC20(address(fakeMock), admin, 500);
    }

    // ─────────────────────────────────────────────
    // 7. _update: mint path (from == address(0)) — no fee, no security checks
    // ─────────────────────────────────────────────

    function test_update_mintPath_noFee() public {
        Token t = _deployToken(100, collector, admin); // max fee (1%)

        uint256 supplyBefore = t.totalSupply();

        // Mint must NOT touch fee logic: single Transfer(0 → user)
        vm.expectEmit(true, true, false, true, address(t));
        emit IERC20.Transfer(address(0), user, 1000);
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

    function test_update_mintPath_bypassesFreezeAndBlock() public {
        Token t = _deployToken(0, collector, admin);
        t.freeze(user);
        t.blockAccount(user);

        // Mint skips the security checks (from == address(0))
        t.mint(user, 1000);
        assertEq(t.balanceOf(user), 1000);
    }

    // ─────────────────────────────────────────────
    // 8. _update: burn path (to == address(0)) — no fee, no security checks
    // ─────────────────────────────────────────────

    function test_update_burnPath_noFee() public {
        Token t = _deployToken(100, collector, admin); // max fee (1%)

        uint256 supplyBefore = t.totalSupply();
        uint256 burnAmount = 1000;

        // admin holds initial supply: single Transfer(admin → 0)
        vm.expectEmit(true, true, false, true, address(t));
        emit IERC20.Transfer(admin, address(0), burnAmount);
        t.burn(admin, burnAmount);

        assertEq(t.totalSupply(), supplyBefore - burnAmount);
        // Fee collector unchanged (burn bypasses fee)
        assertEq(t.balanceOf(collector), 0);
    }

    function test_update_burnPath_pausedReverts() public {
        Token t = _deployToken(0, collector, admin);
        t.pause();

        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        t.burn(admin, 1000);
    }

    function test_update_burnPath_bypassesFreezeAndBlock() public {
        Token t = _deployToken(0, collector, admin);
        t.freeze(admin);
        t.blockAccount(admin);

        uint256 balanceBefore = t.balanceOf(admin);

        // Burn skips the security checks (to == address(0))
        t.burn(admin, 1000);
        assertEq(t.balanceOf(admin), balanceBefore - 1000);
    }

    // ─────────────────────────────────────────────
    // 9. _update: transfer with feeAmount == 0 takes the else branch
    // ─────────────────────────────────────────────

    function test_update_zeroFee_normalTransfer() public {
        Token t = _deployToken(0, collector, admin);
        uint256 amount = 5000;

        uint256 userBefore = t.balanceOf(user);

        vm.recordLogs();
        t.transfer(user, amount);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        // Plain ERC-20 behaviour: exactly ONE Transfer event, no collector leg
        assertEq(_countTransferLogs(logs), 1);
        assertEq(logs[0].topics[0], TRANSFER_EVENT_SIG);
        assertEq(address(uint160(uint256(logs[0].topics[1]))), admin);
        assertEq(address(uint160(uint256(logs[0].topics[2]))), user);
        assertEq(abi.decode(logs[0].data, (uint256)), amount);

        assertEq(t.balanceOf(user), userBefore + amount);
        assertEq(t.balanceOf(collector), 0);
    }

    // ─────────────────────────────────────────────
    // 10. _update: feeAmount > 0 AND collector == from (fee stays, no 2nd transfer)
    // ─────────────────────────────────────────────

    function test_update_collectorIsFrom_noSecondTransfer() public {
        // Deploy with collector == admin (who also holds initial supply)
        Token t = _deployToken(100, admin, admin); // 1% fee, collector = admin = holder

        address recipient = address(0xBBBB);
        uint256 sendAmount = 10_000;
        uint256 adminBefore = t.balanceOf(admin);
        uint256 supplyBefore = t.totalSupply();

        uint256 feeAmount = (sendAmount * 100) / 10000; // 100 bps = 1% = 100
        uint256 netAmount = sendAmount - feeAmount;

        vm.recordLogs();
        t.transfer(recipient, sendAmount);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        // Single Transfer(from → to, net): the fee leg to the collector is skipped
        assertEq(_countTransferLogs(logs), 1);
        assertEq(address(uint160(uint256(logs[0].topics[1]))), admin);
        assertEq(address(uint160(uint256(logs[0].topics[2]))), recipient);
        assertEq(abi.decode(logs[0].data, (uint256)), netAmount);

        // Recipient gets net
        assertEq(t.balanceOf(recipient), netAmount);
        // Admin (== collector) deducted only netAmount (fee stays in admin's balance)
        assertEq(t.balanceOf(admin), adminBefore - netAmount);
        assertEq(t.totalSupply(), supplyBefore);
    }

    // ─────────────────────────────────────────────
    // FUZZ: deploy with various fee values (transfer + custody)
    // ─────────────────────────────────────────────

    function testFuzz_init_validTransferFeeRange(uint16 fee_) public {
        vm.assume(fee_ <= 100);
        Token t = _deployToken(fee_, collector, admin);
        assertEq(t.transferFeeBps(), fee_);
    }

    function testFuzz_init_invalidTransferFeeReverts(uint16 fee_) public {
        vm.assume(fee_ > 100);
        Token impl = new Token();
        bytes memory initData = _initData(admin, fee_, collector, CUSTODY_FEE_BPS, treasury, admin);

        vm.expectRevert(abi.encodeWithSelector(ERC20TransferFeeUpgradeable.FeeExceedsMaximum.selector, fee_, 100));
        new ERC1967Proxy(address(impl), initData);
    }

    function testFuzz_init_validCustodyFeeRange(uint16 fee_) public {
        vm.assume(fee_ <= 200);
        Token impl = new Token();
        UUPSProxy proxy = new UUPSProxy(address(impl), _initData(admin, 10, collector, fee_, treasury, admin));
        Token t = Token(payable(address(proxy)));
        assertEq(t.custodyFeeBps(), fee_);
    }

    function testFuzz_init_invalidCustodyFeeReverts(uint16 fee_) public {
        vm.assume(fee_ > 200);
        Token impl = new Token();
        bytes memory initData = _initData(admin, 10, collector, fee_, treasury, admin);

        vm.expectRevert(abi.encodeWithSelector(ERC20CustodyFeeUpgradeable.CustodyFeeExceedsMaximum.selector, fee_, 200));
        new ERC1967Proxy(address(impl), initData);
    }

    /// @dev DOCUMENTATIVO: initialHolder = address(0) con supply > 0 salta
    /// silenziosamente il mint iniziale (comportamento voluto: nessun revert)
    function test_init_zeroHolderWithSupply_skipsMintSilently() public {
        Token impl = new Token();
        UUPSProxy proxy = new UUPSProxy(address(impl), _initData(address(0), 10, collector, 50, treasury, admin));
        Token t = Token(payable(address(proxy)));

        assertEq(t.totalSupply(), 0);
    }
}
