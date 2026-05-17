// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "./extensions/ERC20FreezableUpgradeable.sol";
import "./extensions/ERC20RestrictedUpgradeable.sol";
import "./extensions/ERC20FeeUpgradeable.sol";
import "./extensions/ERC20EIP3009Upgradeable.sol";
import "./extensions/ERC20_1363Upgradeable.sol";
import "./extensions/ERC20RecoverableUpgradeable.sol";

/**
 * @title IGE Token (IGT)
 * @dev Advanced ERC-20 token with UUPS upgradeability, access control, pause, freeze, block, fee, EIP-2612, EIP-3009, ERC-1363, and recovery
 */
contract Token is
    Initializable,
    ERC20Upgradeable,
    ERC20PermitUpgradeable,
    ERC20PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    ERC20FreezableUpgradeable,
    ERC20RestrictedUpgradeable,
    ERC20FeeUpgradeable,
    ERC20EIP3009Upgradeable,
    ERC20_1363Upgradeable,
    ERC20RecoverableUpgradeable
{
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the token
     * @param name_ Token name
     * @param symbol_ Token symbol
     * @param initialSupply_ Initial supply to mint
     * @param initialHolder_ Address to receive initial supply
     * @param initialFee_ Initial transaction fee in basis points
     * @param feeCollector_ Address to collect transaction fees
     * @param defaultAdmin_ Address to receive DEFAULT_ADMIN_ROLE
     */
    function initialize(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply_,
        address initialHolder_,
        uint256 initialFee_,
        address feeCollector_,
        address defaultAdmin_
    ) public initializer {
        __ERC20_init(name_, symbol_);
        __ERC20Permit_init(name_);
        __ERC20Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ERC20Freezable_init();
        __ERC20Restricted_init();
        __ERC20Fee_init(initialFee_, feeCollector_);
        __ERC20EIP3009_init();
        __ERC20_1363_init();
        __ERC20Recoverable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin_);
    }

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
     * @notice Pause all transfers
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

    /**
     * @dev Override _update to implement canonical order of checks
     * Order: PAUSE -> BLOCK -> FREEZE -> FEE -> SETTLEMENT
     */
    function _update(address from, address to, uint256 value) internal override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        // 1. PAUSE check (from ERC20PausableUpgradeable via whenNotPaused modifier)
        super._update(from, to, value);
    }

    /**
     * @dev Hook called before any transfer
     * Implements BLOCK and FREEZE checks in canonical order
     */
    function _beforeTokenTransfer(address from, address to, uint256 value) internal override {
        // 2. BLOCK check
        super._beforeTokenTransfer(from, to, value);
        
        // 3. FREEZE check
        super._beforeTokenTransfer(from, to, value);
    }

    /**
     * @dev Hook called after transfer to handle fee
     */
    function _afterTokenTransfer(address from, address to, uint256 value) internal override {
        // 4. FEE check and application
        uint256 feeAmount = _calculateFee(from, to, value);
        
        if (feeAmount > 0) {
            address collector = feeCollector();
            uint256 netValue = value - feeAmount;
            
            // Emit transfer event for fee
            _emitTransfer(from, collector, feeAmount);
            
            // Update balances for fee
            _update(from, collector, feeAmount);
            
            // Update balance for recipient with net value
            _update(from, to, netValue);
        }
    }

    /**
     * @dev Authorize upgrade (UUPS)
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    /**
     * @dev Implement _emitTransfer for fee module
     */
    function _emitTransfer(address from, address to, uint256 value) internal override {
        emit Transfer(from, to, value);
    }

    /**
     * @dev Implement _executeTransfer for EIP-3009 module
     */
    function _executeTransfer(address from, address to, uint256 value) internal override {
        _update(from, to, value);
    }

    /**
     * @dev Implement _transfer for ERC-1363 module
     */
    function _transfer(address from, address to, uint256 value) internal override {
        _update(from, to, value);
    }

    /**
     * @dev Implement _spendAllowance for ERC-1363 module
     */
    function _spendAllowance(address owner, address spender, uint256 value) internal override {
        uint256 current = allowance(owner, spender);
        if (current < value) {
            revert ERC20InsufficientAllowance(spender, current, value);
        }
        _approve(owner, spender, current - value);
    }

    /**
     * @dev Implement _approve for ERC-1363 module
     */
    function _approve(address owner, address spender, uint256 value) internal override {
        super._approve(owner, spender, value);
    }

    /**
     * @dev Implement balanceOf for ERC20FreezableUpgradeable module
     */
    function balanceOf(address account) public view override(ERC20Upgradeable, ERC20FreezableUpgradeable) returns (uint256) {
        return super.balanceOf(account);
    }
}
