// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../../contracts/Token.sol";
import "./UUPSProxy.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

/**
 * @title TokenEIP3009Test
 * @dev Foundry tests for EIP-3009 Transfer With Authorization (Token v2.0.0)
 *
 * Behaviour under test:
 *   transferWithAuthorization  — validates EIP-712 sig, time window, nonce reuse, marks nonce used
 *   receiveWithAuthorization   — same as above + enforces msg.sender == to
 *   cancelAuthorization        — marks nonce used via cancel sig, prevents later use
 *   authorizationState         — getter
 *
 * Key design note (v2 GROSS settlement): _executeTransfer → _grossTransfer.
 *   The recipient receives EXACTLY `value`; the sender pays value + fee and the
 *   fee goes to the collector. Two Transfer events: (from→to, value) and
 *   (from→collector, fee). Fee is 0 when transferFeeBps=0 or either party is
 *   exempt (single Transfer event, pure ERC-20 behaviour).
 *   PAUSE / BLOCK / FREEZE security checks still apply.
 */
contract TokenEIP3009Test is Test {
    Token public token;

    // EIP-712 type hashes (must match exactly what the contract uses)
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 public constant CANCEL_AUTHORIZATION_TYPEHASH =
        keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");

    address public admin;
    uint256 public signerPk;
    address public signer;
    address public recipient;
    address public feeCollector;
    address public custodyTreasury;

    uint256 constant INITIAL_SUPPLY = 1_000_000 * 10 ** 18;
    uint256 constant INITIAL_FEE_BPS = 100; // 1% — new v2 maximum (MAX_TRANSFER_FEE_BPS)
    uint256 constant CUSTODY_FEE_BPS = 50; // 0,5%
    uint256 constant TRANSFER_AMOUNT = 1_000 * 10 ** 18;

    function setUp() public {
        admin = address(this);
        recipient = address(0xBEEF);
        feeCollector = address(0x200);
        custodyTreasury = address(0x300);

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
            INITIAL_FEE_BPS,
            feeCollector,
            CUSTODY_FEE_BPS,
            custodyTreasury,
            admin
        );
        UUPSProxy proxy = new UUPSProxy(address(implementation), initData);
        token = Token(payable(address(proxy)));

        // Grant operational roles to admin for setup operations
        // (init only grants DEFAULT_ADMIN / UPGRADER / FEE_MANAGER / RECOVERER)
        token.grantRole(token.MINTER_ROLE(), admin);
        token.grantRole(token.PAUSER_ROLE(), admin);
        token.grantRole(token.FREEZER_ROLE(), admin);
        token.grantRole(token.BLOCKER_ROLE(), admin);
    }

    // ─────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────

    /// @dev Gross-path fee: value * transferFeeBps / 10000 (floor)
    function _fee(uint256 value) internal pure returns (uint256) {
        return (value * INITIAL_FEE_BPS) / 10000;
    }

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
            abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );
        bytes32 digest = _hashTypedData(structHash);
        (v, r, s) = vm.sign(pk, digest);
    }

    /// @dev Build and sign a CancelAuthorization EIP-712 struct
    function _signCancel(address authorizer, bytes32 nonce, uint256 pk)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 structHash = keccak256(abi.encode(CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce));
        bytes32 digest = _hashTypedData(structHash);
        (v, r, s) = vm.sign(pk, digest);
    }

    /// @dev Reconstruct EIP-712 domain separator to hash typed data
    function _hashTypedData(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
    }

    // ─────────────────────────────────────────────
    // transferWithAuthorization — HAPPY PATH (GROSS settlement)
    // ─────────────────────────────────────────────

    function test_transferWithAuthorization_valid() public {
        bytes32 nonce = keccak256("nonce-1");
        uint256 validAfter = block.timestamp - 1;
        uint256 validBefore = block.timestamp + 1 hours;
        uint256 fee = _fee(TRANSFER_AMOUNT);
        assertGt(fee, 0); // sanity: fee path actually exercised

        uint256 recipientBefore = token.balanceOf(recipient);
        uint256 collectorBefore = token.balanceOf(feeCollector);
        assertFalse(token.authorizationState(signer, nonce));

        (uint8 v, bytes32 r, bytes32 s) =
            _signTransfer(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, signerPk);

        // Expect AuthorizationUsed, then the two gross-path Transfer events
        vm.expectEmit(true, true, false, false, address(token));
        emit ERC20EIP3009Upgradeable.AuthorizationUsed(signer, nonce);
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(signer, recipient, TRANSFER_AMOUNT);
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(signer, feeCollector, fee);

        token.transferWithAuthorization(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, v, r, s);

        // GROSS semantics: recipient receives exactly value, sender pays value + fee
        assertEq(token.balanceOf(recipient), recipientBefore + TRANSFER_AMOUNT);
        assertEq(token.balanceOf(signer), INITIAL_SUPPLY - TRANSFER_AMOUNT - fee);
        assertEq(token.balanceOf(feeCollector), collectorBefore + fee);
        assertTrue(token.authorizationState(signer, nonce));
    }

    function test_transferWithAuthorization_nonce_markedUsed() public {
        bytes32 nonce = keccak256("nonce-used");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(signer, recipient, 1, validAfter, validBefore, nonce, signerPk);

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

        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(signer, recipient, 1, validAfter, validBefore, nonce, signerPk);

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

        (uint8 v, bytes32 r, bytes32 s) =
            _signTransfer(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, signerPk);

        vm.expectRevert(ERC20EIP3009Upgradeable.AuthorizationExpired.selector);
        token.transferWithAuthorization(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, v, r, s);
    }

    function test_transferWithAuthorization_notYetValidReverts() public {
        bytes32 nonce = keccak256("nonce-future");
        uint256 validAfter = block.timestamp + 1 hours; // in the future
        uint256 validBefore = block.timestamp + 2 hours;

        (uint8 v, bytes32 r, bytes32 s) =
            _signTransfer(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, signerPk);

        vm.expectRevert(ERC20EIP3009Upgradeable.AuthorizationNotYetValid.selector);
        token.transferWithAuthorization(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, v, r, s);
    }

    function test_transferWithAuthorization_invalidSignatureReverts() public {
        bytes32 nonce = keccak256("nonce-badsig");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        // Sign with a different private key
        uint256 wrongPk = 0xBAD;
        (uint8 v, bytes32 r, bytes32 s) =
            _signTransfer(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, wrongPk);

        vm.expectRevert(ERC20EIP3009Upgradeable.InvalidSignature.selector);
        token.transferWithAuthorization(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, v, r, s);
    }

    // ─────────────────────────────────────────────
    // transferWithAuthorization — FEE semantics (GROSS path)
    // ─────────────────────────────────────────────

    /// @dev Sender balance covers value but NOT value + fee → ERC20InsufficientBalance.
    /// The value leg settles first (balance → 0), then the fee leg reverts.
    function test_transferWithAuthorization_insufficientBalanceForGrossReverts() public {
        uint256 poorPk = 0xB0B;
        address poorSigner = vm.addr(poorPk);
        token.mint(poorSigner, TRANSFER_AMOUNT); // exactly value, nothing for the fee

        bytes32 nonce = keccak256("nonce-gross-insufficient");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;
        uint256 fee = _fee(TRANSFER_AMOUNT);
        assertGt(fee, 0);

        (uint8 v, bytes32 r, bytes32 s) =
            _signTransfer(poorSigner, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, poorPk);

        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, poorSigner, 0, fee));
        token.transferWithAuthorization(poorSigner, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, v, r, s);
    }

    /// @dev With transferFeeBps = 0 the gross path behaves like a plain ERC-20:
    /// a single Transfer event, no collector leg.
    function test_transferWithAuthorization_zeroFee_behavesLikePlainERC20() public {
        token.setTransferFeeBps(0);

        bytes32 nonce = keccak256("nonce-zerofee");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) =
            _signTransfer(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, signerPk);

        uint256 recipientBefore = token.balanceOf(recipient);
        uint256 collectorBefore = token.balanceOf(feeCollector);

        vm.recordLogs();
        token.transferWithAuthorization(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, v, r, s);

        // Exactly ONE Transfer event: (signer → recipient, value)
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 transferSig = keccak256("Transfer(address,address,uint256)");
        uint256 transferCount = 0;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == transferSig) {
                transferCount++;
                assertEq(address(uint160(uint256(logs[i].topics[1]))), signer);
                assertEq(address(uint160(uint256(logs[i].topics[2]))), recipient);
                assertEq(abi.decode(logs[i].data, (uint256)), TRANSFER_AMOUNT);
            }
        }
        assertEq(transferCount, 1);

        // Pure ERC-20 balances: no fee anywhere
        assertEq(token.balanceOf(recipient), recipientBefore + TRANSFER_AMOUNT);
        assertEq(token.balanceOf(signer), INITIAL_SUPPLY - TRANSFER_AMOUNT);
        assertEq(token.balanceOf(feeCollector), collectorBefore);
    }

    /// @dev Fee-exempt SENDER → no fee: sender pays exactly value
    function test_transferWithAuthorization_senderExempt_noFee() public {
        token.addTransferFeeExempt(signer);

        bytes32 nonce = keccak256("nonce-exempt-sender");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) =
            _signTransfer(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, signerPk);

        uint256 recipientBefore = token.balanceOf(recipient);
        uint256 collectorBefore = token.balanceOf(feeCollector);

        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(signer, recipient, TRANSFER_AMOUNT);

        token.transferWithAuthorization(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, v, r, s);

        assertEq(token.balanceOf(recipient), recipientBefore + TRANSFER_AMOUNT);
        assertEq(token.balanceOf(signer), INITIAL_SUPPLY - TRANSFER_AMOUNT);
        assertEq(token.balanceOf(feeCollector), collectorBefore);
    }

    /// @dev Fee-exempt RECIPIENT → no fee: sender pays exactly value
    function test_transferWithAuthorization_recipientExempt_noFee() public {
        token.addTransferFeeExempt(recipient);

        bytes32 nonce = keccak256("nonce-exempt-recipient");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) =
            _signTransfer(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, signerPk);

        uint256 recipientBefore = token.balanceOf(recipient);
        uint256 collectorBefore = token.balanceOf(feeCollector);

        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(signer, recipient, TRANSFER_AMOUNT);

        token.transferWithAuthorization(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, v, r, s);

        assertEq(token.balanceOf(recipient), recipientBefore + TRANSFER_AMOUNT);
        assertEq(token.balanceOf(signer), INITIAL_SUPPLY - TRANSFER_AMOUNT);
        assertEq(token.balanceOf(feeCollector), collectorBefore);
    }

    // ─────────────────────────────────────────────
    // transferWithAuthorization — SECURITY checks
    // ─────────────────────────────────────────────

    function test_transferWithAuthorization_pausedReverts() public {
        token.pause();

        bytes32 nonce = keccak256("nonce-paused");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) =
            _signTransfer(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, signerPk);

        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        token.transferWithAuthorization(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, v, r, s);
    }

    function test_transferWithAuthorization_frozenFromReverts() public {
        token.freeze(signer);

        bytes32 nonce = keccak256("nonce-frozen");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) =
            _signTransfer(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, signerPk);

        vm.expectRevert(ERC20FreezableUpgradeable.AccountFrozen.selector);
        token.transferWithAuthorization(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, v, r, s);
    }

    function test_transferWithAuthorization_blockedFromReverts() public {
        token.blockAccount(signer);

        bytes32 nonce = keccak256("nonce-blocked");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) =
            _signTransfer(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, signerPk);

        vm.expectRevert(ERC20BlocklistUpgradeable.AccountBlocked.selector);
        token.transferWithAuthorization(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, v, r, s);
    }

    // ─────────────────────────────────────────────
    // receiveWithAuthorization
    // ─────────────────────────────────────────────

    function test_receiveWithAuthorization_valid() public {
        bytes32 nonce = keccak256("nonce-recv-1");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;
        uint256 fee = _fee(TRANSFER_AMOUNT);

        (uint8 v, bytes32 r, bytes32 s) =
            _signTransfer(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, signerPk);

        uint256 recipientBefore = token.balanceOf(recipient);
        uint256 collectorBefore = token.balanceOf(feeCollector);

        // Must be called BY recipient
        vm.prank(recipient);
        vm.expectEmit(true, true, false, false, address(token));
        emit ERC20EIP3009Upgradeable.AuthorizationUsed(signer, nonce);
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(signer, recipient, TRANSFER_AMOUNT);
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(signer, feeCollector, fee);

        token.receiveWithAuthorization(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, v, r, s);

        // GROSS semantics: exact value received, sender pays value + fee
        assertEq(token.balanceOf(recipient), recipientBefore + TRANSFER_AMOUNT);
        assertEq(token.balanceOf(signer), INITIAL_SUPPLY - TRANSFER_AMOUNT - fee);
        assertEq(token.balanceOf(feeCollector), collectorBefore + fee);
        assertTrue(token.authorizationState(signer, nonce));
    }

    function test_receiveWithAuthorization_wrongCallerReverts() public {
        bytes32 nonce = keccak256("nonce-recv-wrong");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) =
            _signTransfer(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, signerPk);

        // Called by someone who is NOT the recipient
        address wrongCaller = address(0xDEAD);
        vm.prank(wrongCaller);
        vm.expectRevert(ERC20EIP3009Upgradeable.InvalidSignature.selector);
        token.receiveWithAuthorization(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, v, r, s);
    }

    function test_receiveWithAuthorization_replayReverts() public {
        bytes32 nonce = keccak256("nonce-recv-replay");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(signer, recipient, 1, validAfter, validBefore, nonce, signerPk);

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
        (uint8 tv, bytes32 tr, bytes32 ts) =
            _signTransfer(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, signerPk);
        vm.expectRevert(ERC20EIP3009Upgradeable.AuthorizationAlreadyUsed.selector);
        token.transferWithAuthorization(signer, recipient, TRANSFER_AMOUNT, validAfter, validBefore, nonce, tv, tr, ts);
    }

    function test_cancelAuthorization_alreadyUsedReverts() public {
        bytes32 nonce = keccak256("nonce-cancel-dup");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        // Use the nonce via transfer first
        (uint8 tv, bytes32 tr, bytes32 ts) =
            _signTransfer(signer, recipient, 1, validAfter, validBefore, nonce, signerPk);
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
        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(signer, recipient, amount, 0, validBefore, nonce, signerPk);
        token.transferWithAuthorization(signer, recipient, amount, 0, validBefore, nonce, v, r, s);
    }

    function testFuzz_transferWithAuthorization_amount(uint128 amount) public {
        uint256 fee = _fee(uint256(amount));
        vm.assume(amount > 0 && uint256(amount) + fee <= INITIAL_SUPPLY);
        bytes32 nonce = keccak256(abi.encode(amount));
        uint256 signerBefore = token.balanceOf(signer);
        uint256 recipientBefore = token.balanceOf(recipient);
        uint256 collectorBefore = token.balanceOf(feeCollector);
        _doTransfer(nonce, amount);
        // GROSS semantics: recipient gets exactly amount, sender pays amount + fee
        assertEq(token.balanceOf(signer), signerBefore - amount - fee);
        assertEq(token.balanceOf(recipient), recipientBefore + amount);
        assertEq(token.balanceOf(feeCollector), collectorBefore + fee);
    }

    /// @dev Protezione replay cross-chain: una firma costruita sul domain
    /// separator di un'ALTRA chain (chainId diverso) viene rifiutata
    function test_transferWithAuthorization_wrongChainIdSignatureReverts() public {
        bytes32 nonce = keccak256("cross-chain-replay");
        uint256 validBefore = block.timestamp + 1 hours;
        uint256 amount = 1_000;

        bytes32 structHash = keccak256(
            abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, signer, recipient, amount, uint256(0), validBefore, nonce)
        );
        // Domain separator forgiato con chainId + 1 (stessa struttura EIP-712)
        bytes32 foreignDomainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("Test Token")),
                keccak256(bytes("1")),
                block.chainid + 1,
                address(token)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", foreignDomainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);

        vm.expectRevert(ERC20EIP3009Upgradeable.InvalidSignature.selector);
        token.transferWithAuthorization(signer, recipient, amount, 0, validBefore, nonce, v, r, s);
    }
}
