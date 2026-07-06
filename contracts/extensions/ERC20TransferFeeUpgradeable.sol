// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./FeeManagerRole.sol";

/**
 * @title ERC20TransferFeeUpgradeable
 * @dev Extension of ERC20 that implements a transfer fee (exchange fee) with an
 * enumerable exemption list and a hard cap.
 *
 * The fee amount is computed here; HOW the fee is charged is decided by the main
 * contract: on `transfer`/`transferFrom` the fee is deducted from the amount (the
 * recipient receives the net), on ERC-1363 and EIP-3009 paths the recipient
 * receives exactly the stated value and the sender pays value + fee.
 *
 * A transfer is exempt when the sender OR the recipient is in the exemption list.
 * Uses ERC-7201 namespaced storage.
 */
abstract contract ERC20TransferFeeUpgradeable is Initializable, AccessControlUpgradeable, FeeManagerRole {
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @dev Hard cap for the transfer fee: 100 basis points = 1%
    uint16 public constant MAX_TRANSFER_FEE_BPS = 100;

    /// @dev keccak256(abi.encode(uint256(keccak256("advanced.token.transferfee.storage")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant TRANSFER_FEE_STORAGE_LOCATION =
        0x9851a5d9269a2f8592e1e72e4aed280c65e9fe28fe206eb654b4acc69ef15500;

    /// @custom:storage-location erc7201:advanced.token.transferfee.storage
    struct TransferFeeStorage {
        uint16 transferFeeBps; // basis points (0-100), 0 = fee disabled
        address feeCollector;
        EnumerableSet.AddressSet exempt;
    }

    error FeeExceedsMaximum(uint256 requested, uint256 maximum);
    error InvalidFeeCollector();

    event TransferFeeUpdated(uint256 previousBps, uint256 newBps);
    event FeeCollectorUpdated(address indexed previousCollector, address indexed newCollector);
    event TransferFeeExemptionChanged(address indexed account, bool exempt);

    function __ERC20TransferFee_init(uint256 initialFeeBps, address feeCollector_) internal onlyInitializing {
        if (initialFeeBps > MAX_TRANSFER_FEE_BPS) {
            revert FeeExceedsMaximum(initialFeeBps, MAX_TRANSFER_FEE_BPS);
        }
        if (feeCollector_ == address(0)) {
            revert InvalidFeeCollector();
        }

        TransferFeeStorage storage $ = _getTransferFeeStorage();
        $.transferFeeBps = uint16(initialFeeBps);
        $.feeCollector = feeCollector_;
    }

    function __ERC20TransferFee_init_unchained() internal onlyInitializing {}

    /**
     * @notice Current transfer fee in basis points (0 = disabled)
     */
    function transferFeeBps() public view returns (uint256) {
        return _getTransferFeeStorage().transferFeeBps;
    }

    /**
     * @notice Address that collects transfer fees
     */
    function feeCollector() public view returns (address) {
        return _getTransferFeeStorage().feeCollector;
    }

    /**
     * @notice Check if an account is exempt from the transfer fee
     * @param account The address to check
     */
    function isTransferFeeExempt(address account) public view returns (bool) {
        return _getTransferFeeStorage().exempt.contains(account);
    }

    /**
     * @notice Full list of transfer-fee-exempt accounts
     * @dev Unbounded: intended for off-chain use only
     */
    function getTransferFeeExemptList() public view returns (address[] memory) {
        return _getTransferFeeStorage().exempt.values();
    }

    /**
     * @notice Set the transfer fee in basis points (0 to disable, max 100)
     */
    function setTransferFeeBps(uint256 newBps) public onlyRole(FEE_MANAGER_ROLE) {
        if (newBps > MAX_TRANSFER_FEE_BPS) {
            revert FeeExceedsMaximum(newBps, MAX_TRANSFER_FEE_BPS);
        }

        TransferFeeStorage storage $ = _getTransferFeeStorage();
        uint256 previousBps = $.transferFeeBps;
        $.transferFeeBps = uint16(newBps);
        emit TransferFeeUpdated(previousBps, newBps);
    }

    /**
     * @notice Set the fee collector address (cannot be the zero address)
     */
    function setFeeCollector(address newCollector) public onlyRole(FEE_MANAGER_ROLE) {
        if (newCollector == address(0)) {
            revert InvalidFeeCollector();
        }

        TransferFeeStorage storage $ = _getTransferFeeStorage();
        address previousCollector = $.feeCollector;
        $.feeCollector = newCollector;
        emit FeeCollectorUpdated(previousCollector, newCollector);
    }

    /**
     * @notice Add an account to the transfer fee exemption list (idempotent)
     */
    function addTransferFeeExempt(address account) public onlyRole(FEE_MANAGER_ROLE) {
        if (_getTransferFeeStorage().exempt.add(account)) {
            emit TransferFeeExemptionChanged(account, true);
        }
    }

    /**
     * @notice Remove an account from the transfer fee exemption list (idempotent)
     */
    function removeTransferFeeExempt(address account) public onlyRole(FEE_MANAGER_ROLE) {
        if (_getTransferFeeStorage().exempt.remove(account)) {
            emit TransferFeeExemptionChanged(account, false);
        }
    }

    /**
     * @dev Compute the transfer fee for a transfer of `value` from `from` to `to`.
     * Returns 0 when the fee is disabled or either party is exempt.
     */
    function _calculateTransferFee(address from, address to, uint256 value) internal view returns (uint256) {
        TransferFeeStorage storage $ = _getTransferFeeStorage();

        uint256 bps = $.transferFeeBps;
        if (bps == 0) {
            return 0;
        }

        if ($.exempt.contains(from) || $.exempt.contains(to)) {
            return 0;
        }

        return (value * bps) / 10000;
    }

    function _getTransferFeeStorage() private pure returns (TransferFeeStorage storage $) {
        assembly {
            $.slot := TRANSFER_FEE_STORAGE_LOCATION
        }
    }
}
