// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../../contracts/Token.sol";
import "./UUPSProxy.sol";

/**
 * @title TokenEIP3009Test
 * @dev Foundry tests for EIP-3009 Transfer With Authorization
 *
 * Behaviour under test:
 *   transferWithAuthorization  — validates EIP-712 sig, time window, nonce reuse, marks nonce used
 *   receiveWithAuthorization   — same as above + enforces msg.sender == to
 *   cancelAuthorization        — marks nonce used via cancel sig, prevents later use
 *   authorizationState         — getter
 *
 * Key design note: _executeTransfer calls _updateWithoutFee → NO fee deducted,
 *   but PAUSE / BLOCK / FREEZE security checks still apply.
 */
contract TokenEIP3009Test is Test {
    Token public token;

    // EIP-712 type hashes (must match exactly what the contract uses)
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
        keccak256(
            "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
        );
    bytes32 public constant CANCEL_AUTHORIZATION_TYPEHASH =
        keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");

    address public admin;
    uint256 public signerPk;
    address public signer;
    address public recipient;

    uint256 constant INITIAL_SUPPLY = 1_000_000 * 10 ** 18;
    uint256 constant INITIAL_FEE = 100; // 1%
    uint256 constant TRANSFER_AMOUNT = 1_000 * 10 ** 18;

    function setUp() public {
        admin = address(this);
        recipient = address(0xBEEF);

        // Generate a deterministic signer key-pair
        signerPk = 0xA11CE;
        signer = vm.addr(signerPk);

        // Deploy token
        Token implementation = new Token();
        bytes memory initData = abi.encodeWithSelector(
            Token.initialize.selector,
            "Test Token",
            "TEST",
            INITIAL_SUPPLY,
            signer, // initial holder = signer (has tokens to transfer)
            INITIAL_FEE,
            address(0x200), // fee collector
            admin
        );
        UUPSProxy proxy = new UUPSProxy(address(implementation), initData);
        token = Token(payable(address(proxy)));

        // Grant all roles to admin for setup operations
        token.grantRole(token.MINTER_ROLE(), admin);
        token.grantRole(token.PAUSER_ROLE(), admin);
        token.grantRole(token.FREEZER_ROLE(), admin);
        token.grantRole(token.BLOCKER_ROLE(), admin);
    }

    // ─────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────

    /// @dev Build and sign a TransferWithAuthorization EIP-712 struct
    function _signTransfer(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint256 pk
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(
                TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
                from,
                to,
                value,
                validAfter,
                validBefore,
                nonce
            )
        );
        bytes32 digest = _hashTypedData(structHash);
        (v, r, s) = vm.sign(pk, digest);
    }

    /// @dev Build and sign a CancelAuthorization EIP-712 struct
    function _signCancel(
        address authorizer,
        bytes32 nonce,
        uint256 pk
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce)
        );
        bytes32 digest = _hashTypedData(structHash);
        (v, r, s) = vm.sign(pk, digest);
    }

    /// @dev Reconstruct EIP-712 domain separator to hash typed data
    function _hashTypedData(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
    }

    // ─────────────────────────────────────────────
    // transferWithAuthorization — HAPPY PATH
    // ─────────────────────────────────────────────

    function test_transferWithAuthorization_valid() public {
        bytes32 nonce = keccak256("nonce-1");
        uint256 validAfter = block.timestamp - 1;
        uint256 validBefore = block.timestamp + 1 hours;

        uint256 balanceBefore = token.balanceOf(recipient);
        assertFalse(token.authorizationState(signer, nonce));

        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(
            signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, signerPk
        );

        // Expect AuthorizationUsed event
        vm.expectEmit(true, true, false, false, address(token));
        emit ERC20EIP3009Upgradeable.AuthorizationUsed(signer, nonce);

        token.transferWithAuthorization(
            signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, v, r, s
        );

        // No fee deducted (uses _executeTransfer → _updateWithoutFee)
        assertEq(token.balanceOf(recipient), balanceBefore + TRANSFER_AMOUNT);
        assertEq(token.balanceOf(signer), INITIAL_SUPPLY - TRANSFER_AMOUNT);
        assertTrue(token.authorizationState(signer, nonce));
    }

    function test_transferWithAuthorization_nonce_markedUsed() public {
        bytes32 nonce = keccak256("nonce-used");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(
            signer, recipient, 1, validAfter, validBefore, nonce, signerPk
        );

        token.transferWithAuthorization(signer, recipient, 1, validAfter, validBefore, nonce, v, r, s);

        assertTrue(token.authorizationState(signer, nonce));
    }

    // ─────────────────────────────────────────────
    // transferWithAuthorization — REVERT cases
    // ─────────────────────────────────────────────

    function test_transferWithAuthorization_replayReverts() public {
        bytes32 nonce = keccak256("nonce-replay");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(
            signer, recipient, 1, validAfter, validBefore, nonce, signerPk
        );

        // First call succeeds
        token.transferWithAuthorization(signer, recipient, 1, validAfter, validBefore, nonce, v, r, s);

        // Second call with same nonce must revert
        vm.expectRevert(ERC20EIP3009Upgradeable.AuthorizationAlreadyUsed.selector);
        token.transferWithAuthorization(signer, recipient, 1, validAfter, validBefore, nonce, v, r, s);
    }

    function test_transferWithAuthorization_expiredReverts() public {
        bytes32 nonce = keccak256("nonce-expired");
        uint256 validAfter = 0;
        // validBefore in the past (current timestamp is already >= validBefore)
        uint256 validBefore = block.timestamp; // block.timestamp >= validBefore → expired

        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(
            signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, signerPk
        );

        vm.expectRevert(ERC20EIP3009Upgradeable.AuthorizationExpired.selector);
        token.transferWithAuthorization(
            signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, v, r, s
        );
    }

    function test_transferWithAuthorization_notYetValidReverts() public {
        bytes32 nonce = keccak256("nonce-future");
        uint256 validAfter = block.timestamp + 1 hours; // in the future
        uint256 validBefore = block.timestamp + 2 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(
            signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, signerPk
        );

        vm.expectRevert(ERC20EIP3009Upgradeable.AuthorizationNotYetValid.selector);
        token.transferWithAuthorization(
            signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, v, r, s
        );
    }

    function test_transferWithAuthorization_invalidSignatureReverts() public {
        bytes32 nonce = keccak256("nonce-badsig");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        // Sign with a different private key
        uint256 wrongPk = 0xBAD;
        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(
            signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, wrongPk
        );

        vm.expectRevert(ERC20EIP3009Upgradeable.InvalidSignature.selector);
        token.transferWithAuthorization(
            signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, v, r, s
        );
    }

    function test_transferWithAuthorization_noFeeDeducted() public {
        // Set 9.99% fee — but EIP-3009 bypasses it
        vm.prank(admin);
        token.setFee(999);

        bytes32 nonce = keccak256("nonce-nofee");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(
            signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, signerPk
        );

        uint256 recipientBefore = token.balanceOf(recipient);
        token.transferWithAuthorization(
            signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, v, r, s
        );

        // Recipient receives full amount (no fee)
        assertEq(token.balanceOf(recipient), recipientBefore + TRANSFER_AMOUNT);
    }

    function test_transferWithAuthorization_pausedReverts() public {
        token.pause();

        bytes32 nonce = keccak256("nonce-paused");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(
            signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, signerPk
        );

        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        token.transferWithAuthorization(
            signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, v, r, s
        );
    }

    function test_transferWithAuthorization_frozenFromReverts() public {
        token.freezeAll(signer);

        bytes32 nonce = keccak256("nonce-frozen");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(
            signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, signerPk
        );

        vm.expectRevert(ERC20FreezableUpgradeable.AccountFrozen.selector);
        token.transferWithAuthorization(
            signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, v, r, s
        );
    }

    function test_transferWithAuthorization_blockedFromReverts() public {
        token.blockUser(signer);

        bytes32 nonce = keccak256("nonce-blocked");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(
            signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, signerPk
        );

        vm.expectRevert(ERC20RestrictedUpgradeable.AccountBlocked.selector);
        token.transferWithAuthorization(
            signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, v, r, s
        );
    }

    // ─────────────────────────────────────────────
    // receiveWithAuthorization
    // ─────────────────────────────────────────────

    function test_receiveWithAuthorization_valid() public {
        bytes32 nonce = keccak256("nonce-recv-1");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(
            signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, signerPk
        );

        uint256 recipientBefore = token.balanceOf(recipient);

        // Must be called BY recipient
        vm.prank(recipient);
        vm.expectEmit(true, true, false, false, address(token));
        emit ERC20EIP3009Upgradeable.AuthorizationUsed(signer, nonce);

        token.receiveWithAuthorization(
            signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, v, r, s
        );

        // Full amount received, no fee
        assertEq(token.balanceOf(recipient), recipientBefore + TRANSFER_AMOUNT);
        assertTrue(token.authorizationState(signer, nonce));
    }

    function test_receiveWithAuthorization_wrongCallerReverts() public {
        bytes32 nonce = keccak256("nonce-recv-wrong");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(
            signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, signerPk
        );

        // Called by someone who is NOT the recipient
        address wrongCaller = address(0xDEAD);
        vm.prank(wrongCaller);
        vm.expectRevert(ERC20EIP3009Upgradeable.InvalidSignature.selector);
        token.receiveWithAuthorization(
            signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, v, r, s
        );
    }

    function test_receiveWithAuthorization_replayReverts() public {
        bytes32 nonce = keccak256("nonce-recv-replay");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(
            signer, recipient, 1, validAfter, validBefore, nonce, signerPk
        );

        vm.prank(recipient);
        token.receiveWithAuthorization(signer, recipient, 1, validAfter, validBefore, nonce, v, r, s);

        vm.prank(recipient);
        vm.expectRevert(ERC20EIP3009Upgradeable.AuthorizationAlreadyUsed.selector);
        token.receiveWithAuthorization(signer, recipient, 1, validAfter, validBefore, nonce, v, r, s);
    }

    // ─────────────────────────────────────────────
    // cancelAuthorization
    // ─────────────────────────────────────────────

    function test_cancelAuthorization_preventsTransfer() public {
        bytes32 nonce = keccak256("nonce-cancel-1");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        // Cancel the nonce before using it
        (uint8 cv, bytes32 cr, bytes32 cs) = _signCancel(signer, nonce, signerPk);

        vm.expectEmit(true, true, false, false, address(token));
        emit ERC20EIP3009Upgradeable.AuthorizationCanceled(signer, nonce);

        token.cancelAuthorization(signer, nonce, cv, cr, cs);

        // Nonce is now marked used
        assertTrue(token.authorizationState(signer, nonce));

        // Attempt to use the cancelled nonce for a transfer must revert
        (uint8 tv, bytes32 tr, bytes32 ts) = _signTransfer(
            signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, signerPk
        );
        vm.expectRevert(ERC20EIP3009Upgradeable.AuthorizationAlreadyUsed.selector);
        token.transferWithAuthorization(
            signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, tv, tr, ts
        );
    }

    function test_cancelAuthorization_alreadyUsedReverts() public {
        bytes32 nonce = keccak256("nonce-cancel-dup");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        // Use the nonce via transfer first
        (uint8 tv, bytes32 tr, bytes32 ts) = _signTransfer(
            signer, recipient, 1, validAfter, validBefore, nonce, signerPk
        );
        token.transferWithAuthorization(signer, recipient, 1, validAfter, validBefore, nonce, tv, tr, ts);

        // Now try to cancel the already-used nonce
        (uint8 cv, bytes32 cr, bytes32 cs) = _signCancel(signer, nonce, signerPk);
        vm.expectRevert(ERC20EIP3009Upgradeable.AuthorizationAlreadyUsed.selector);
        token.cancelAuthorization(signer, nonce, cv, cr, cs);
    }

    function test_cancelAuthorization_invalidSignatureReverts() public {
        bytes32 nonce = keccak256("nonce-cancel-badsig");

        // Sign with wrong key
        (uint8 cv, bytes32 cr, bytes32 cs) = _signCancel(signer, nonce, 0xBAD);

        vm.expectRevert(ERC20EIP3009Upgradeable.InvalidSignature.selector);
        token.cancelAuthorization(signer, nonce, cv, cr, cs);
    }

    // ─────────────────────────────────────────────
    // authorizationState getter
    // ─────────────────────────────────────────────

    function test_authorizationState_freshIsfalse() public view {
        bytes32 nonce = keccak256("never-used");
        assertFalse(token.authorizationState(signer, nonce));
    }

    // ─────────────────────────────────────────────
    // FUZZ
    // ─────────────────────────────────────────────

    function testFuzz_transferWithAuthorization_uniqueNonces(bytes32 nonce1, bytes32 nonce2) public {
        vm.assume(nonce1 != nonce2);
        token.mint(signer, 100);
        _doTransfer(nonce1, 1);
        _doTransfer(nonce2, 1);
        assertTrue(token.authorizationState(signer, nonce1));
        assertTrue(token.authorizationState(signer, nonce2));
    }

    /// @dev Helper to avoid stack-too-deep in fuzz tests
    function _doTransfer(bytes32 nonce, uint256 amount) internal {
        uint256 validBefore = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(
            signer, recipient, amount, 0, validBefore, nonce, signerPk
        );
        token.transferWithAuthorization(signer, recipient, amount, 0, validBefore, nonce, v, r, s);
    }

    function testFuzz_transferWithAuthorization_amount(uint128 amount) public {
        vm.assume(amount > 0 && amount <= INITIAL_SUPPLY);
        bytes32 nonce = keccak256(abi.encode(amount));
        uint256 signerBefore = token.balanceOf(signer);
        uint256 recipientBefore = token.balanceOf(recipient);
        _doTransfer(nonce, amount);
        // No fee: exact amounts
        assertEq(token.balanceOf(signer), signerBefore - amount);
        assertEq(token.balanceOf(recipient), recipientBefore + amount);
    }
}
