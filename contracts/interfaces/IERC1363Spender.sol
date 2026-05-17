// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IERC1363Spender
 * @dev Interface for any contract that wants to support approveAndCall
 */
interface IERC1363Spender {
    /**
     * @notice Handle the approval of ERC1363 tokens
     * @dev Whenever an ERC1363 token spender is approved via approveAndCall,
     * this function is called. It must return its Solidity selector to confirm the approval.
     * @param owner The address which approved the tokens
     * @param value The amount of tokens approved
     * @param data Additional data with no specified format
     * @return `bytes4(keccak256("onApprovalReceived(address,uint256,bytes)"))`
     */
    function onApprovalReceived(address owner, uint256 value, bytes calldata data) external returns (bytes4);
}
