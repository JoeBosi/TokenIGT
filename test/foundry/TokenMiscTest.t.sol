// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../../contracts/Token.sol";
import "../../contracts/mocks/TokenV2.sol";
import "./UUPSProxy.sol";

/**
 * @title TokenMiscTest
 * @dev Tests targeting remaining coverage gaps (v2.0.0 API):
 *
 *  1. ERC20TransferFeeUpgradeable — fee branches:
 *     - recipient exempt → no fee
 *     - sender exempt → no fee
 *     - transferFeeBps == 0 → plain ERC-20 transfer (single Transfer event)
 *     - collector == from branch in Token._update (fee stays with sender)
 *     - setFeeCollector zero address reverts / success + event / access control
 *     - setTransferFeeBps success + event / cap (MAX_TRANSFER_FEE_BPS)
 *     - add/removeTransferFeeExempt idempotent (event only on state change)
 *
 *  2. ERC20FreezableUpgradeable — binary freeze semantics:
 *     - freeze/unfreeze idempotent (event only on state change)
 *     - frozen account cannot transfer (AccountFrozen)
 *     - access control (FREEZER_ROLE)
 *
 *  3. ERC20BlocklistUpgradeable — blockAccount / unblockAccount:
 *     - idempotent (event only on state change)
 *     - blocked account cannot transfer (AccountBlocked)
 *     - access control (BLOCKER_ROLE)
 *
 *  4. Token.sol:
 *     - version()
 *     - _authorizeUpgrade() — UPGRADER_ROLE required (TokenV2 mock)
 */
contract TokenMiscTest is Test {
    Token public token;

    address public admin;
    address public feeAdmin;
    address public feeExemptAccount;
    address public regularSender;
    address public regularRecipient;
    address public feeCollectorAddr;
    address public custodyTreasuryAddr;

    uint256 constant INITIAL_SUPPLY = 1_000_000 * 10 ** 18;
    uint256 constant INITIAL_FEE = 100; // 1% (= MAX_TRANSFER_FEE_BPS)
    uint256 constant INITIAL_CUSTODY_FEE = 50; // 0.5%
    uint256 constant AMOUNT = 10_000 * 10 ** 18;

    bytes32 constant TRANSFER_EVENT_SIG = keccak256("Transfer(address,address,uint256)");

    function setUp() public {
        admin = address(this);
        feeAdmin = address(this); // admin == feeAdmin for simplicity
        feeExemptAccount = address(0xFEE00001);
        regularSender = address(0xFEE00002);
        regularRecipient = address(0xFEE00003);
        feeCollectorAddr = address(0xFEE00004);
        custodyTreasuryAddr = address(0xFEE00005);

        Token implementation = new Token();
        bytes memory initData = abi.encodeWithSelector(
            Token.initialize.selector,
            "Test Token",
            "TEST",
            INITIAL_SUPPLY,
            admin,
            INITIAL_FEE,
            feeCollectorAddr,
            INITIAL_CUSTODY_FEE,
            custodyTreasuryAddr,
            admin,
            3 days
        );
        UUPSProxy proxy = new UUPSProxy(address(implementation), initData);
        token = Token(payable(address(proxy)));

        // Grant operational roles (initialize only grants governance roles:
        // DEFAULT_ADMIN, UPGRADER, FEE_ADMIN, RECOVERER)
        token.grantRole(token.MINTER_ROLE(), admin);
        token.grantRole(token.BURNER_ROLE(), admin);
        token.grantRole(token.PAUSER_ROLE(), admin);
        token.grantRole(token.FREEZER_ROLE(), admin);
        token.grantRole(token.BLOCKER_ROLE(), admin);
    }

    /// @dev Count Transfer events emitted by the token among recorded logs
    function _countTransferLogs(Vm.Log[] memory entries) internal view returns (uint256 count) {
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].emitter == address(token) && entries[i].topics[0] == TRANSFER_EVENT_SIG) {
                count++;
            }
        }
    }

    // ─────────────────────────────────────────────
    // ERC20TransferFeeUpgradeable — fee branches
    // ─────────────────────────────────────────────

    /// @dev recipient (to) is exempt → fee = 0
    function test_fee_recipientExempt_noFee() public {
        token.mint(regularSender, AMOUNT);
        token.addTransferFeeExempt(regularRecipient); // exempt the RECIPIENT

        uint256 senderBefore = token.balanceOf(regularSender);
        uint256 recipientBefore = token.balanceOf(regularRecipient);
        uint256 collectorBefore = token.balanceOf(feeCollectorAddr);

        vm.prank(regularSender);
        token.transfer(regularRecipient, AMOUNT);

        // Recipient gets full amount (no fee because isTransferFeeExempt[to])
        assertEq(token.balanceOf(regularRecipient), recipientBefore + AMOUNT);
        assertEq(token.balanceOf(regularSender), senderBefore - AMOUNT);
        // Fee collector receives nothing
        assertEq(token.balanceOf(feeCollectorAddr), collectorBefore);
    }

    /// @dev sender (from) is exempt → fee = 0 (confirms existing branch works)
    function test_fee_senderExempt_noFee() public {
        token.mint(regularSender, AMOUNT);
        token.addTransferFeeExempt(regularSender); // exempt the SENDER

        uint256 recipientBefore = token.balanceOf(regularRecipient);
        uint256 collectorBefore = token.balanceOf(feeCollectorAddr);

        vm.prank(regularSender);
        token.transfer(regularRecipient, AMOUNT);

        assertEq(token.balanceOf(regularRecipient), recipientBefore + AMOUNT);
        assertEq(token.balanceOf(feeCollectorAddr), collectorBefore);
    }

    /// @dev transferFeeBps = 0 → plain ERC-20 behavior: full amount, single Transfer event
    function test_fee_zeroFee_exactTransfer() public {
        token.setTransferFeeBps(0);
        token.mint(regularSender, AMOUNT);

        uint256 collectorBefore = token.balanceOf(feeCollectorAddr);

        vm.recordLogs();
        vm.prank(regularSender);
        token.transfer(regularRecipient, AMOUNT);
        Vm.Log[] memory entries = vm.getRecordedLogs();

        assertEq(token.balanceOf(regularRecipient), AMOUNT);
        assertEq(token.balanceOf(feeCollectorAddr), collectorBefore);
        // Exactly one Transfer event (no fee leg to the collector)
        assertEq(_countTransferLogs(entries), 1);
    }

    /// @dev collector == from → fee stays with sender (branch: collector != from is false)
    function test_fee_collectorEqualsFrom_noExtraTransfer() public {
        // Set fee collector = regularSender
        token.setFeeCollector(regularSender);
        assertEq(token.feeCollector(), regularSender);

        token.mint(regularSender, AMOUNT);
        uint256 senderBefore = token.balanceOf(regularSender);
        uint256 recipientBefore = token.balanceOf(regularRecipient);

        vm.recordLogs();
        vm.prank(regularSender);
        token.transfer(regularRecipient, AMOUNT);
        Vm.Log[] memory entries = vm.getRecordedLogs();

        // Recipient gets net amount (AMOUNT - fee), fee stays with sender
        uint256 feeAmount = (AMOUNT * INITIAL_FEE) / 10000;
        uint256 netAmount = AMOUNT - feeAmount;
        assertEq(token.balanceOf(regularRecipient), recipientBefore + netAmount);
        // Sender balance: senderBefore - netAmount (fee NOT sent elsewhere)
        assertEq(token.balanceOf(regularSender), senderBefore - netAmount);
        // Only the (from → to, net) Transfer event, no fee leg
        assertEq(_countTransferLogs(entries), 1);
    }

    /// @dev setFeeCollector to zero address must revert
    function test_setFeeCollector_zeroAddressReverts() public {
        vm.expectRevert(ERC20TransferFeeUpgradeable.InvalidFeeCollector.selector);
        token.setFeeCollector(address(0));
    }

    /// @dev setFeeCollector success + FeeCollectorUpdated event
    function test_setFeeCollector_success() public {
        address newCollector = address(0xC011EC70);

        vm.expectEmit(true, true, false, true, address(token));
        emit ERC20TransferFeeUpgradeable.FeeCollectorUpdated(feeCollectorAddr, newCollector);

        token.setFeeCollector(newCollector);
        assertEq(token.feeCollector(), newCollector);
    }

    /// @dev non-FEE_ADMIN calling setFeeCollector reverts
    function test_setFeeCollector_nonFeeManagerReverts() public {
        // Read the role BEFORE the prank: the external call would consume it
        bytes32 role = token.FEE_ADMIN_ROLE();
        vm.prank(regularSender);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, regularSender, role)
        );
        token.setFeeCollector(address(0xABCD));
    }

    /// @dev setTransferFeeBps success + TransferFeeUpdated(previous, new) event
    function test_setTransferFeeBps_success() public {
        vm.expectEmit(false, false, false, true, address(token));
        emit ERC20TransferFeeUpgradeable.TransferFeeUpdated(INITIAL_FEE, 25);

        token.setTransferFeeBps(25);
        assertEq(token.transferFeeBps(), 25);
    }

    /// @dev setTransferFeeBps above MAX_TRANSFER_FEE_BPS (100) reverts
    function test_setTransferFeeBps_aboveMaxReverts() public {
        uint256 tooHigh = uint256(token.MAX_TRANSFER_FEE_BPS()) + 1;
        vm.expectRevert(
            abi.encodeWithSelector(
                ERC20TransferFeeUpgradeable.FeeExceedsMaximum.selector, tooHigh, token.MAX_TRANSFER_FEE_BPS()
            )
        );
        token.setTransferFeeBps(tooHigh);
    }

    /// @dev addTransferFeeExempt: event on state change, no-op (no event) when already exempt
    function test_addTransferFeeExempt_idempotent() public {
        vm.expectEmit(true, false, false, true, address(token));
        emit ERC20TransferFeeUpgradeable.TransferFeeExemptionChanged(feeExemptAccount, true);
        token.addTransferFeeExempt(feeExemptAccount);
        assertTrue(token.isTransferFeeExempt(feeExemptAccount));

        // Second call: no state change, no event
        vm.recordLogs();
        token.addTransferFeeExempt(feeExemptAccount);
        assertEq(vm.getRecordedLogs().length, 0);
        assertTrue(token.isTransferFeeExempt(feeExemptAccount));
    }

    /// @dev removeTransferFeeExempt: event on state change, no-op (no event) when not exempt
    function test_removeTransferFeeExempt_idempotent() public {
        token.addTransferFeeExempt(feeExemptAccount);

        vm.expectEmit(true, false, false, true, address(token));
        emit ERC20TransferFeeUpgradeable.TransferFeeExemptionChanged(feeExemptAccount, false);
        token.removeTransferFeeExempt(feeExemptAccount);
        assertFalse(token.isTransferFeeExempt(feeExemptAccount));

        // Second call: no state change, no event
        vm.recordLogs();
        token.removeTransferFeeExempt(feeExemptAccount);
        assertEq(vm.getRecordedLogs().length, 0);
        assertFalse(token.isTransferFeeExempt(feeExemptAccount));
    }

    /// @dev getTransferFeeExemptList: assert membership and length, NOT order (EnumerableSet)
    function test_getTransferFeeExemptList_membership() public {
        assertEq(token.getTransferFeeExemptList().length, 0);

        token.addTransferFeeExempt(feeExemptAccount);
        token.addTransferFeeExempt(regularSender);

        address[] memory list = token.getTransferFeeExemptList();
        assertEq(list.length, 2);
        bool foundExempt;
        bool foundSender;
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == feeExemptAccount) foundExempt = true;
            if (list[i] == regularSender) foundSender = true;
        }
        assertTrue(foundExempt && foundSender);

        token.removeTransferFeeExempt(feeExemptAccount);
        assertEq(token.getTransferFeeExemptList().length, 1);
    }

    // ─────────────────────────────────────────────
    // ERC20FreezableUpgradeable — binary freeze
    // ─────────────────────────────────────────────

    /// @dev freeze(account) freezes the whole account: transfers revert AccountFrozen
    function test_freeze_blocksTransfers() public {
        address account = address(0xF0001);
        token.mint(account, AMOUNT);

        vm.expectEmit(true, false, false, true, address(token));
        emit ERC20FreezableUpgradeable.Frozen(account);
        token.freeze(account);
        assertTrue(token.isFrozen(account));

        vm.prank(account);
        vm.expectRevert(ERC20FreezableUpgradeable.AccountFrozen.selector);
        token.transfer(regularRecipient, 1);
    }

    /// @dev freeze is idempotent: second call is a no-op with no event
    function test_freeze_idempotent_noEventWhenAlreadyFrozen() public {
        address account = address(0xF0002);
        token.freeze(account);
        assertTrue(token.isFrozen(account));

        vm.recordLogs();
        token.freeze(account);
        assertEq(vm.getRecordedLogs().length, 0);
        assertTrue(token.isFrozen(account));
    }

    /// @dev unfreeze emits Unfrozen and re-enables transfers
    function test_unfreeze_allowsTransferAgain() public {
        address account = address(0xF0003);
        token.mint(account, AMOUNT);
        token.freeze(account);

        vm.expectEmit(true, false, false, true, address(token));
        emit ERC20FreezableUpgradeable.Unfrozen(account);
        token.unfreeze(account);
        assertFalse(token.isFrozen(account));

        vm.prank(account);
        token.transfer(regularRecipient, 1000);
        assertGt(token.balanceOf(regularRecipient), 0);
    }

    /// @dev unfreeze is idempotent: no-op with no event when not frozen
    function test_unfreeze_idempotent_noEventWhenNotFrozen() public {
        address account = address(0xF0004);
        assertFalse(token.isFrozen(account));

        vm.recordLogs();
        token.unfreeze(account);
        assertEq(vm.getRecordedLogs().length, 0);
        assertFalse(token.isFrozen(account));
    }

    /// @dev non-FREEZER calling freeze reverts
    function test_freeze_nonFreezerReverts() public {
        bytes32 role = token.FREEZER_ROLE();
        vm.prank(regularSender);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, regularSender, role)
        );
        token.freeze(regularRecipient);
    }

    /// @dev non-FREEZER calling unfreeze reverts
    function test_unfreeze_nonFreezerReverts() public {
        token.freeze(regularRecipient);

        bytes32 role = token.FREEZER_ROLE();
        vm.prank(regularSender);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, regularSender, role)
        );
        token.unfreeze(regularRecipient);
    }

    // ─────────────────────────────────────────────
    // ERC20BlocklistUpgradeable — blockAccount / unblockAccount
    // ─────────────────────────────────────────────

    /// @dev blockAccount emits Blocked and blocks transfers (AccountBlocked)
    function test_blockAccount_blocksAccount() public {
        token.mint(regularSender, AMOUNT);

        vm.expectEmit(true, false, false, true, address(token));
        emit ERC20BlocklistUpgradeable.Blocked(regularSender);
        token.blockAccount(regularSender);
        assertTrue(token.isBlocked(regularSender));

        vm.prank(regularSender);
        vm.expectRevert(ERC20BlocklistUpgradeable.AccountBlocked.selector);
        token.transfer(regularRecipient, 1);
    }

    /// @dev non-BLOCKER calling blockAccount reverts
    function test_blockAccount_nonBlockerReverts() public {
        bytes32 role = token.BLOCKER_ROLE();
        vm.prank(regularSender);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, regularSender, role)
        );
        token.blockAccount(regularRecipient);
    }

    /// @dev blockAccount is idempotent: second call is a no-op with no event
    function test_blockAccount_idempotent_noEventWhenAlreadyBlocked() public {
        token.blockAccount(regularSender);
        assertTrue(token.isBlocked(regularSender));

        vm.recordLogs();
        token.blockAccount(regularSender);
        assertEq(vm.getRecordedLogs().length, 0);
        assertTrue(token.isBlocked(regularSender));
    }

    /// @dev unblockAccount emits Unblocked and re-enables transfers
    function test_unblockAccount_allowsTransferAgain() public {
        token.mint(regularSender, AMOUNT);
        token.blockAccount(regularSender);

        vm.expectEmit(true, false, false, true, address(token));
        emit ERC20BlocklistUpgradeable.Unblocked(regularSender);
        token.unblockAccount(regularSender);
        assertFalse(token.isBlocked(regularSender));

        vm.prank(regularSender);
        token.transfer(regularRecipient, 1000);
        assertGt(token.balanceOf(regularRecipient), 0);
    }

    /// @dev unblockAccount is idempotent: no-op with no event when not blocked
    function test_unblockAccount_idempotent_noEventWhenNotBlocked() public {
        assertFalse(token.isBlocked(regularSender));

        vm.recordLogs();
        token.unblockAccount(regularSender);
        assertEq(vm.getRecordedLogs().length, 0);
        assertFalse(token.isBlocked(regularSender));
    }

    // ─────────────────────────────────────────────
    // Token.sol — metadata
    // ─────────────────────────────────────────────

    function test_version_returnsV2() public view {
        assertEq(token.version(), "2.5.0");
    }

    /// @dev name/symbol/decimals set by __ERC20_init in initialize
    /// (mutation-testing gap: removing __ERC20_init survived the Foundry suite)
    function test_metadata_nameSymbolDecimals() public view {
        assertEq(token.name(), "Test Token");
        assertEq(token.symbol(), "TEST");
        assertEq(token.decimals(), 18);
    }

    /// @dev The implementation contract must be locked by _disableInitializers()
    /// in its constructor: calling initialize() directly on it (not through a
    /// proxy) reverts. Guards a UUPS best practice — an un-disabled implementation
    /// can be initialized and self-destructed/upgraded by an attacker.
    /// (mutation-testing gap: removing _disableInitializers() survived.)
    function test_implementation_cannotBeInitialized() public {
        Token impl = new Token();
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        impl.initialize("X", "X", 0, address(0xA11CE), 0, address(0xFEE), 0, address(0x7EA), address(0xAD1), 3 days);
    }

    // ─────────────────────────────────────────────
    // Token.sol — _authorizeUpgrade (UUPS)
    // ─────────────────────────────────────────────

    function test_authorizeUpgrade_nonUpgraderReverts() public {
        TokenV2 newImpl = new TokenV2();

        bytes32 role = token.UPGRADER_ROLE();
        vm.prank(regularSender);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, regularSender, role)
        );
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

        // V2 reports its own version
        assertEq(tokenV2.version(), "2.2.0-test");
    }

    // ─────────────────────────────────────────────
    // Fuzz branches
    // ─────────────────────────────────────────────

    function testFuzz_fee_recipientExempt(uint128 amount) public {
        vm.assume(amount > 0);
        token.mint(regularSender, amount);
        token.addTransferFeeExempt(regularRecipient);

        uint256 collectorBefore = token.balanceOf(feeCollectorAddr);

        vm.prank(regularSender);
        token.transfer(regularRecipient, amount);

        // No fee collected
        assertEq(token.balanceOf(feeCollectorAddr), collectorBefore);
        assertEq(token.balanceOf(regularRecipient), amount);
    }

    function testFuzz_freeze_blocksAnyTransfer(uint128 amount) public {
        vm.assume(amount > 0);
        address account = address(0xF00FF);
        token.mint(account, amount);
        token.freeze(account);

        vm.prank(account);
        vm.expectRevert(ERC20FreezableUpgradeable.AccountFrozen.selector);
        token.transfer(regularRecipient, amount);
    }

    // ─────────────────────────────────────────────
    // Governance e amministrazione — test documentativi
    // ─────────────────────────────────────────────

    /// @dev tutti i ruoli hanno DEFAULT_ADMIN_ROLE come role admin
    function test_getRoleAdmin_defaultAdminForAllRoles() public view {
        bytes32 defaultAdmin = token.DEFAULT_ADMIN_ROLE();
        assertEq(token.getRoleAdmin(token.UPGRADER_ROLE()), defaultAdmin);
        assertEq(token.getRoleAdmin(token.MINTER_ROLE()), defaultAdmin);
        assertEq(token.getRoleAdmin(token.BURNER_ROLE()), defaultAdmin);
        assertEq(token.getRoleAdmin(token.PAUSER_ROLE()), defaultAdmin);
        assertEq(token.getRoleAdmin(token.FREEZER_ROLE()), defaultAdmin);
        assertEq(token.getRoleAdmin(token.BLOCKER_ROLE()), defaultAdmin);
        assertEq(token.getRoleAdmin(token.FEE_ADMIN_ROLE()), defaultAdmin);
        assertEq(token.getRoleAdmin(token.SWEEPER_ROLE()), defaultAdmin);
        assertEq(token.getRoleAdmin(token.RECOVERER_ROLE()), defaultAdmin);
    }

    /// @dev Con AccessControlDefaultAdminRules un renounce diretto di
    /// DEFAULT_ADMIN_ROLE (senza schedule) reverta sempre: protegge da un
    /// lockout accidentale della governance.
    function test_renounceLastAdmin_directRenounceReverts() public {
        bytes32 adminRole = token.DEFAULT_ADMIN_ROLE();
        assertTrue(token.hasRole(adminRole, admin));

        vm.expectRevert(
            abi.encodeWithSelector(IAccessControlDefaultAdminRules.AccessControlEnforcedDefaultAdminDelay.selector, 0)
        );
        token.renounceRole(adminRole, admin);
    }

    /// @dev DOCUMENTATIVO: dopo lo schedule esplicito a address(0) e il delay,
    /// il renounce va a buon fine e la governance resta IRREVERSIBILMENTE senza
    /// DEFAULT_ADMIN_ROLE (nessuno può più fare grant/revoke né schedulare un
    /// nuovo admin). Regola operativa in AGENTS.md §16.11: mai renounce senza
    /// secondo admin già insediato.
    function test_renounceLastAdmin_afterScheduledTransferToZero_locksGovernanceIrreversibly() public {
        bytes32 adminRole = token.DEFAULT_ADMIN_ROLE();

        token.beginDefaultAdminTransfer(address(0));
        (, uint48 schedule) = token.pendingDefaultAdmin();
        vm.warp(schedule + 1);

        token.renounceRole(adminRole, admin);
        assertFalse(token.hasRole(adminRole, admin));

        // Da qui la governance è persa: nessun grant possibile
        // (ruolo letto prima dell'expectRevert: la staticcall lo consumerebbe)
        bytes32 minterRole = token.MINTER_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, admin, adminRole)
        );
        token.grantRole(minterRole, regularSender);
    }

    /// @dev upgrade verso un contratto NON-UUPS (senza proxiableUUID) rifiutato
    function test_upgradeToNonUUPSImplementationReverts() public {
        NotUUPS notUups = new NotUUPS();

        // Il rollback check di OZ reverta (ERC1967InvalidImplementation)
        vm.expectRevert();
        token.upgradeToAndCall(address(notUups), "");
    }

    /// @dev flusso gasless completo: permit (firma EIP-2612) + transferFrom
    /// eseguiti dal relayer, con transfer fee attiva
    function test_permitThenTransferFrom_gaslessFlow() public {
        uint256 ownerPk = 0xBEEF01;
        address owner = vm.addr(ownerPk);
        address spender = regularSender;
        uint256 value = 1_000 * 10 ** 18;
        uint256 deadline = block.timestamp + 1 hours;

        token.mint(owner, value);

        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                owner,
                spender,
                value,
                token.nonces(owner),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, digest);

        // Il relayer (chiunque) presenta il permit, poi lo spender trasferisce
        token.permit(owner, spender, value, deadline, v, r, s);
        assertEq(token.allowance(owner, spender), value);
        assertEq(token.nonces(owner), 1);

        vm.prank(spender);
        token.transferFrom(owner, regularRecipient, value);

        // percorso NETTO: fee 1% dedotta, allowance interamente consumata
        uint256 fee = (value * INITIAL_FEE) / 10000;
        assertEq(token.balanceOf(regularRecipient), value - fee);
        assertEq(token.balanceOf(feeCollectorAddr), fee);
        assertEq(token.allowance(owner, spender), 0);
    }

    // ─────────────────────────────────────────────
    // v2.5.0 — audit fixes (A4 zero-address guard) + view additions
    // ─────────────────────────────────────────────

    /// @dev A4: freeze/unfreeze(address(0)) revert instead of emitting a spurious event
    function test_freeze_zeroAddressReverts() public {
        vm.expectRevert(ERC20FreezableUpgradeable.InvalidFreezeAccount.selector);
        token.freeze(address(0));
        vm.expectRevert(ERC20FreezableUpgradeable.InvalidFreezeAccount.selector);
        token.unfreeze(address(0));
    }

    /// @dev A4: blockAccount/unblockAccount(address(0)) revert
    function test_block_zeroAddressReverts() public {
        vm.expectRevert(ERC20BlocklistUpgradeable.InvalidBlockAccount.selector);
        token.blockAccount(address(0));
        vm.expectRevert(ERC20BlocklistUpgradeable.InvalidBlockAccount.selector);
        token.unblockAccount(address(0));
    }

    /// @dev isRestricted == blocked || frozen (single authoritative check)
    function test_isRestricted_combinesBlockAndFreeze() public {
        assertFalse(token.isRestricted(regularSender));
        token.freeze(regularSender);
        assertTrue(token.isRestricted(regularSender));
        token.unfreeze(regularSender);
        assertFalse(token.isRestricted(regularSender));
        token.blockAccount(regularSender);
        assertTrue(token.isRestricted(regularSender));
    }

    /// @dev exempt count getters track the set size (O(1))
    function test_exemptCounts_trackSetSize() public {
        assertEq(token.getTransferFeeExemptCount(), 0);
        assertEq(token.getCustodyFeeExemptCount(), 0);

        token.addTransferFeeExempt(regularSender);
        token.addTransferFeeExempt(regularRecipient);
        token.addCustodyFeeExempt(regularSender);

        assertEq(token.getTransferFeeExemptCount(), 2);
        assertEq(token.getCustodyFeeExemptCount(), 1);

        token.removeTransferFeeExempt(regularSender);
        assertEq(token.getTransferFeeExemptCount(), 1);
    }
}

/// @dev contratto privo di proxiableUUID per il test di upgrade rifiutato
contract NotUUPS {}
