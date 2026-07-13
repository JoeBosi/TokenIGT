// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./TokenV2.sol";

/**
 * @title TokenV3 (test fixture)
 * @dev Used only in upgrade tests to verify storage layout compatibility on
 * chained upgrades (V2 -> V3). Not part of the production deployment.
 *
 * Storage: uses its OWN ERC-7201 namespace (distinct from V2's) — the correct
 * pattern for chained upgrades: no dependency on sequential slot order, no risk
 * of collision with V2's storage (see AUDIT_STORAGE.md O1).
 */
contract TokenV3 is TokenV2 {
    /// @dev keccak256(abi.encode(uint256(keccak256("advanced.token.v3test.storage")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant V3_STORAGE_LOCATION = 0xb72110be4ba7a0fde78dda92a921ecbf77c0f9dcc6c276c1b4928880e66bba00;

    /// @custom:storage-location erc7201:advanced.token.v3test.storage
    struct V3Storage {
        uint256 anotherVariable;
    }

    function _getV3Storage() private pure returns (V3Storage storage $) {
        assembly {
            $.slot := V3_STORAGE_LOCATION
        }
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize V3 (called via upgradeToAndCall in tests)
     */
    function initializeV3(uint256 anotherVariable_) public reinitializer(3) {
        _getV3Storage().anotherVariable = anotherVariable_;
    }

    function anotherVariable() public view returns (uint256) {
        return _getV3Storage().anotherVariable;
    }

    /**
     * @notice Set the another variable
     */
    function setAnotherVariable(uint256 anotherVariable_) public {
        _getV3Storage().anotherVariable = anotherVariable_;
    }

    /**
     * @notice Combine all test variables with the total supply
     */
    function getAllCombinedValue() public view returns (uint256) {
        return totalSupply() + newVariable() + anotherVariable();
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
