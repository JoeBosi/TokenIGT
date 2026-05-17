// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./Token.sol";

/**
 * @title IGE Token V2
 * @dev V2 for testing forward upgrade with new storage variables
 * Adds a new variable to test storage layout compatibility
 */
contract TokenV2 is Token {
    // New storage variable for testing forward upgrade
    uint256 public newVariable;
    string public newString;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize V2 (should not be called in normal upgrade flow)
     */
    function initializeV2(uint256 _newVariable, string memory _newString) public reinitializer(2) {
        newVariable = _newVariable;
        newString = _newString;
    }

    /**
     * @notice Set the new variable
     * @param _newVariable The new value
     */
    function setNewVariable(uint256 _newVariable) public {
        newVariable = _newVariable;
    }

    /**
     * @notice Set the new string
     * @param _newString The new value
     */
    function setNewString(string memory _newString) public {
        newString = _newString;
    }

    /**
     * @notice Get a value that combines the new variable with the total supply
     * @return The combined value
     */
    function getCombinedValue() public view returns (uint256) {
        return totalSupply() + newVariable;
    }
}
