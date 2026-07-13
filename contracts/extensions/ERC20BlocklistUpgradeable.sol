// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title ERC20BlocklistUpgradeable
 * @dev Extension of ERC20 that allows accounts to be blocked. A blocked account
 * cannot send or receive tokens; the enforcement is performed by the main
 * contract in `_update`.
 * Uses ERC-7201 namespaced storage.
 */
abstract contract ERC20BlocklistUpgradeable is Initializable, AccessControlUpgradeable {
    bytes32 public constant BLOCKER_ROLE = keccak256("BLOCKER_ROLE");

    /// @dev keccak256(abi.encode(uint256(keccak256("advanced.token.blocklist.storage")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant BLOCKLIST_STORAGE_LOCATION =
        0xae61fd1dbbcf2c96a9921076fdce0cb105af32b600d8b7848d1f73cb0b9cc000;

    /// @custom:storage-location erc7201:advanced.token.blocklist.storage
    struct BlocklistStorage {
        mapping(address account => bool blocked) blocked;
    }

    error AccountBlocked();
    /// @dev blockAccount/unblockAccount called with the zero address (no-op target)
    error InvalidBlockAccount();

    event Blocked(address indexed account);
    event Unblocked(address indexed account);

    function __ERC20Blocklist_init() internal onlyInitializing {}

    function __ERC20Blocklist_init_unchained() internal onlyInitializing {}

    /**
     * @notice Check if an account is blocked
     * @param account The address to check
     * @return true if the account is blocked
     */
    function isBlocked(address account) public view returns (bool) {
        return _getBlocklistStorage().blocked[account];
    }

    /**
     * @notice Block an account (idempotent: no effect and no event if already blocked)
     * @param account The address to block (must not be the zero address)
     */
    function blockAccount(address account) public onlyRole(BLOCKER_ROLE) {
        if (account == address(0)) revert InvalidBlockAccount();
        BlocklistStorage storage $ = _getBlocklistStorage();
        if (!$.blocked[account]) {
            $.blocked[account] = true;
            emit Blocked(account);
        }
    }

    /**
     * @notice Unblock an account (idempotent: no effect and no event if not blocked)
     * @param account The address to unblock (must not be the zero address)
     */
    function unblockAccount(address account) public onlyRole(BLOCKER_ROLE) {
        if (account == address(0)) revert InvalidBlockAccount();
        BlocklistStorage storage $ = _getBlocklistStorage();
        if ($.blocked[account]) {
            $.blocked[account] = false;
            emit Unblocked(account);
        }
    }

    function _getBlocklistStorage() private pure returns (BlocklistStorage storage $) {
        assembly {
            $.slot := BLOCKLIST_STORAGE_LOCATION
        }
    }
}
