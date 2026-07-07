// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../../contracts/Token.sol";
import "../../contracts/mocks/MockERC1363Receiver.sol";
import "./UUPSProxy.sol";

/**
 * @title TokenERC1363Test
 * @dev Foundry tests for ERC-1363 Payable Token extension
 *
 * Behaviour under test:
 *   transferAndCall(to, value)             — transfer no-fee + onTransferReceived callback
 *   transferAndCall(to, value, data)       — with arbitrary data
 *   transferFromAndCall(from, to, value)   — spends allowance + transfer no-fee + callback
 *   approveAndCall(spender, value)         — approve + onApprovalReceived callback
 *   supportsInterface                      — IERC1363 (0xb0202a11) + IERC165 (0x01ffc9a7)
 *
 * Key design note: _transfer1363 → _updateWithoutFee → NO fee but PAUSE/BLOCK/FREEZE apply.
 *
 * Failure modes:
 *   ERC1363TransferFailed — receiver returns wrong selector or reverts
 *   ERC1363ApprovalFailed — spender returns wrong selector or reverts
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

    uint256 constant INITIAL_SUPPLY = 500_000 * 10 ** 18;
    uint256 constant TRANSFER_AMOUNT = 1_000 * 10 ** 18;

    // ERC-165 / ERC-1363 interface IDs
    bytes4 constant IERC165_ID = 0x01ffc9a7;
    bytes4 constant IERC1363_ID = 0xb0202a11;

    function setUp() public {
        admin = address(this);
        sender = address(0xA001);
        eoa = address(0xB001);

        // Deploy token with zero fee to simplify balance assertions
        Token implementation = new Token();
        bytes memory initData = abi.encodeWithSelector(
            Token.initialize.selector,
            "Test Token",
            "TEST",
            INITIAL_SUPPLY,
            sender, // sender holds all initial tokens
            0,      // zero fee
            address(0x200),
            admin
        );
        UUPSProxy proxy = new UUPSProxy(address(implementation), initData);
        token = Token(payable(address(proxy)));

        // Grant roles
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
        // No fee deducted (fee=0 and no fee via _updateWithoutFee path)
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
        vm.expectRevert(ERC20_1363Upgradeable.ERC1363TransferFailed.selector);
        token.transferAndCall(address(badReceiver), TRANSFER_AMOUNT);
    }

    function test_transferAndCall_toRevertingReceiverReverts() public {
        vm.prank(sender);
        vm.expectRevert(ERC20_1363Upgradeable.ERC1363TransferFailed.selector);
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
        token.blockUser(sender);

        vm.prank(sender);
        vm.expectRevert(ERC20RestrictedUpgradeable.AccountBlocked.selector);
        token.transferAndCall(eoa, TRANSFER_AMOUNT);
    }

    function test_transferAndCall_frozenSenderReverts() public {
        token.freeze(sender, TRANSFER_AMOUNT);

        vm.prank(sender);
        vm.expectRevert(ERC20FreezableUpgradeable.AccountFrozen.selector);
        token.transferAndCall(eoa, TRANSFER_AMOUNT);
    }

    function test_transferAndCall_noFeeDeducted() public {
        // Enable a fee — but transferAndCall bypasses it
        vm.prank(admin);
        token.setFee(999); // 9.99%

        uint256 senderBefore = token.balanceOf(sender);
        address feeCollector = token.feeCollector();
        uint256 collectorBefore = token.balanceOf(feeCollector);

        vm.prank(sender);
        token.transferAndCall(eoa, TRANSFER_AMOUNT);

        // Fee collector should NOT receive anything
        assertEq(token.balanceOf(feeCollector), collectorBefore);
        // Sender deducted exactly the transfer amount
        assertEq(token.balanceOf(sender), senderBefore - TRANSFER_AMOUNT);
    }

    // ─────────────────────────────────────────────
    // transferFromAndCall
    // ─────────────────────────────────────────────

    function test_transferFromAndCall_toGoodReceiver() public {
        address spender = address(0xC001);

        // sender approves spender
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

        vm.prank(spender);
        bool ok = token.transferFromAndCall(sender, address(goodReceiver), TRANSFER_AMOUNT, data);

        assertTrue(ok);
        assertEq(token.balanceOf(address(goodReceiver)), TRANSFER_AMOUNT);
    }

    function test_transferFromAndCall_insufficientAllowanceReverts() public {
        address spender = address(0xC003);

        // Approve less than needed
        vm.prank(sender);
        token.approve(spender, TRANSFER_AMOUNT - 1);

        vm.prank(spender);
        vm.expectRevert();
        token.transferFromAndCall(sender, address(goodReceiver), TRANSFER_AMOUNT);
    }

    function test_transferFromAndCall_badReceiverReverts() public {
        address spender = address(0xC004);

        vm.prank(sender);
        token.approve(spender, TRANSFER_AMOUNT);

        vm.prank(spender);
        vm.expectRevert(ERC20_1363Upgradeable.ERC1363TransferFailed.selector);
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
    // approveAndCall
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
        vm.expectRevert(ERC20_1363Upgradeable.ERC1363ApprovalFailed.selector);
        token.approveAndCall(address(badSpender), TRANSFER_AMOUNT);
    }

    function test_approveAndCall_revertingSpenderReverts() public {
        vm.prank(sender);
        vm.expectRevert(ERC20_1363Upgradeable.ERC1363ApprovalFailed.selector);
        token.approveAndCall(address(revertSpender), TRANSFER_AMOUNT);
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
}
