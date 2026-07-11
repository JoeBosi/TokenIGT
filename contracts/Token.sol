// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlDefaultAdminRulesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "./extensions/ERC20FreezableUpgradeable.sol";
import "./extensions/ERC20BlocklistUpgradeable.sol";
import "./extensions/ERC20TransferFeeUpgradeable.sol";
import "./extensions/ERC20CustodyFeeUpgradeable.sol";
import "./extensions/ERC20EIP3009Upgradeable.sol";
import "./extensions/ERC1363PayableUpgradeable.sol";
import "./extensions/ERC20RecoverableUpgradeable.sol";
import "./extensions/ContractURIsUpgradeable.sol";

/**
 * @title IGE Token (IGT)
 * @dev ERC-20 with UUPS upgradeability, role-based access control, pause,
 * freeze (binary), blocklist, transfer fee, periodic custody fee, EIP-2612,
 * EIP-3009, ERC-1363 and asset recovery.
 *
 * PEG (see PEG_ORO.md): 1 IGT = 2 grams of fine gold (Au 999.9) held in custody.
 * `reserveInfoURI` (ContractURIsUpgradeable) points to the periodic proof-of-reserve
 * attestations; supply is expected to satisfy totalSupply() * 2g <= attested grams
 * (mint/burn discipline documented in PEG_ORO.md, not enforced on-chain).
 *
 * Fee semantics (see SPEC_FEE_CUSTODIA.md):
 * - `transfer`/`transferFrom`: the fee is DEDUCTED from the amount — the
 *   recipient receives the net, the fee goes to the collector;
 * - ERC-1363 (`transferAndCall`, `transferFromAndCall`) and EIP-3009
 *   (`transferWithAuthorization`, `receiveWithAuthorization`): the recipient
 *   receives EXACTLY the stated value and the sender pays value + fee
 *   (for `transferFromAndCall` the allowance must cover the gross);
 * - custody fee: collected in cycles via `sweepCustodyFee`, bypassing pause,
 *   transfer fee, blocklist and freeze (custody is due even from blocked or
 *   frozen accounts, and sweeps run while the token is paused).
 *
 * Canonical order of checks on standard transfers:
 * BLOCK -> FREEZE -> FEE -> PAUSE (enforced at settlement) -> SETTLEMENT
 *
 * Governance (v2.4.0): DEFAULT_ADMIN_ROLE follows AccessControlDefaultAdminRules
 * (two-step transfer with delay, see `beginDefaultAdminTransfer`/
 * `acceptDefaultAdminTransfer`). The former FEE_MANAGER_ROLE is split into
 * FEE_ADMIN_ROLE (governance: fee/collector/treasury setters, multisig) and
 * SWEEPER_ROLE (operational: startNewCycle/sweepCustodyFee, hot wallet).
 */
contract Token is
    Initializable,
    ERC20Upgradeable,
    ERC20PermitUpgradeable,
    ERC20PausableUpgradeable,
    AccessControlDefaultAdminRulesUpgradeable,
    UUPSUpgradeable,
    ERC20FreezableUpgradeable,
    ERC20BlocklistUpgradeable,
    ERC20TransferFeeUpgradeable,
    ERC20CustodyFeeUpgradeable,
    ERC20EIP3009Upgradeable,
    ERC1363PayableUpgradeable,
    ERC20RecoverableUpgradeable,
    ContractURIsUpgradeable
{
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    error InvalidAdmin();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the token
     * @param name_ Token name
     * @param symbol_ Token symbol
     * @param initialSupply_ Initial supply to mint (0 to skip)
     * @param initialHolder_ Address to receive initial supply
     * @param transferFeeBps_ Initial transfer fee in basis points (max 100)
     * @param feeCollector_ Address to collect transfer fees
     * @param custodyFeeBps_ Initial custody fee in basis points (max 200)
     * @param custodyTreasury_ Address to receive custody fees
     * @param defaultAdmin_ Address to receive DEFAULT_ADMIN_ROLE (governance,
     * intended to be a multisig)
     * @param adminTransferDelay_ Delay (seconds) enforced by
     * AccessControlDefaultAdminRules on any future DEFAULT_ADMIN_ROLE transfer
     * @dev Only governance roles (UPGRADER, FEE_ADMIN, RECOVERER) are granted
     * to the admin here; operational roles (MINTER, BURNER, PAUSER, FREEZER,
     * BLOCKER, SWEEPER) are granted post-deploy to dedicated addresses via
     * scripts (see scripts/roles/finalize_governance.ts).
     */
    function initialize(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply_,
        address initialHolder_,
        uint256 transferFeeBps_,
        address feeCollector_,
        uint256 custodyFeeBps_,
        address custodyTreasury_,
        address defaultAdmin_,
        uint48 adminTransferDelay_
    ) public initializer {
        if (defaultAdmin_ == address(0)) {
            revert InvalidAdmin();
        }

        __ERC20_init(name_, symbol_);
        __ERC20Permit_init(name_);
        __ERC20Pausable_init();
        __AccessControlDefaultAdminRules_init(adminTransferDelay_, defaultAdmin_);
        __ERC20Freezable_init();
        __ERC20Blocklist_init();
        __ERC20TransferFee_init(transferFeeBps_, feeCollector_);
        __ERC20CustodyFee_init(custodyFeeBps_, custodyTreasury_);
        __ERC20EIP3009_init();
        __ERC1363Payable_init();
        __ERC20Recoverable_init();
        __ContractURIs_init();

        // DEFAULT_ADMIN_ROLE already granted by __AccessControlDefaultAdminRules_init above
        _grantRole(UPGRADER_ROLE, defaultAdmin_);
        _grantRole(FEE_ADMIN_ROLE, defaultAdmin_);
        _grantRole(RECOVERER_ROLE, defaultAdmin_);

        if (initialSupply_ > 0 && initialHolder_ != address(0)) {
            _mint(initialHolder_, initialSupply_);
        }
    }

    // ========================================
    // SUPPLY & PAUSE
    // ========================================

    /**
     * @notice Mint new tokens
     * @param to Address to mint tokens to
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /**
     * @notice Burn tokens from an address
     * @param from Address to burn tokens from
     * @param amount Amount to burn
     */
    function burn(address from, uint256 amount) public onlyRole(BURNER_ROLE) {
        _burn(from, amount);
    }

    /**
     * @notice Pause all transfers (custody sweep excluded)
     */
    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause all transfers
     */
    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ========================================
    // TRANSFER PIPELINE
    // ========================================

    /**
     * @dev Centralized security checks (BLOCK + FREEZE).
     * Skipped for mint/burn (from or to == address(0)).
     */
    function _runSecurityChecks(address from, address to) private view {
        if (from == address(0) || to == address(0)) return;
        if (isBlocked(from) || isBlocked(to)) revert AccountBlocked();
        if (isFrozen(from) || isFrozen(to)) revert AccountFrozen();
    }

    /**
     * @dev Standard transfer path (transfer/transferFrom/permit-based spends).
     * Net fee semantics: the recipient receives value - fee.
     * Order: BLOCK -> FREEZE -> FEE -> PAUSE (enforced by super._update) -> SETTLEMENT.
     *
     * POLICY (decisione 2026-07-06): the fee leg to the collector intentionally
     * bypasses blocklist/freeze checks — a blocked or frozen collector still
     * RECEIVES fees. Rationale: if the fee leg reverted, blocking the collector
     * would paralyze every non-exempt transfer of the token. The collector is a
     * FEE_ADMIN-chosen address; if compromised, the remedy is
     * setFeeCollector(new), not blocking it. Blocking it remains useful: it
     * prevents SPENDING while funds keep accruing. Consistent with D3 (custody
     * treasury). Guarded by test_policy_* in TokenFeeSemanticsTest.
     */
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20Upgradeable, ERC20PausableUpgradeable)
    {
        _runSecurityChecks(from, to);

        if (from != address(0) && to != address(0)) {
            uint256 feeAmount = _calculateTransferFee(from, to, value);

            if (feeAmount > 0) {
                address collector = feeCollector();

                super._update(from, to, value - feeAmount);

                // If the collector is the sender the fee simply stays with them
                if (collector != from) {
                    super._update(from, collector, feeAmount);
                }
            } else {
                super._update(from, to, value);
            }
        } else {
            // Mint or burn: no fee
            super._update(from, to, value);
        }
    }

    /**
     * @dev Gross transfer path (ERC-1363 and EIP-3009): `to` receives exactly
     * `value`, `from` additionally pays the fee. Pause, blocklist and freeze
     * are enforced; the sender balance must cover value + fee.
     * Same collector policy as `_update`: the fee leg bypasses blocklist/freeze.
     */
    function _grossTransfer(address from, address to, uint256 value) private {
        _runSecurityChecks(from, to);

        uint256 feeAmount = _calculateTransferFee(from, to, value);

        // super._update = ERC20PausableUpgradeable._update: enforces pause,
        // skips the net-fee logic of this contract's _update
        super._update(from, to, value);

        if (feeAmount > 0) {
            address collector = feeCollector();
            if (collector != from) {
                super._update(from, collector, feeAmount);
            }
        }
    }

    /**
     * @dev EIP-3009 transfers: gross fee semantics
     */
    function _executeTransfer(address from, address to, uint256 value) internal override {
        _grossTransfer(from, to, value);
    }

    /**
     * @dev ERC-1363 transferAndCall: gross fee semantics
     */
    function _transfer1363(address from, address to, uint256 value) internal override {
        _grossTransfer(from, to, value);
    }

    /**
     * @dev ERC-1363 transferFromAndCall: the allowance must cover the gross
     * (value + fee), then gross fee semantics
     */
    function _transferFrom1363(address from, address spender, address to, uint256 value) internal override {
        uint256 feeAmount = _calculateTransferFee(from, to, value);
        _spendAllowance(from, spender, value + feeAmount);
        _grossTransfer(from, to, value);
    }

    /**
     * @dev ERC-1363 approveAndCall
     */
    function _approve1363(address owner, address spender, uint256 value) internal override {
        _approve(owner, spender, value);
    }

    /**
     * @dev Custody fee collection: direct base-implementation call, bypassing
     * pause, transfer fee, blocklist and freeze (see D3 in SPEC_FEE_CUSTODIA.md).
     * Only reachable from `sweepCustodyFee` (SWEEPER_ROLE).
     */
    function _collectCustodyFee(address from, address to, uint256 amount) internal override {
        ERC20Upgradeable._update(from, to, amount);
    }

    // ========================================
    // FEE PREVIEW VIEWS
    // ========================================

    /**
     * @notice Net amount the recipient receives on `transfer`/`transferFrom`
     * of `grossAmount` (assumes both parties are NOT fee-exempt)
     */
    function previewNet(uint256 grossAmount) public view returns (uint256) {
        return grossAmount - (grossAmount * transferFeeBps()) / 10000;
    }

    /**
     * @notice Smallest gross amount to pass to `transfer`/`transferFrom` so the
     * recipient receives at least `netAmount` (assumes both parties are NOT
     * fee-exempt). On ERC-1363/EIP-3009 paths no conversion is needed: the
     * recipient always receives exactly the stated value.
     */
    function previewGross(uint256 netAmount) public view returns (uint256) {
        uint256 bps = transferFeeBps();
        if (bps == 0 || netAmount == 0) {
            return netAmount;
        }
        // Smallest g with g - floor(g*bps/10000) >= net, i.e. ceil-inverse of previewNet
        return ((netAmount - 1) * 10000) / (10000 - bps) + 1;
    }

    /**
     * @notice Maximum value a sender can deliver via the gross paths
     * (ERC-1363/EIP-3009), i.e. the largest v with v + fee(v) <= balance.
     * Returns the full balance if the sender is fee-exempt, 0 if the sender is
     * blocked or frozen. Assumes the recipient is NOT fee-exempt.
     * For `transfer`/`transferFrom` the equivalent is `previewNet(balanceOf(sender))`.
     */
    function maxNetTransferable(address sender) public view returns (uint256) {
        if (isBlocked(sender) || isFrozen(sender)) {
            return 0;
        }

        uint256 balance = balanceOf(sender);
        uint256 bps = transferFeeBps();
        if (bps == 0 || isTransferFeeExempt(sender)) {
            return balance;
        }

        uint256 v = (balance * 10000) / (10000 + bps);
        // Rounding correction: at most 2 iterations by construction
        while (v + 1 + ((v + 1) * bps) / 10000 <= balance) {
            v++;
        }
        return v;
    }

    // ========================================
    // UPGRADE & METADATA
    // ========================================

    /**
     * @dev Authorize upgrade (UUPS)
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    /**
     * @notice Contract version
     */
    function version() public pure virtual returns (string memory) {
        return "2.4.0";
    }

    // ========================================
    // OVERRIDE RESOLUTION
    // ========================================

    /**
     * @dev balanceOf: shared by ERC20 and the custody fee extension
     */
    function balanceOf(address account)
        public
        view
        override(ERC20Upgradeable, ERC20CustodyFeeUpgradeable, IERC20)
        returns (uint256)
    {
        return super.balanceOf(account);
    }

    /**
     * @dev Diamond resolution: the other extensions (TransferFee, CustodyFee,
     * Freezable, Blocklist, Recoverable) inherit plain AccessControlUpgradeable,
     * while the main contract inherits AccessControlDefaultAdminRulesUpgradeable
     * (which overrides these to enforce the two-step DEFAULT_ADMIN_ROLE
     * transfer). Explicit overrides required by the compiler; all delegate to
     * `super` so both layers of logic run in the correct (C3) order.
     */
    function _grantRole(bytes32 role, address account)
        internal
        override(AccessControlUpgradeable, AccessControlDefaultAdminRulesUpgradeable)
        returns (bool)
    {
        return super._grantRole(role, account);
    }

    function _revokeRole(bytes32 role, address account)
        internal
        override(AccessControlUpgradeable, AccessControlDefaultAdminRulesUpgradeable)
        returns (bool)
    {
        return super._revokeRole(role, account);
    }

    function _setRoleAdmin(bytes32 role, bytes32 adminRole)
        internal
        override(AccessControlUpgradeable, AccessControlDefaultAdminRulesUpgradeable)
    {
        super._setRoleAdmin(role, adminRole);
    }

    function grantRole(bytes32 role, address account)
        public
        override(AccessControlUpgradeable, AccessControlDefaultAdminRulesUpgradeable)
    {
        super.grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account)
        public
        override(AccessControlUpgradeable, AccessControlDefaultAdminRulesUpgradeable)
    {
        super.revokeRole(role, account);
    }

    function renounceRole(bytes32 role, address account)
        public
        override(AccessControlUpgradeable, AccessControlDefaultAdminRulesUpgradeable)
    {
        super.renounceRole(role, account);
    }

    /**
     * @dev supportsInterface: ERC1363 + AccessControlDefaultAdminRules (+ ERC165)
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControlUpgradeable, AccessControlDefaultAdminRulesUpgradeable, ERC1363PayableUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
