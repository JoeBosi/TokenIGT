// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../interfaces/IERC3009.sol";

/**
 * @title ERC20EIP3009Upgradeable
 * @dev Extension of ERC20 that implements EIP-3009 Transfer With Authorization
 * Uses ERC-7201 namespaced storage pattern
 */
abstract contract ERC20EIP3009Upgradeable is Initializable, EIP712Upgradeable, IERC3009 {
    // ERC-7201 namespace: advanced.token.eip3009
    bytes32 private constant STORAGE_LOCATION = keccak256(
        abi.encode(uint256(keccak256("advanced.token.eip3009.storage")) - 1)
    );

    /// @custom:storage-location erc7201:advanced.token.eip3009.storage
    struct EIP3009Storage {
        mapping(address authorizer => mapping(bytes32 nonce => bool used)) authorizationState;
    }

    error AuthorizationAlreadyUsed();
    error InvalidSignature();
    error AuthorizationExpired();
    error AuthorizationNotYetValid();
    error InvalidNonce();

    bytes32 private constant TYPE_HASH =
        keccak256(
            "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
        );

    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    function __ERC20EIP3009_init() internal onlyInitializing {
        // EIP712 is initialized by ERC20Permit, no need to initialize again
    }

    function __ERC20EIP3009_init_unchained() internal onlyInitializing {}

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
    ) public {
        _validateAuthorization(from, to, value, validAfter, validBefore, nonce, v, r, s);
        
        EIP3009Storage storage $ = _getEIP3009Storage();
        $.authorizationState[from][nonce] = true;
        
        emit AuthorizationUsed(from, nonce);
        
        _executeTransfer(from, to, value);
    }

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
    ) public {
        if (to != msg.sender) {
            revert InvalidSignature();
        }
        
        _validateAuthorization(from, to, value, validAfter, validBefore, nonce, v, r, s);
        
        EIP3009Storage storage $ = _getEIP3009Storage();
        $.authorizationState[from][nonce] = true;
        
        emit AuthorizationUsed(from, nonce);
        
        _executeTransfer(from, to, value);
    }

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
    ) public {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("CancelAuthorization(address authorizer,bytes32 nonce)"),
                authorizer,
                nonce
            )
        );

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, v, r, s);

        if (signer != authorizer) {
            revert InvalidSignature();
        }

        EIP3009Storage storage $ = _getEIP3009Storage();
        if ($.authorizationState[authorizer][nonce]) {
            revert AuthorizationAlreadyUsed();
        }

        $.authorizationState[authorizer][nonce] = true;
        emit AuthorizationCanceled(authorizer, nonce);
    }

    /**
     * @notice Check the state of an authorization
     * @param authorizer The address that signed the authorization
     * @param nonce The nonce to check
     * @return true if the authorization has been used, false otherwise
     */
    function authorizationState(address authorizer, bytes32 nonce) public view returns (bool) {
        EIP3009Storage storage $ = _getEIP3009Storage();
        return $.authorizationState[authorizer][nonce];
    }

    function _validateAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) private {
        bytes32 structHash = keccak256(
            abi.encode(TYPE_HASH, from, to, value, validAfter, validBefore, nonce)
        );

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, v, r, s);

        if (signer != from) {
            revert InvalidSignature();
        }

        EIP3009Storage storage $ = _getEIP3009Storage();
        if ($.authorizationState[from][nonce]) {
            revert AuthorizationAlreadyUsed();
        }

        if (block.timestamp < validAfter) {
            revert AuthorizationNotYetValid();
        }

        if (block.timestamp >= validBefore) {
            revert AuthorizationExpired();
        }
    }

    function _getEIP3009Storage() private pure returns (EIP3009Storage storage $) {
        bytes32 position = keccak256(abi.encode(uint256(keccak256("advanced.token.eip3009.storage")) - 1));
        assembly {
            $.slot := position
        }
    }

    // Virtual function to be implemented by the main contract
    function _executeTransfer(address from, address to, uint256 value) internal virtual;
}
