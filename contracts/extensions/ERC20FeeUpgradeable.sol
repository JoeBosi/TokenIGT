// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title ERC20FeeUpgradeable
 * @dev Extension of ERC20 that implements transaction fees with whitelist and cap
 * Uses ERC-7201 namespaced storage pattern
 */
abstract contract ERC20FeeUpgradeable is Initializable, AccessControlUpgradeable {
    bytes32 public constant FEE_ADMIN_ROLE = keccak256("FEE_ADMIN_ROLE");

    uint16 public constant MAX_FEE_BASIS_POINTS = 999; // 9.99% maximum

    // ERC-7201 namespace: advanced.token.fee
    bytes32 private constant STORAGE_LOCATION = keccak256(
        abi.encode(uint256(keccak256("advanced.token.fee.storage")) - 1)
    );

    struct FeeStorage {
        uint256 fee;                          // basis points (0–999)
        address feeCollector;
        mapping(address account => bool isFeeFree) isFeeFree;
    }

    error FeeExceedsMaximum(uint256 fee, uint256 maxFee);
    error InvalidFeeCollector();

    function __ERC20Fee_init(uint256 initialFee, address feeCollector_) internal onlyInitializing {
        __AccessControl_init();
        
        FeeStorage storage $ = _getFeeStorage();
        
        if (initialFee > MAX_FEE_BASIS_POINTS) {
            revert FeeExceedsMaximum(initialFee, MAX_FEE_BASIS_POINTS);
        }
        
        if (feeCollector_ == address(0)) {
            revert InvalidFeeCollector();
        }
        
        $.fee = initialFee;
        $.feeCollector = feeCollector_;
    }

    function __ERC20Fee_init_unchained() internal onlyInitializing {}

    /**
     * @notice Returns the current fee in basis points
     * @return The fee in basis points
     */
    function fee() public view returns (uint256) {
        FeeStorage storage $ = _getFeeStorage();
        return $.fee;
    }

    /**
     * @notice Returns the fee collector address
     * @return The fee collector address
     */
    function feeCollector() public view returns (address) {
        FeeStorage storage $ = _getFeeStorage();
        return $.feeCollector;
    }

    /**
     * @notice Check if an account is fee-free (whitelisted)
     * @param account The address to check
     * @return true if the account is fee-free
     */
    function isFeeFree(address account) public view returns (bool) {
        FeeStorage storage $ = _getFeeStorage();
        return $.isFeeFree[account];
    }

    /**
     * @notice Set the transaction fee
     * @param newFee The new fee in basis points (max 999)
     */
    function setFee(uint256 newFee) public onlyRole(FEE_ADMIN_ROLE) {
        if (newFee > MAX_FEE_BASIS_POINTS) {
            revert FeeExceedsMaximum(newFee, MAX_FEE_BASIS_POINTS);
        }
        
        FeeStorage storage $ = _getFeeStorage();
        $.fee = newFee;
    }

    /**
     * @notice Set the fee collector address
     * @param collector The new fee collector address
     */
    function setFeeCollector(address collector) public onlyRole(FEE_ADMIN_ROLE) {
        if (collector == address(0)) {
            revert InvalidFeeCollector();
        }
        
        FeeStorage storage $ = _getFeeStorage();
        $.feeCollector = collector;
    }

    /**
     * @notice Add an account to the fee-free whitelist
     * @param account The address to add
     */
    function addFeeFree(address account) public onlyRole(FEE_ADMIN_ROLE) {
        FeeStorage storage $ = _getFeeStorage();
        $.isFeeFree[account] = true;
    }

    /**
     * @notice Remove an account from the fee-free whitelist
     * @param account The address to remove
     */
    function removeFeeFree(address account) public onlyRole(FEE_ADMIN_ROLE) {
        FeeStorage storage $ = _getFeeStorage();
        $.isFeeFree[account] = false;
    }

    /**
     * @dev Calculate and apply fee during transfer
     * Fee is applied only if:
     * 1. fee != 0
     * 2. from != address(0) (not mint)
     * 3. to != address(0) (not burn)
     * 4. !isFeeFree[from]
     * 5. !isFeeFree[to]
     * @return The fee amount to deduct
     */
    function _calculateFee(address from, address to, uint256 value) internal view returns (uint256) {
        FeeStorage storage $ = _getFeeStorage();
        
        // Short-circuit if fee is zero
        if ($.fee == 0) {
            return 0;
        }
        
        // Skip fee for mint/burn
        if (from == address(0) || to == address(0)) {
            return 0;
        }
        
        // Skip fee if either party is whitelisted
        if ($.isFeeFree[from] || $.isFeeFree[to]) {
            return 0;
        }
        
        // Calculate fee: (value * fee) / 10000
        return (value * $.fee) / 10000;
    }

    function _getFeeStorage() private pure returns (FeeStorage storage $) {
        bytes32 position = keccak256(abi.encode(uint256(keccak256("advanced.token.fee.storage")) - 1));
        assembly {
            $.slot := position
        }
    }

    // Virtual function to be implemented by the main contract
    function _emitTransfer(address from, address to, uint256 value) internal virtual;
}
