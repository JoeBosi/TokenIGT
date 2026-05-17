// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IERC3009
 * @dev Interface for the ERC3009 Transfer With Authorization standard
 */
interface IERC3009 {
    /**
     * @notice Execute a transfer with authorization from the sender
     * @param from The address that signed the authorization
     * @param to The recipient address
     * @param value The amount to transfer
     * @param validAfter The time after which this authorization is valid
     * @param validBefore The time before which this authorization is valid
     * @param nonce Unique nonce for this authorization
     * @param v The recovery ID
     * @param r The signature output r
     * @param s The signature output s
     */
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @notice Receive a transfer with authorization (only callable by recipient)
     * @param from The address that signed the authorization
     * @param to The recipient address (must be msg.sender)
     * @param value The amount to transfer
     * @param validAfter The time after which this authorization is valid
     * @param validBefore The time before which this authorization is valid
     * @param nonce Unique nonce for this authorization
     * @param v The recovery ID
     * @param r The signature output r
     * @param s The signature output s
     */
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @notice Cancel a previously authorized transfer
     * @param authorizer The address that signed the authorization
     * @param nonce The nonce of the authorization to cancel
     * @param v The recovery ID
     * @param r The signature output r
     * @param s The signature output s
     */
    function cancelAuthorization(
        address authorizer,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @notice Check the state of an authorization
     * @param authorizer The address that signed the authorization
     * @param nonce The nonce to check
     * @return true if the authorization has been used, false otherwise
     */
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
}
