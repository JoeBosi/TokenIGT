// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./TokenV2.sol";

/**
 * @title IGE Token V3
 * @dev V3 for testing compatibility upgrade
 * Maintains storage layout from V2 but adds new functionality
 */
contract TokenV3 is TokenV2 {
    // Additional variable (must be added at the end to maintain compatibility)
    uint256 public anotherVariable;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize V3 (should not be called in normal upgrade flow)
     */
    function initializeV3(uint256 _anotherVariable) public reinitializer(3) {
        anotherVariable = _anotherVariable;
    }

    /**
     * @notice Set the another variable
     * @param _anotherVariable The new value
     */
    function setAnotherVariable(uint256 _anotherVariable) public {
        anotherVariable = _anotherVariable;
    }

    /**
     * @notice Get a value that combines all variables
     * @return The combined value
     */
    function getAllCombinedValue() public view returns (uint256) {
        return totalSupply() + newVariable + anotherVariable;
    }

    /**
     * @notice A new function that doesn't affect storage layout
     * @return A greeting message
     */
    function greet() public pure returns (string memory) {
        return "Hello from IGE Token V3!";
    }
}
