// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title ERC20RestrictedUpgradeable
 * @dev Extension of ERC20 that allows accounts to be blocked
 * Uses ERC-7201 namespaced storage pattern
 */
abstract contract ERC20RestrictedUpgradeable is Initializable, AccessControlUpgradeable {
    bytes32 public constant BLOCKER_ROLE = keccak256("BLOCKER_ROLE");

    // ERC-7201 namespace: advanced.token.restricted
    bytes32 private constant STORAGE_LOCATION = keccak256(
        abi.encode(uint256(keccak256("advanced.token.restricted.storage")) - 1)
    );

    /// @custom:storage-location erc7201:advanced.token.restricted.storage
    struct RestrictedStorage {
        mapping(address account => bool blocked) blocked;
    }

    error AccountBlocked();

    event Blocked(address indexed account);
    event Unblocked(address indexed account);

    function __ERC20Restricted_init() internal onlyInitializing {
        __AccessControl_init();
    }

    function __ERC20Restricted_init_unchained() internal onlyInitializing {}

    /**
     * @notice Check if an account is blocked
     * @param account The address to check
     * @return true if the account is blocked
     */
    function isBlocked(address account) public view returns (bool) {
        RestrictedStorage storage $ = _getRestrictedStorage();
        return $.blocked[account];
    }

    /**
     * @notice Block an account
     * @param account The address to block
     */
    function blockUser(address account) public virtual onlyRole(BLOCKER_ROLE) {
        RestrictedStorage storage $ = _getRestrictedStorage();
        $.blocked[account] = true;
        emit Blocked(account);
    }

    /**
     * @notice Unblock an account
     * @param account The address to unblock
     */
    function resetUser(address account) public virtual onlyRole(BLOCKER_ROLE) {
        RestrictedStorage storage $ = _getRestrictedStorage();
        $.blocked[account] = false;
        emit Unblocked(account);
    }

    function _getRestrictedStorage() private pure returns (RestrictedStorage storage $) {
        bytes32 position = keccak256(abi.encode(uint256(keccak256("advanced.token.restricted.storage")) - 1));
        assembly {
            $.slot := position
        }
    }
}
