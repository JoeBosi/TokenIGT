// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title FeeManagerRole
 * @dev Shared declaration of FEE_MANAGER_ROLE, used by both the transfer fee
 * and the custody fee extensions. Declared once to avoid identifier clashes
 * when both extensions are inherited by the same token.
 */
abstract contract FeeManagerRole {
    bytes32 public constant FEE_MANAGER_ROLE = keccak256("FEE_MANAGER_ROLE");
}
