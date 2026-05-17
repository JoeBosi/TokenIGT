// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IERC1363
 * @dev Interface for the ERC1363 Payable Token standard
 */
interface IERC1363 {
    /**
     * @notice Transfer tokens and call the receiver contract
     * @param to The address to transfer to
     * @param value The amount to transfer
     * @return true if transfer and call successful
     */
    function transferAndCall(address to, uint256 value) external returns (bool);

    /**
     * @notice Transfer tokens and call the receiver contract with data
     * @param to The address to transfer to
     * @param value The amount to transfer
     * @param data Additional data for the callback
     * @return true if transfer and call successful
     */
    function transferAndCall(address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @notice Transfer tokens from one address to another and call the receiver contract
     * @param from The address to transfer from
     * @param to The address to transfer to
     * @param value The amount to transfer
     * @return true if transfer and call successful
     */
    function transferFromAndCall(address from, address to, uint256 value) external returns (bool);

    /**
     * @notice Transfer tokens from one address to another and call the receiver contract with data
     * @param from The address to transfer from
     * @param to The address to transfer to
     * @param value The amount to transfer
     * @param data Additional data for the callback
     * @return true if transfer and call successful
     */
    function transferFromAndCall(address from, address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @notice Approve spender and call the spender contract
     * @param spender The address to approve
     * @param value The amount to approve
     * @return true if approve and call successful
     */
    function approveAndCall(address spender, uint256 value) external returns (bool);

    /**
     * @notice Approve spender and call the spender contract with data
     * @param spender The address to approve
     * @param value The amount to approve
     * @param data Additional data for the callback
     * @return true if approve and call successful
     */
    function approveAndCall(address spender, uint256 value, bytes calldata data) external returns (bool);
}
