// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title ERC20FreezableUpgradeable
 * @dev Extension of ERC20 that allows accounts to be frozen (binary: an account
 * is either fully frozen or not frozen). A frozen account cannot send or receive
 * tokens; the enforcement is performed by the main contract in `_update`.
 * Uses ERC-7201 namespaced storage.
 */
abstract contract ERC20FreezableUpgradeable is Initializable, AccessControlUpgradeable {
    bytes32 public constant FREEZER_ROLE = keccak256("FREEZER_ROLE");

    /// @dev keccak256(abi.encode(uint256(keccak256("advanced.token.freezable.storage")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant FREEZABLE_STORAGE_LOCATION =
        0x9ec908011c89430f338863c20a5533fb7b09dd8c54e64bb2522918b35f55bf00;

    /// @custom:storage-location erc7201:advanced.token.freezable.storage
    struct FreezableStorage {
        mapping(address account => bool frozen) frozen;
    }

    error AccountFrozen();
    /// @dev freeze/unfreeze called with the zero address (no-op target)
    error InvalidFreezeAccount();

    event Frozen(address indexed account);
    event Unfrozen(address indexed account);

    function __ERC20Freezable_init() internal onlyInitializing {}

    function __ERC20Freezable_init_unchained() internal onlyInitializing {}

    /**
     * @notice Check if an account is frozen
     * @param account The address to check
     * @return true if the account is frozen
     */
    function isFrozen(address account) public view returns (bool) {
        return _getFreezableStorage().frozen[account];
    }

    /**
     * @notice Freeze an account (idempotent: no effect and no event if already frozen)
     * @param account The address to freeze (must not be the zero address)
     */
    function freeze(address account) public onlyRole(FREEZER_ROLE) {
        if (account == address(0)) revert InvalidFreezeAccount();
        FreezableStorage storage $ = _getFreezableStorage();
        if (!$.frozen[account]) {
            $.frozen[account] = true;
            emit Frozen(account);
        }
    }

    /**
     * @notice Unfreeze an account (idempotent: no effect and no event if not frozen)
     * @param account The address to unfreeze (must not be the zero address)
     */
    function unfreeze(address account) public onlyRole(FREEZER_ROLE) {
        if (account == address(0)) revert InvalidFreezeAccount();
        FreezableStorage storage $ = _getFreezableStorage();
        if ($.frozen[account]) {
            $.frozen[account] = false;
            emit Unfrozen(account);
        }
    }

    function _getFreezableStorage() private pure returns (FreezableStorage storage $) {
        assembly {
            $.slot := FREEZABLE_STORAGE_LOCATION
        }
    }
}
