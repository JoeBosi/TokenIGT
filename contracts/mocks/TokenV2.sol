// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../Token.sol";

/**
 * @title TokenV2 (test fixture)
 * @dev Used only in upgrade tests to verify storage layout compatibility on
 * forward upgrades. Not part of the production deployment.
 */
contract TokenV2 is Token {
    // New storage variables for testing forward upgrade
    uint256 public newVariable;
    string public newString;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize V2 (called via upgradeToAndCall in tests)
     */
    function initializeV2(uint256 newVariable_, string memory newString_) public reinitializer(2) {
        newVariable = newVariable_;
        newString = newString_;
    }

    /**
     * @notice Set the new variable
     */
    function setNewVariable(uint256 newVariable_) public {
        newVariable = newVariable_;
    }

    /**
     * @notice Set the new string
     */
    function setNewString(string memory newString_) public {
        newString = newString_;
    }

    /**
     * @notice Combine the new variable with the total supply
     */
    function getCombinedValue() public view returns (uint256) {
        return totalSupply() + newVariable;
    }

    function version() public pure virtual override returns (string memory) {
        return "2.2.0-test";
    }
}
