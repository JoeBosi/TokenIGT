// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IERC1363Receiver.sol";

/**
 * @title MockERC1363Receiver
 * @dev Mock contract for testing ERC-1363 transfers
 */
contract MockERC1363Receiver is IERC1363Receiver {
    bytes4 private constant ERC1363_RECEIVED = type(IERC1363Receiver).interfaceId;

    event TransferReceived(address indexed operator, address indexed from, uint256 value, bytes data);

    /**
     * @notice Handle the receipt of ERC1363 tokens
     * @param operator The address which called transferAndCall
     * @param from The address which transferred the tokens
     * @param value The amount of tokens transferred
     * @param data Additional data with no specified format
     * @return ERC1363_RECEIVED selector
     */
    function onTransferReceived(address operator, address from, uint256 value, bytes calldata data) external returns (bytes4) {
        emit TransferReceived(operator, from, value, data);
        return ERC1363_RECEIVED;
    }
}
