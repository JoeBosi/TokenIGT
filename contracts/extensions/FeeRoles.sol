// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title FeeRoles
 * @dev Shared declaration of the fee-related roles, used by both the transfer
 * fee and the custody fee extensions. Declared once to avoid identifier
 * clashes when both extensions are inherited by the same token.
 *
 * Split (v2.4.0) from the former single FEE_MANAGER_ROLE:
 * - FEE_ADMIN_ROLE:  governance — setters for bps/collector/treasury/exemptions.
 *   Infrequent, high-impact operations: intended for a MULTISIG.
 * - SWEEPER_ROLE:    operational — startNewCycle/sweepCustodyFee only. Frequent,
 *   many-transaction operations: intended for a HOT WALLET. Deliberately unable
 *   to change fee parameters or redirect collector/treasury, so a compromised
 *   hot key cannot redirect funds or raise fees to the cap.
 */
abstract contract FeeRoles {
    bytes32 public constant FEE_ADMIN_ROLE = keccak256("FEE_ADMIN_ROLE");
    bytes32 public constant SWEEPER_ROLE = keccak256("SWEEPER_ROLE");
}
