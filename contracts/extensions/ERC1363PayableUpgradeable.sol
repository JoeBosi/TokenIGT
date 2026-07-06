// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/interfaces/IERC1363.sol";
import "@openzeppelin/contracts/interfaces/IERC1363Receiver.sol";
import "@openzeppelin/contracts/interfaces/IERC1363Spender.sol";

/**
 * @title ERC1363PayableUpgradeable
 * @dev ERC-1363 Payable Token extension: transferAndCall, transferFromAndCall,
 * approveAndCall with receiver/spender callbacks.
 *
 * Custom implementation (instead of OpenZeppelin's ERC1363Upgradeable) because
 * this token applies a GROSS fee semantic on ERC-1363 transfers: the recipient
 * receives exactly `value` and the sender pays `value + fee`. The transfer
 * mechanics are delegated to the main contract via virtual hooks.
 */
abstract contract ERC1363PayableUpgradeable is Initializable, ERC165Upgradeable, IERC1363 {
    bytes4 private constant ERC1363_RECEIVED = type(IERC1363Receiver).interfaceId;
    bytes4 private constant ERC1363_APPROVED = type(IERC1363Spender).interfaceId;

    bytes4 private constant INTERFACE_ID_ERC1363 = type(IERC1363).interfaceId;

    error ERC1363TransferFailed();
    error ERC1363ApprovalFailed();

    function __ERC1363Payable_init() internal onlyInitializing {
        __ERC165_init();
    }

    function __ERC1363Payable_init_unchained() internal onlyInitializing {}

    /**
     * @notice Transfer tokens and call the receiver contract
     * @param to The address to transfer to (receives exactly `value`)
     * @param value The amount the recipient receives; the sender pays value + fee
     * @return true if transfer and call successful
     */
    function transferAndCall(address to, uint256 value) public returns (bool) {
        return transferAndCall(to, value, "");
    }

    /**
     * @notice Transfer tokens and call the receiver contract with data
     * @param to The address to transfer to (receives exactly `value`)
     * @param value The amount the recipient receives; the sender pays value + fee
     * @param data Additional data for the callback
     * @return true if transfer and call successful
     */
    function transferAndCall(address to, uint256 value, bytes memory data) public returns (bool) {
        _transfer1363(msg.sender, to, value);

        _checkAndCallTransfer(msg.sender, to, value, data);

        return true;
    }

    /**
     * @notice Transfer tokens from one address to another and call the receiver contract
     * @param from The address to transfer from (pays value + fee; allowance must cover the gross)
     * @param to The address to transfer to (receives exactly `value`)
     * @param value The amount the recipient receives
     * @return true if transfer and call successful
     */
    function transferFromAndCall(address from, address to, uint256 value) public returns (bool) {
        return transferFromAndCall(from, to, value, "");
    }

    /**
     * @notice Transfer tokens from one address to another and call the receiver contract with data
     * @param from The address to transfer from (pays value + fee; allowance must cover the gross)
     * @param to The address to transfer to (receives exactly `value`)
     * @param value The amount the recipient receives
     * @param data Additional data for the callback
     * @return true if transfer and call successful
     */
    function transferFromAndCall(address from, address to, uint256 value, bytes memory data) public returns (bool) {
        _transferFrom1363(from, msg.sender, to, value);

        _checkAndCallTransfer(from, to, value, data);

        return true;
    }

    /**
     * @notice Approve spender and call the spender contract
     * @param spender The address to approve
     * @param value The amount to approve
     * @return true if approve and call successful
     */
    function approveAndCall(address spender, uint256 value) public returns (bool) {
        return approveAndCall(spender, value, "");
    }

    /**
     * @notice Approve spender and call the spender contract with data
     * @param spender The address to approve
     * @param value The amount to approve
     * @param data Additional data for the callback
     * @return true if approve and call successful
     */
    function approveAndCall(address spender, uint256 value, bytes memory data) public returns (bool) {
        _approve1363(msg.sender, spender, value);

        _checkAndCallApproval(msg.sender, spender, value, data);

        return true;
    }

    /**
     * @dev Check if the recipient is a contract and call onTransferReceived if so
     */
    function _checkAndCallTransfer(address from, address to, uint256 value, bytes memory data) private {
        if (_isContract(to)) {
            try IERC1363Receiver(to).onTransferReceived(msg.sender, from, value, data) returns (bytes4 retval) {
                if (retval != ERC1363_RECEIVED) {
                    revert ERC1363TransferFailed();
                }
            } catch {
                revert ERC1363TransferFailed();
            }
        }
    }

    /**
     * @dev Check if the spender is a contract and call onApprovalReceived if so
     */
    function _checkAndCallApproval(address owner, address spender, uint256 value, bytes memory data) private {
        if (_isContract(spender)) {
            try IERC1363Spender(spender).onApprovalReceived(owner, value, data) returns (bytes4 retval) {
                if (retval != ERC1363_APPROVED) {
                    revert ERC1363ApprovalFailed();
                }
            } catch {
                revert ERC1363ApprovalFailed();
            }
        }
    }

    /**
     * @dev Check if address is a contract
     */
    function _isContract(address account) private view returns (bool) {
        return account.code.length > 0;
    }

    /**
     * @dev Override supportsInterface to include ERC1363
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC165Upgradeable, IERC165)
        returns (bool)
    {
        return interfaceId == INTERFACE_ID_ERC1363 || super.supportsInterface(interfaceId);
    }

    // Virtual functions implemented by the main contract (gross fee semantics)
    function _transfer1363(address from, address to, uint256 value) internal virtual;
    function _transferFrom1363(address from, address spender, address to, uint256 value) internal virtual;
    function _approve1363(address owner, address spender, uint256 value) internal virtual;
}
