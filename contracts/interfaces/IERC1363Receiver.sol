// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IERC1363Receiver
 * @dev Interface for any contract that wants to support transferAndCall
 */
interface IERC1363Receiver {
    /**
     * @notice Handle the receipt of ERC1363 tokens
     * @dev Whenever an ERC1363 token is transferred to this contract via transferAndCall,
     * this function is called. It must return its Solidity selector to confirm the token transfer.
     * @param operator The address which called transferAndCall
     * @param from The address which transferred the tokens
     * @param value The amount of tokens transferred
     * @param data Additional data with no specified format
     * @return `bytes4(keccak256("onTransferReceived(address,address,uint256,bytes)"))`
     */
    function onTransferReceived(address operator, address from, uint256 value, bytes calldata data) external returns (bytes4);
}
