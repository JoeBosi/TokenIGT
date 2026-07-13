// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../../contracts/Token.sol";
import "../../contracts/mocks/MockERC1363Receiver.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {IERC1363Receiver} from "@openzeppelin/contracts/interfaces/IERC1363Receiver.sol";
import {IERC1363Spender} from "@openzeppelin/contracts/interfaces/IERC1363Spender.sol";
import "./UUPSProxy.sol";

/**
 * @title TokenERC1363Test
 * @dev Foundry tests for ERC-1363 Payable Token extension (v2.0.0 API)
 *
 * Behaviour under test:
 *   transferAndCall(to, value)             — GROSS transfer + onTransferReceived callback
 *   transferAndCall(to, value, data)       — with arbitrary data
 *   transferFromAndCall(from, to, value)   — spends GROSS allowance + gross transfer + callback
 *   approveAndCall(spender, value)         — approve + onApprovalReceived callback (unchanged)
 *   supportsInterface                      — IERC1363 (0xb0202a11) + IERC165 (0x01ffc9a7)
 *
 * Key design note (v2 GROSS semantics): _transfer1363/_transferFrom1363 → _grossTransfer:
 *   the recipient receives EXACTLY `value`, the sender pays value + fee, the collector
 *   receives the fee. For transferFromAndCall the allowance must cover the GROSS
 *   (value + fee) and is consumed for value + fee. Callbacks receive `value` (the net
 *   received == value). PAUSE/BLOCK/FREEZE still apply. With fee = 0 or exempt parties
 *   the behaviour is identical to a plain ERC-20 transfer (single Transfer event).
 *
 * Failure modes:
 *   ERC1363TransferFailed     — receiver returns wrong selector or reverts
 *   ERC1363ApprovalFailed     — spender returns wrong selector or reverts
 *   ERC20InsufficientAllowance — transferFromAndCall allowance below value + fee
 *   ERC20InsufficientBalance   — sender balance below value + fee
 */

/// @dev Receiver that always returns the wrong selector (simulates non-compliant contract)
contract BadReceiver {
    function onTransferReceived(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return bytes4(0xdeadbeef);
    }
}

/// @dev Receiver that always reverts (simulates a reverting callback)
contract RevertingReceiver {
    function onTransferReceived(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        revert("I always revert");
    }
}

/// @dev Spender that always returns wrong selector
contract BadSpender {
    function onApprovalReceived(address, uint256, bytes calldata) external pure returns (bytes4) {
        return bytes4(0xdeadbeef);
    }
}

/// @dev Spender that always reverts
contract RevertingSpender {
    function onApprovalReceived(address, uint256, bytes calldata) external pure returns (bytes4) {
        revert("I always revert");
    }
}

contract TokenERC1363Test is Test {
    Token public token;
    MockERC1363Receiver public goodReceiver;
    BadReceiver public badReceiver;
    RevertingReceiver public revertReceiver;
    BadSpender public badSpender;
    RevertingSpender public revertSpender;

    address public admin;
    address public sender;
    address public eoa; // plain EOA (no code) — transferAndCall to EOA should work without callback

    address constant FEE_COLLECTOR = address(0x200);
    address constant CUSTODY_TREASURY = address(0x300);

    uint256 constant INITIAL_SUPPLY = 500_000 * 10 ** 18;
    uint256 constant TRANSFER_AMOUNT = 1_000 * 10 ** 18;
    uint256 constant FEE_BPS = 100; // 1% — the v2 cap (MAX_TRANSFER_FEE_BPS)
    uint256 constant FEE_AMOUNT = (TRANSFER_AMOUNT * FEE_BPS) / 10000; // 10 * 10**18

    // ERC-165 / ERC-1363 interface IDs
    bytes4 constant IERC165_ID = 0x01ffc9a7;
    bytes4 constant IERC1363_ID = 0xb0202a11;

    function setUp() public {
        admin = address(this);
        sender = address(0xA001);
        eoa = address(0xB001);

        // Deploy token with zero transfer fee to keep base assertions simple;
        // gross-fee tests enable the fee explicitly via setTransferFeeBps
        Token implementation = new Token();
        bytes memory initData = abi.encodeWithSelector(
            Token.initialize.selector,
            "Test Token",
            "TEST",
            INITIAL_SUPPLY,
            sender, // sender holds all initial tokens
            0, // transfer fee disabled by default
            FEE_COLLECTOR,
            50, // custody fee bps (not exercised in this suite)
            CUSTODY_TREASURY,
            admin,
            3 days
        );
        UUPSProxy proxy = new UUPSProxy(address(implementation), initData);
        token = Token(payable(address(proxy)));

        // Grant roles (init only grants governance roles to admin)
        token.grantRole(token.MINTER_ROLE(), admin);
        token.grantRole(token.PAUSER_ROLE(), admin);
        token.grantRole(token.FREEZER_ROLE(), admin);
        token.grantRole(token.BLOCKER_ROLE(), admin);

        // Deploy mock contracts
        goodReceiver = new MockERC1363Receiver();
        badReceiver = new BadReceiver();
        revertReceiver = new RevertingReceiver();
        badSpender = new BadSpender();
        revertSpender = new RevertingSpender();
    }

    /// @dev Enable the transfer fee at the v2 cap (1%)
    function _enableFee() internal {
        vm.prank(admin);
        token.setTransferFeeBps(FEE_BPS);
    }

    // ─────────────────────────────────────────────
    // supportsInterface
    // ─────────────────────────────────────────────

    function test_supportsInterface_ERC165() public view {
        assertTrue(token.supportsInterface(IERC165_ID));
    }

    function test_supportsInterface_ERC1363() public view {
        assertTrue(token.supportsInterface(IERC1363_ID));
    }

    function test_supportsInterface_unknownReturnsFalse() public view {
        assertFalse(token.supportsInterface(0xdeadbeef));
    }

    // ─────────────────────────────────────────────
    // transferAndCall — to EOA (no callback)
    // ─────────────────────────────────────────────

    function test_transferAndCall_toEOA_noCallback() public {
        uint256 senderBefore = token.balanceOf(sender);
        uint256 eoaBefore = token.balanceOf(eoa);

        vm.prank(sender);
        bool ok = token.transferAndCall(eoa, TRANSFER_AMOUNT);

        assertTrue(ok);
        // fee = 0 → sender pays exactly value, recipient receives exactly value
        assertEq(token.balanceOf(sender), senderBefore - TRANSFER_AMOUNT);
        assertEq(token.balanceOf(eoa), eoaBefore + TRANSFER_AMOUNT);
    }

    // ─────────────────────────────────────────────
    // transferAndCall — to compliant contract receiver
    // ─────────────────────────────────────────────

    function test_transferAndCall_toGoodReceiver() public {
        uint256 senderBefore = token.balanceOf(sender);
        uint256 receiverBefore = token.balanceOf(address(goodReceiver));

        vm.prank(sender);
        bool ok = token.transferAndCall(address(goodReceiver), TRANSFER_AMOUNT);

        assertTrue(ok);
        assertEq(token.balanceOf(sender), senderBefore - TRANSFER_AMOUNT);
        assertEq(token.balanceOf(address(goodReceiver)), receiverBefore + TRANSFER_AMOUNT);
    }

    function test_transferAndCall_withData_toGoodReceiver() public {
        bytes memory data = abi.encode(uint256(42), "hello");

        // The callback receives `value` (the net received == value) and the data
        vm.expectEmit(true, true, false, true, address(goodReceiver));
        emit MockERC1363Receiver.TransferReceived(sender, sender, TRANSFER_AMOUNT, data);

        vm.prank(sender);
        bool ok = token.transferAndCall(address(goodReceiver), TRANSFER_AMOUNT, data);

        assertTrue(ok);
        assertEq(token.balanceOf(address(goodReceiver)), TRANSFER_AMOUNT);
    }

    // ─────────────────────────────────────────────
    // transferAndCall — to non-compliant contract (revert cases)
    // ─────────────────────────────────────────────

    function test_transferAndCall_toContractWrongSelectorReverts() public {
        vm.prank(sender);
        vm.expectRevert(ERC1363PayableUpgradeable.ERC1363TransferFailed.selector);
        token.transferAndCall(address(badReceiver), TRANSFER_AMOUNT);
    }

    function test_transferAndCall_toRevertingReceiverReverts() public {
        vm.prank(sender);
        vm.expectRevert(ERC1363PayableUpgradeable.ERC1363TransferFailed.selector);
        token.transferAndCall(address(revertReceiver), TRANSFER_AMOUNT);
    }

    // ─────────────────────────────────────────────
    // transferAndCall — security checks still apply
    // ─────────────────────────────────────────────

    function test_transferAndCall_pausedReverts() public {
        token.pause();

        vm.prank(sender);
        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        token.transferAndCall(eoa, TRANSFER_AMOUNT);
    }

    function test_transferAndCall_blockedSenderReverts() public {
        token.blockAccount(sender);

        vm.prank(sender);
        vm.expectRevert(ERC20BlocklistUpgradeable.AccountBlocked.selector);
        token.transferAndCall(eoa, TRANSFER_AMOUNT);
    }

    function test_transferAndCall_frozenSenderReverts() public {
        token.freeze(sender);

        vm.prank(sender);
        vm.expectRevert(ERC20FreezableUpgradeable.AccountFrozen.selector);
        token.transferAndCall(eoa, TRANSFER_AMOUNT);
    }

    // ─────────────────────────────────────────────
    // transferAndCall — GROSS fee semantics (v2)
    // ─────────────────────────────────────────────

    function test_transferAndCall_grossFee_recipientReceivesExactValue() public {
        _enableFee();

        uint256 senderBefore = token.balanceOf(sender);
        uint256 eoaBefore = token.balanceOf(eoa);
        uint256 collectorBefore = token.balanceOf(FEE_COLLECTOR);

        // Two Transfer events, in order: (from → to, value) then (from → collector, fee)
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(sender, eoa, TRANSFER_AMOUNT);
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(sender, FEE_COLLECTOR, FEE_AMOUNT);

        vm.prank(sender);
        bool ok = token.transferAndCall(eoa, TRANSFER_AMOUNT);

        assertTrue(ok);
        // Recipient receives EXACTLY value; sender pays value + fee; collector gets the fee
        assertEq(token.balanceOf(eoa), eoaBefore + TRANSFER_AMOUNT);
        assertEq(token.balanceOf(sender), senderBefore - TRANSFER_AMOUNT - FEE_AMOUNT);
        assertEq(token.balanceOf(FEE_COLLECTOR), collectorBefore + FEE_AMOUNT);
    }

    function test_transferAndCall_grossFee_callbackReceivesValue() public {
        _enableFee();
        bytes memory data = abi.encode("gross");

        // The callback receives `value` (the exact amount credited to the receiver)
        vm.expectEmit(true, true, false, true, address(goodReceiver));
        emit MockERC1363Receiver.TransferReceived(sender, sender, TRANSFER_AMOUNT, data);

        vm.prank(sender);
        bool ok = token.transferAndCall(address(goodReceiver), TRANSFER_AMOUNT, data);

        assertTrue(ok);
        assertEq(token.balanceOf(address(goodReceiver)), TRANSFER_AMOUNT);
    }

    function test_transferAndCall_feeZero_identicalToPlainERC20() public {
        // fee = 0 (fixture default) → single Transfer event, nothing to the collector
        uint256 senderBefore = token.balanceOf(sender);
        uint256 collectorBefore = token.balanceOf(FEE_COLLECTOR);

        vm.recordLogs();
        vm.prank(sender);
        bool ok = token.transferAndCall(eoa, TRANSFER_AMOUNT);
        assertTrue(ok);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 transferTopic = keccak256("Transfer(address,address,uint256)");
        uint256 transferCount = 0;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(token) && logs[i].topics[0] == transferTopic) {
                transferCount++;
                assertEq(address(uint160(uint256(logs[i].topics[1]))), sender);
                assertEq(address(uint160(uint256(logs[i].topics[2]))), eoa);
                assertEq(abi.decode(logs[i].data, (uint256)), TRANSFER_AMOUNT);
            }
        }
        assertEq(transferCount, 1);

        assertEq(token.balanceOf(sender), senderBefore - TRANSFER_AMOUNT);
        assertEq(token.balanceOf(eoa), TRANSFER_AMOUNT);
        assertEq(token.balanceOf(FEE_COLLECTOR), collectorBefore);
    }

    function test_transferAndCall_senderExempt_noFee() public {
        _enableFee();
        vm.prank(admin);
        token.addTransferFeeExempt(sender);

        uint256 senderBefore = token.balanceOf(sender);
        uint256 collectorBefore = token.balanceOf(FEE_COLLECTOR);

        vm.prank(sender);
        bool ok = token.transferAndCall(eoa, TRANSFER_AMOUNT);

        assertTrue(ok);
        // Exempt sender pays exactly value, no fee to the collector
        assertEq(token.balanceOf(sender), senderBefore - TRANSFER_AMOUNT);
        assertEq(token.balanceOf(eoa), TRANSFER_AMOUNT);
        assertEq(token.balanceOf(FEE_COLLECTOR), collectorBefore);
    }

    function test_transferAndCall_recipientExempt_noFee() public {
        _enableFee();
        vm.prank(admin);
        token.addTransferFeeExempt(eoa);

        uint256 senderBefore = token.balanceOf(sender);
        uint256 collectorBefore = token.balanceOf(FEE_COLLECTOR);

        vm.prank(sender);
        bool ok = token.transferAndCall(eoa, TRANSFER_AMOUNT);

        assertTrue(ok);
        assertEq(token.balanceOf(sender), senderBefore - TRANSFER_AMOUNT);
        assertEq(token.balanceOf(eoa), TRANSFER_AMOUNT);
        assertEq(token.balanceOf(FEE_COLLECTOR), collectorBefore);
    }

    function test_transferAndCall_insufficientBalanceForGrossReverts() public {
        // Fund a fresh account with EXACTLY value while fee is 0
        address poor = address(0xD001);
        vm.prank(sender);
        assertTrue(token.transfer(poor, TRANSFER_AMOUNT));

        _enableFee();

        // Sender must cover value + fee: value is settled, then the fee leg fails
        vm.prank(poor);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, poor, 0, FEE_AMOUNT));
        token.transferAndCall(eoa, TRANSFER_AMOUNT);
    }

    // ─────────────────────────────────────────────
    // transferFromAndCall
    // ─────────────────────────────────────────────

    function test_transferFromAndCall_toGoodReceiver() public {
        address spender = address(0xC001);

        // sender approves spender (fee = 0 → gross == value)
        vm.prank(sender);
        token.approve(spender, TRANSFER_AMOUNT);

        uint256 senderBefore = token.balanceOf(sender);
        uint256 receiverBefore = token.balanceOf(address(goodReceiver));

        vm.prank(spender);
        bool ok = token.transferFromAndCall(sender, address(goodReceiver), TRANSFER_AMOUNT);

        assertTrue(ok);
        assertEq(token.balanceOf(sender), senderBefore - TRANSFER_AMOUNT);
        assertEq(token.balanceOf(address(goodReceiver)), receiverBefore + TRANSFER_AMOUNT);
        // Allowance fully consumed
        assertEq(token.allowance(sender, spender), 0);
    }

    function test_transferFromAndCall_withData() public {
        address spender = address(0xC002);
        bytes memory data = abi.encode("payload");

        vm.prank(sender);
        token.approve(spender, TRANSFER_AMOUNT);

        // Callback: operator = spender, from = sender, value = amount received
        vm.expectEmit(true, true, false, true, address(goodReceiver));
        emit MockERC1363Receiver.TransferReceived(spender, sender, TRANSFER_AMOUNT, data);

        vm.prank(spender);
        bool ok = token.transferFromAndCall(sender, address(goodReceiver), TRANSFER_AMOUNT, data);

        assertTrue(ok);
        assertEq(token.balanceOf(address(goodReceiver)), TRANSFER_AMOUNT);
    }

    function test_transferFromAndCall_insufficientAllowanceReverts() public {
        address spender = address(0xC003);

        // Approve less than needed (fee = 0 → gross == value)
        vm.prank(sender);
        token.approve(spender, TRANSFER_AMOUNT - 1);

        vm.prank(spender);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, spender, TRANSFER_AMOUNT - 1, TRANSFER_AMOUNT
            )
        );
        token.transferFromAndCall(sender, address(goodReceiver), TRANSFER_AMOUNT);
    }

    function test_transferFromAndCall_badReceiverReverts() public {
        address spender = address(0xC004);

        vm.prank(sender);
        token.approve(spender, TRANSFER_AMOUNT);

        vm.prank(spender);
        vm.expectRevert(ERC1363PayableUpgradeable.ERC1363TransferFailed.selector);
        token.transferFromAndCall(sender, address(badReceiver), TRANSFER_AMOUNT);
    }

    function test_transferFromAndCall_toEOA() public {
        address spender = address(0xC005);

        vm.prank(sender);
        token.approve(spender, TRANSFER_AMOUNT);

        uint256 eoaBefore = token.balanceOf(eoa);
        vm.prank(spender);
        bool ok = token.transferFromAndCall(sender, eoa, TRANSFER_AMOUNT);

        assertTrue(ok);
        assertEq(token.balanceOf(eoa), eoaBefore + TRANSFER_AMOUNT);
    }

    // ─────────────────────────────────────────────
    // transferFromAndCall — GROSS allowance semantics (v2)
    // ─────────────────────────────────────────────

    function test_transferFromAndCall_allowanceExactGross_passes() public {
        _enableFee();
        address spender = address(0xC006);

        // Allowance exactly value + fee (the gross) → succeeds and is fully consumed
        vm.prank(sender);
        token.approve(spender, TRANSFER_AMOUNT + FEE_AMOUNT);

        uint256 senderBefore = token.balanceOf(sender);
        uint256 collectorBefore = token.balanceOf(FEE_COLLECTOR);

        // Two Transfer events (value then fee), then the callback with `value`
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(sender, address(goodReceiver), TRANSFER_AMOUNT);
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(sender, FEE_COLLECTOR, FEE_AMOUNT);
        vm.expectEmit(true, true, false, true, address(goodReceiver));
        emit MockERC1363Receiver.TransferReceived(spender, sender, TRANSFER_AMOUNT, "");

        vm.prank(spender);
        bool ok = token.transferFromAndCall(sender, address(goodReceiver), TRANSFER_AMOUNT);

        assertTrue(ok);
        assertEq(token.balanceOf(address(goodReceiver)), TRANSFER_AMOUNT);
        assertEq(token.balanceOf(sender), senderBefore - TRANSFER_AMOUNT - FEE_AMOUNT);
        assertEq(token.balanceOf(FEE_COLLECTOR), collectorBefore + FEE_AMOUNT);
        // Allowance consumed for the GROSS: value + fee
        assertEq(token.allowance(sender, spender), 0);
    }

    function test_transferFromAndCall_allowanceOnlyValueWithFeeReverts() public {
        _enableFee();
        address spender = address(0xC007);

        // Allowance covers only `value`, not the gross value + fee
        vm.prank(sender);
        token.approve(spender, TRANSFER_AMOUNT);

        vm.prank(spender);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, spender, TRANSFER_AMOUNT, TRANSFER_AMOUNT + FEE_AMOUNT
            )
        );
        token.transferFromAndCall(sender, address(goodReceiver), TRANSFER_AMOUNT);
    }

    /// @dev A5-fix: when `from` IS the fee collector the fee leg is skipped (the
    /// fee stays with `from`), so only `value` leaves `from` and the allowance is
    /// charged exactly `value` — not value + fee.
    function test_transferFromAndCall_fromIsCollector_allowanceChargedValueOnly() public {
        _enableFee();
        // Make the sender itself the fee collector
        vm.prank(admin);
        token.setFeeCollector(sender);
        assertEq(token.feeCollector(), sender);

        address spender = address(0xC008);
        // Allowance of exactly `value` (NOT value + fee) must suffice
        vm.prank(sender);
        token.approve(spender, TRANSFER_AMOUNT);

        uint256 senderBefore = token.balanceOf(sender);

        vm.prank(spender);
        bool ok = token.transferFromAndCall(sender, address(goodReceiver), TRANSFER_AMOUNT);

        assertTrue(ok);
        assertEq(token.balanceOf(address(goodReceiver)), TRANSFER_AMOUNT);
        // from loses only `value` (fee stayed with from), allowance fully consumed
        assertEq(token.balanceOf(sender), senderBefore - TRANSFER_AMOUNT);
        assertEq(token.allowance(sender, spender), 0);
    }

    function test_transferFromAndCall_infiniteAllowanceNotDecremented() public {
        _enableFee();
        address spender = address(0xC008);

        vm.prank(sender);
        token.approve(spender, type(uint256).max);

        vm.prank(spender);
        bool ok = token.transferFromAndCall(sender, address(goodReceiver), TRANSFER_AMOUNT);

        assertTrue(ok);
        assertEq(token.balanceOf(address(goodReceiver)), TRANSFER_AMOUNT);
        // Infinite allowance stays infinite
        assertEq(token.allowance(sender, spender), type(uint256).max);
    }

    function test_transferFromAndCall_senderExempt_allowanceCoversValueOnly() public {
        _enableFee();
        vm.prank(admin);
        token.addTransferFeeExempt(sender);

        address spender = address(0xC009);

        // Exempt sender → fee = 0, so gross == value and this allowance suffices
        vm.prank(sender);
        token.approve(spender, TRANSFER_AMOUNT);

        uint256 senderBefore = token.balanceOf(sender);
        uint256 collectorBefore = token.balanceOf(FEE_COLLECTOR);

        vm.prank(spender);
        bool ok = token.transferFromAndCall(sender, address(goodReceiver), TRANSFER_AMOUNT);

        assertTrue(ok);
        assertEq(token.balanceOf(address(goodReceiver)), TRANSFER_AMOUNT);
        assertEq(token.balanceOf(sender), senderBefore - TRANSFER_AMOUNT);
        assertEq(token.balanceOf(FEE_COLLECTOR), collectorBefore);
        assertEq(token.allowance(sender, spender), 0);
    }

    // ─────────────────────────────────────────────
    // approveAndCall (unchanged in v2 — no fee involved)
    // ─────────────────────────────────────────────

    function test_approveAndCall_toGoodSpender() public {
        vm.prank(sender);
        bool ok = token.approveAndCall(address(goodReceiver), TRANSFER_AMOUNT);

        assertTrue(ok);
        // Allowance is set
        assertEq(token.allowance(sender, address(goodReceiver)), TRANSFER_AMOUNT);
    }

    function test_approveAndCall_withData() public {
        bytes memory data = abi.encode("approve-data");

        // Callback receives owner and the approved value
        vm.expectEmit(true, true, false, true, address(goodReceiver));
        emit MockERC1363Receiver.ApprovalReceived(sender, address(token), TRANSFER_AMOUNT, data);

        vm.prank(sender);
        bool ok = token.approveAndCall(address(goodReceiver), TRANSFER_AMOUNT, data);

        assertTrue(ok);
        assertEq(token.allowance(sender, address(goodReceiver)), TRANSFER_AMOUNT);
    }

    function test_approveAndCall_toEOA_noCallback() public {
        // EOA has no code — _isContract returns false, no callback invoked
        vm.prank(sender);
        bool ok = token.approveAndCall(eoa, TRANSFER_AMOUNT);

        assertTrue(ok);
        assertEq(token.allowance(sender, eoa), TRANSFER_AMOUNT);
    }

    function test_approveAndCall_badSpenderReverts() public {
        vm.prank(sender);
        vm.expectRevert(ERC1363PayableUpgradeable.ERC1363ApprovalFailed.selector);
        token.approveAndCall(address(badSpender), TRANSFER_AMOUNT);
    }

    function test_approveAndCall_revertingSpenderReverts() public {
        vm.prank(sender);
        vm.expectRevert(ERC1363PayableUpgradeable.ERC1363ApprovalFailed.selector);
        token.approveAndCall(address(revertSpender), TRANSFER_AMOUNT);
    }

    function test_approveAndCall_unaffectedByTransferFee() public {
        _enableFee();

        uint256 senderBefore = token.balanceOf(sender);
        uint256 collectorBefore = token.balanceOf(FEE_COLLECTOR);

        vm.prank(sender);
        bool ok = token.approveAndCall(address(goodReceiver), TRANSFER_AMOUNT);

        assertTrue(ok);
        // approveAndCall sets exactly `value`, moves no tokens, pays no fee
        assertEq(token.allowance(sender, address(goodReceiver)), TRANSFER_AMOUNT);
        assertEq(token.balanceOf(sender), senderBefore);
        assertEq(token.balanceOf(FEE_COLLECTOR), collectorBefore);
    }

    // ─────────────────────────────────────────────
    // FUZZ
    // ─────────────────────────────────────────────

    function testFuzz_transferAndCall_exactAmount(uint128 amount) public {
        vm.assume(amount > 0 && amount <= INITIAL_SUPPLY);

        uint256 senderBefore = token.balanceOf(sender);
        uint256 eoaBefore = token.balanceOf(eoa);

        vm.prank(sender);
        bool ok = token.transferAndCall(eoa, amount);

        assertTrue(ok);
        assertEq(token.balanceOf(sender), senderBefore - amount);
        assertEq(token.balanceOf(eoa), eoaBefore + amount);
    }

    function testFuzz_transferAndCall_grossFee(uint128 rawAmount) public {
        _enableFee();
        uint256 amount = bound(uint256(rawAmount), 1, INITIAL_SUPPLY / 2);
        uint256 fee = (amount * FEE_BPS) / 10000;

        uint256 senderBefore = token.balanceOf(sender);
        uint256 eoaBefore = token.balanceOf(eoa);
        uint256 collectorBefore = token.balanceOf(FEE_COLLECTOR);

        vm.prank(sender);
        bool ok = token.transferAndCall(eoa, amount);

        assertTrue(ok);
        // Gross invariant: recipient +amount, collector +fee, sender −(amount + fee)
        assertEq(token.balanceOf(eoa), eoaBefore + amount);
        assertEq(token.balanceOf(FEE_COLLECTOR), collectorBefore + fee);
        assertEq(token.balanceOf(sender), senderBefore - amount - fee);
    }

    /// @dev Reentrancy avversariale: un receiver che rientra nel token durante
    /// onTransferReceived non può corrompere lo stato — il settlement avviene
    /// PRIMA del callback (pattern CEI). Il rientro è un normale transfer dei
    /// fondi già ricevuti; la conservazione dei balance resta esatta.
    function test_transferAndCall_reentrantReceiver_stateConsistent() public {
        _enableFee();
        ReentrantReceiver reentrant = new ReentrantReceiver(token, eoa);

        uint256 amount = 1_000 * 10 ** 18;
        uint256 outerFee = (amount * FEE_BPS) / 10000; // percorso lordo (sender paga)
        uint256 innerFee = (amount * FEE_BPS) / 10000; // re-transfer netto del receiver

        uint256 senderBefore = token.balanceOf(sender);

        vm.prank(sender);
        token.transferAndCall(address(reentrant), amount);

        assertTrue(reentrant.reentered());
        // il receiver ha ricevuto `amount` e l'ha ri-trasferito tutto nel callback
        assertEq(token.balanceOf(address(reentrant)), 0);
        assertEq(token.balanceOf(eoa), amount - innerFee);
        assertEq(token.balanceOf(sender), senderBefore - amount - outerFee);
        assertEq(token.balanceOf(FEE_COLLECTOR), outerFee + innerFee);
    }

    function test_transferAndCall_lowWrongSelectorReverts() public {
        // goodReceiver is a contract, so _isContract(to) is true and the callback runs.
        // Force onTransferReceived to return a selector strictly LESS than
        // ERC1363_RECEIVED (0x88a7ca5c) so that the mutant `retval > ERC1363_RECEIVED`
        // is FALSE (no revert) while the correct `retval != ERC1363_RECEIVED` reverts.
        vm.mockCall(
            address(goodReceiver),
            abi.encodeWithSelector(IERC1363Receiver.onTransferReceived.selector),
            abi.encode(bytes4(0x00000001))
        );

        vm.prank(sender);
        vm.expectRevert(ERC1363PayableUpgradeable.ERC1363TransferFailed.selector);
        token.transferAndCall(address(goodReceiver), TRANSFER_AMOUNT);

        vm.clearMockedCalls();
    }

    function test_approveAndCall_lowWrongSelectorReverts() public {
        // goodReceiver is a contract (also implements IERC1363Spender), so _isContract(spender)
        // is true and onApprovalReceived runs. Force it to return a selector strictly LESS than
        // ERC1363_APPROVED (0x7b04a2d0) so the mutant `retval > ERC1363_APPROVED` is FALSE
        // (no revert) while the correct `retval != ERC1363_APPROVED` reverts.
        vm.mockCall(
            address(goodReceiver),
            abi.encodeWithSelector(IERC1363Spender.onApprovalReceived.selector),
            abi.encode(bytes4(0x00000001))
        );

        vm.prank(sender);
        vm.expectRevert(ERC1363PayableUpgradeable.ERC1363ApprovalFailed.selector);
        token.approveAndCall(address(goodReceiver), TRANSFER_AMOUNT);

        vm.clearMockedCalls();
    }

    function test_supportsInterface_lowUnknownReturnsFalse() public view {
        // 0x00000001 is not any real interfaceId supported by the token, and it is
        // strictly LESS than INTERFACE_ID_ERC1363 (0xb0202a11). Clean `==` -> false;
        // the mutant `interfaceId <= INTERFACE_ID_ERC1363` -> true (wrongly claims support).
        assertFalse(token.supportsInterface(0x00000001));
    }
}

/// @dev Receiver malevolo che rientra nel token durante il callback ERC-1363
contract ReentrantReceiver {
    Token public token;
    address public exitTarget;
    bool public reentered;

    constructor(Token token_, address exitTarget_) {
        token = token_;
        exitTarget = exitTarget_;
    }

    function onTransferReceived(address, address, uint256 value, bytes calldata) external returns (bytes4) {
        if (!reentered) {
            reentered = true;
            // rientro nel token: i balance sono già regolati (CEI)
            token.transfer(exitTarget, value);
        }
        return this.onTransferReceived.selector;
    }
}
