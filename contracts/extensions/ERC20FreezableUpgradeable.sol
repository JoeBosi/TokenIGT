// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title ERC20FreezableUpgradeable
 * @dev Extension of ERC20 that allows accounts to be frozen
 * Uses ERC-7201 namespaced storage pattern
 */
abstract contract ERC20FreezableUpgradeable is Initializable, AccessControlUpgradeable {
    bytes32 public constant FREEZER_ROLE = keccak256("FREEZER_ROLE");

    // ERC-7201 namespace: advanced.token.freezable
    bytes32 private constant STORAGE_LOCATION = keccak256(
        abi.encode(uint256(keccak256("advanced.token.freezable.storage")) - 1)
    );

    struct FreezableStorage {
        mapping(address account => uint256 frozen) frozen;
    }

    error InsufficientUnfrozenBalance(uint256 requested, uint256 available);
    error InvalidFreezeAmount();
    error AccountFrozen();

    event Frozen(address indexed account);
    event Unfrozen(address indexed account);

    function __ERC20Freezable_init() internal onlyInitializing {
        __AccessControl_init();
    }

    function __ERC20Freezable_init_unchained() internal onlyInitializing {}

    /**
     * @notice Returns the amount of tokens frozen for an account
     * @param account The address to check
     * @return The amount of frozen tokens (type(uint256).max means "frozen all")
     */
    function frozenOf(address account) public view returns (uint256) {
        FreezableStorage storage $ = _getFreezableStorage();
        return $.frozen[account];
    }

    /**
     * @notice Returns the available (unfrozen) balance of an account
     * @param account The address to check
     * @return The available balance (balanceOf - frozen, clamped to 0)
     */
    function availableBalanceOf(address account) public view returns (uint256) {
        uint256 balance = balanceOf(account);
        uint256 frozen = frozenOf(account);
        
        if (frozen >= balance) {
            return 0;
        }
        return balance - frozen;
    }

    /**
     * @notice Freeze a specific amount of tokens for an account
     * @param account The address to freeze
     * @param amount The amount to freeze (type(uint256).max for "frozen all")
     */
    function freeze(address account, uint256 amount) public virtual onlyRole(FREEZER_ROLE) {
        FreezableStorage storage $ = _getFreezableStorage();
        $.frozen[account] = amount;
    }

    /**
     * @notice Freeze all tokens for an account
     * @param account The address to freeze
     */
    function freezeAll(address account) public virtual onlyRole(FREEZER_ROLE) {
        FreezableStorage storage $ = _getFreezableStorage();
        $.frozen[account] = type(uint256).max;
        emit Frozen(account);
    }

    /**
     * @notice Unfreeze an account
     * @param account The address to unfreeze
     */
    function unfreeze(address account) public virtual onlyRole(FREEZER_ROLE) {
        FreezableStorage storage $ = _getFreezableStorage();
        $.frozen[account] = 0;
        emit Unfrozen(account);
    }

    /**
     * @notice Reduce the frozen amount for an account
     * @param account The address to reduce frozen amount for
     * @param amount The amount to reduce by
     */
    function reduceFrozen(address account, uint256 amount) public onlyRole(FREEZER_ROLE) {
        FreezableStorage storage $ = _getFreezableStorage();
        uint256 currentFrozen = $.frozen[account];
        
        if (currentFrozen < amount) {
            revert InvalidFreezeAmount();
        }
        
        $.frozen[account] = currentFrozen - amount;
    }

    /**
     * @dev Hook that is called before any transfer of tokens
     * Checks if the sender has sufficient unfrozen balance
     * BURNER_ROLE can override this check
     */
    function _beforeTokenTransfer(address from, address to, uint256 value) internal virtual {
        // Skip check for mint/burn (from or to == address(0))
        if (from == address(0) || to == address(0)) {
            return;
        }

        // Check if sender is frozen
        uint256 frozen = frozenOf(from);
        if (frozen != 0) {
            uint256 balance = balanceOf(from);
            uint256 available = frozen >= balance ? 0 : balance - frozen;
            
            if (value > available) {
                revert AccountFrozen();
            }
        }

        // Check if recipient is frozen
        uint256 recipientFrozen = frozenOf(to);
        if (recipientFrozen != 0) {
            revert AccountFrozen();
        }
    }

    function _getFreezableStorage() private pure returns (FreezableStorage storage $) {
        bytes32 position = keccak256(abi.encode(uint256(keccak256("advanced.token.freezable.storage")) - 1));
        assembly {
            $.slot := position
        }
    }

    // Virtual function to be implemented by the main contract
    function balanceOf(address account) public view virtual returns (uint256);
}
