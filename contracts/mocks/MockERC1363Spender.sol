// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IERC1363Spender.sol";

/**
 * @title MockERC1363Spender
 * @dev Mock contract for testing ERC-1363 approvals
 */
contract MockERC1363Spender is IERC1363Spender {
    bytes4 private constant ERC1363_APPROVED = type(IERC1363Spender).interfaceId;

    event ApprovalReceived(address indexed owner, uint256 value, bytes data);

    /**
     * @notice Handle the approval of ERC1363 tokens
     * @param owner The address which approved the tokens
     * @param value The amount of tokens approved
     * @param data Additional data with no specified format
     * @return ERC1363_APPROVED selector
     */
    function onApprovalReceived(address owner, uint256 value, bytes calldata data) external returns (bytes4) {
        emit ApprovalReceived(owner, value, data);
        return ERC1363_APPROVED;
    }
}
