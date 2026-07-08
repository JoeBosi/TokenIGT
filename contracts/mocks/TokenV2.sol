// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../Token.sol";

/**
 * @title TokenV2 (test fixture)
 * @dev Used only in upgrade tests to verify storage layout compatibility on
 * forward upgrades. Not part of the production deployment.
 *
 * Storage: uses the ERC-7201 namespaced pattern (like the production modules)
 * instead of sequential state variables — this is the pattern a REAL V2 must
 * follow (see AUDIT_STORAGE.md O1).
 */
contract TokenV2 is Token {
    /// @dev keccak256(abi.encode(uint256(keccak256("advanced.token.v2test.storage")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant V2_STORAGE_LOCATION = 0x4e5b1b549728784b7cfae4d4f36a8a6319f1f6c72682822bb78b261d62021f00;

    /// @custom:storage-location erc7201:advanced.token.v2test.storage
    struct V2Storage {
        uint256 newVariable;
        string newString;
    }

    function _getV2Storage() private pure returns (V2Storage storage $) {
        assembly {
            $.slot := V2_STORAGE_LOCATION
        }
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize V2 (called via upgradeToAndCall in tests)
     */
    function initializeV2(uint256 newVariable_, string memory newString_) public reinitializer(2) {
        V2Storage storage $ = _getV2Storage();
        $.newVariable = newVariable_;
        $.newString = newString_;
    }

    function newVariable() public view returns (uint256) {
        return _getV2Storage().newVariable;
    }

    function newString() public view returns (string memory) {
        return _getV2Storage().newString;
    }

    /**
     * @notice Set the new variable
     */
    function setNewVariable(uint256 newVariable_) public {
        _getV2Storage().newVariable = newVariable_;
    }

    /**
     * @notice Set the new string
     */
    function setNewString(string memory newString_) public {
        _getV2Storage().newString = newString_;
    }

    /**
     * @notice Combine the new variable with the total supply
     */
    function getCombinedValue() public view returns (uint256) {
        return totalSupply() + newVariable();
    }

    function version() public pure virtual override returns (string memory) {
        return "2.2.0-test";
    }
}
