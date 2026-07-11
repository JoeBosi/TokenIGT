// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title ContractURIsUpgradeable
 * @dev Informational, on-chain-readable pointers to off-chain resources:
 * - `websiteURI`: the issuer's official website/landing page;
 * - `reserveInfoURI`: the landing page publishing the periodic proof-of-reserve
 *   attestations (custody audit results — see PEG_ORO.md and the separate
 *   ProofOfReserve contract planned for a future release);
 * - `contractURI`: contract-level metadata URI (ERC-7572), typically pointing
 *   to a JSON document consumed by explorers/marketplaces.
 *
 * These are POINTERS, not proofs: the setters are gated by `DEFAULT_ADMIN_ROLE`
 * (intended to be a multisig) because `reserveInfoURI` in particular is the
 * token's trust anchor — a compromised operational key that could redirect it
 * would be a ready-made phishing vector for fake attestations.
 *
 * No parameters in `initialize`, no reinitializer: values default to the empty
 * string and are set post-deploy via script, consistent with how operational
 * roles are granted after `initialize` in the main contract.
 *
 * Uses ERC-7201 namespaced storage.
 */
abstract contract ContractURIsUpgradeable is Initializable, AccessControlUpgradeable {
    /// @dev keccak256(abi.encode(uint256(keccak256("advanced.token.contracturis.storage")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant CONTRACT_URIS_STORAGE_LOCATION =
        0x2f61fe546e652f7829573e78b47106428dbe11840b9f360ee3179ad8b6e33700;

    /// @custom:storage-location erc7201:advanced.token.contracturis.storage
    struct ContractURIsStorage {
        string websiteURI;
        string reserveInfoURI;
        string contractURI;
    }

    event WebsiteURIUpdated(string previousURI, string newURI);
    event ReserveInfoURIUpdated(string previousURI, string newURI);
    event ContractURIUpdated(string previousURI, string newURI);

    function __ContractURIs_init() internal onlyInitializing {}

    function __ContractURIs_init_unchained() internal onlyInitializing {}

    /**
     * @notice The issuer's official website
     */
    function websiteURI() public view returns (string memory) {
        return _getContractURIsStorage().websiteURI;
    }

    /**
     * @notice Landing page publishing the proof-of-reserve attestations
     * @dev POINTER only — not a cryptographic proof. See PEG_ORO.md.
     */
    function reserveInfoURI() public view returns (string memory) {
        return _getContractURIsStorage().reserveInfoURI;
    }

    /**
     * @notice Contract-level metadata URI (ERC-7572)
     */
    function contractURI() public view returns (string memory) {
        return _getContractURIsStorage().contractURI;
    }

    /**
     * @notice Set the issuer's official website
     */
    function setWebsiteURI(string calldata newURI) public onlyRole(DEFAULT_ADMIN_ROLE) {
        ContractURIsStorage storage $ = _getContractURIsStorage();
        string memory previousURI = $.websiteURI;
        $.websiteURI = newURI;
        emit WebsiteURIUpdated(previousURI, newURI);
    }

    /**
     * @notice Set the proof-of-reserve landing page
     */
    function setReserveInfoURI(string calldata newURI) public onlyRole(DEFAULT_ADMIN_ROLE) {
        ContractURIsStorage storage $ = _getContractURIsStorage();
        string memory previousURI = $.reserveInfoURI;
        $.reserveInfoURI = newURI;
        emit ReserveInfoURIUpdated(previousURI, newURI);
    }

    /**
     * @notice Set the contract-level metadata URI (ERC-7572)
     */
    function setContractURI(string calldata newURI) public onlyRole(DEFAULT_ADMIN_ROLE) {
        ContractURIsStorage storage $ = _getContractURIsStorage();
        string memory previousURI = $.contractURI;
        $.contractURI = newURI;
        emit ContractURIUpdated(previousURI, newURI);
    }

    function _getContractURIsStorage() private pure returns (ContractURIsStorage storage $) {
        assembly {
            $.slot := CONTRACT_URIS_STORAGE_LOCATION
        }
    }
}
