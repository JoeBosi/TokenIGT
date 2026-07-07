// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./TokenV2.sol";

/**
 * @title TokenV3 (test fixture)
 * @dev Used only in upgrade tests to verify storage layout compatibility on
 * chained upgrades (V2 -> V3). Not part of the production deployment.
 */
contract TokenV3 is TokenV2 {
    // Additional variable (appended to preserve layout)
    uint256 public anotherVariable;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize V3 (called via upgradeToAndCall in tests)
     */
    function initializeV3(uint256 anotherVariable_) public reinitializer(3) {
        anotherVariable = anotherVariable_;
    }

    /**
     * @notice Set the another variable
     */
    function setAnotherVariable(uint256 anotherVariable_) public {
        anotherVariable = anotherVariable_;
    }

    /**
     * @notice Combine all test variables with the total supply
     */
    function getAllCombinedValue() public view returns (uint256) {
        return totalSupply() + newVariable + anotherVariable;
    }

    /**
     * @notice New function that doesn't affect storage layout
     */
    function greet() public pure returns (string memory) {
        return "Hello from IGE Token V3!";
    }

    function version() public pure override returns (string memory) {
        return "2.3.0-test";
    }
}
