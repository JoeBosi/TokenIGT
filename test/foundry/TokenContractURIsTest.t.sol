// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/access/IAccessControl.sol";
import "../../contracts/Token.sol";
import "./UUPSProxy.sol";

/**
 * @title TokenContractURIsTest
 * @dev Full coverage for ContractURIsUpgradeable: websiteURI, reserveInfoURI
 * (proof-of-reserve landing page pointer) and contractURI (ERC-7572).
 *
 * These are informational pointers only (see PEG_ORO.md): the setters are
 * gated by DEFAULT_ADMIN_ROLE because reserveInfoURI in particular is the
 * token's trust anchor — a compromised operational key redirecting it would
 * be a ready-made phishing vector for fake attestations.
 */
contract TokenContractURIsTest is Test {
    Token public token;

    address public admin;
    address public unauthorized;

    uint256 constant INITIAL_SUPPLY = 1_000_000 * 10 ** 18;

    function setUp() public {
        admin = address(this);
        unauthorized = address(0xBAD00001);

        Token implementation = new Token();
        bytes memory initData = abi.encodeWithSelector(
            Token.initialize.selector,
            "Test Token",
            "TEST",
            INITIAL_SUPPLY,
            admin,
            10,
            address(0xFEE00001),
            50,
            address(0x7EA00001),
            admin,
            3 days
        );
        UUPSProxy proxy = new UUPSProxy(address(implementation), initData);
        token = Token(payable(address(proxy)));
    }

    function _expectUnauthorizedAdmin(address account) internal {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, account, token.DEFAULT_ADMIN_ROLE()
            )
        );
    }

    // ─────────────────────────────────────────────
    // Defaults
    // ─────────────────────────────────────────────

    function test_defaults_areEmptyStrings() public view {
        assertEq(token.websiteURI(), "");
        assertEq(token.reserveInfoURI(), "");
        assertEq(token.contractURI(), "");
    }

    // ─────────────────────────────────────────────
    // websiteURI
    // ─────────────────────────────────────────────

    function test_setWebsiteURI_updatesAndEmits() public {
        vm.expectEmit(false, false, false, true, address(token));
        emit ContractURIsUpgradeable.WebsiteURIUpdated("", "https://igt.example");

        token.setWebsiteURI("https://igt.example");
        assertEq(token.websiteURI(), "https://igt.example");
    }

    function test_setWebsiteURI_overwritesPrevious() public {
        token.setWebsiteURI("https://old.example");

        vm.expectEmit(false, false, false, true, address(token));
        emit ContractURIsUpgradeable.WebsiteURIUpdated("https://old.example", "https://new.example");

        token.setWebsiteURI("https://new.example");
        assertEq(token.websiteURI(), "https://new.example");
    }

    function test_setWebsiteURI_withoutRoleReverts() public {
        _expectUnauthorizedAdmin(unauthorized);
        vm.prank(unauthorized);
        token.setWebsiteURI("https://evil.example");
    }

    // ─────────────────────────────────────────────
    // reserveInfoURI
    // ─────────────────────────────────────────────

    function test_setReserveInfoURI_updatesAndEmits() public {
        vm.expectEmit(false, false, false, true, address(token));
        emit ContractURIsUpgradeable.ReserveInfoURIUpdated("", "https://reserve.igt.example");

        token.setReserveInfoURI("https://reserve.igt.example");
        assertEq(token.reserveInfoURI(), "https://reserve.igt.example");
    }

    function test_setReserveInfoURI_overwritesPrevious() public {
        token.setReserveInfoURI("https://old-reserve.example");

        vm.expectEmit(false, false, false, true, address(token));
        emit ContractURIsUpgradeable.ReserveInfoURIUpdated("https://old-reserve.example", "https://new-reserve.example");

        token.setReserveInfoURI("https://new-reserve.example");
        assertEq(token.reserveInfoURI(), "https://new-reserve.example");
    }

    function test_setReserveInfoURI_withoutRoleReverts() public {
        _expectUnauthorizedAdmin(unauthorized);
        vm.prank(unauthorized);
        token.setReserveInfoURI("https://evil.example");
    }

    // ─────────────────────────────────────────────
    // contractURI (ERC-7572)
    // ─────────────────────────────────────────────

    function test_setContractURI_updatesAndEmits() public {
        vm.expectEmit(false, false, false, true, address(token));
        emit ContractURIsUpgradeable.ContractURIUpdated("", "https://igt.example/metadata.json");

        token.setContractURI("https://igt.example/metadata.json");
        assertEq(token.contractURI(), "https://igt.example/metadata.json");
    }

    /// @dev A2-fix: setContractURI ALSO emits the canonical parameter-less
    /// ERC-7572 signal `ContractURIUpdated()` (topic-only, no data) so conformant
    /// explorers/marketplaces refresh the contract metadata.
    function test_setContractURI_emitsCanonicalERC7572Event() public {
        bytes32 canonicalTopic = keccak256("ContractURIUpdated()");

        vm.recordLogs();
        token.setContractURI("https://igt.example/metadata.json");
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bool found;
        for (uint256 i = 0; i < logs.length; i++) {
            if (
                logs[i].emitter == address(token) && logs[i].topics.length == 1 && logs[i].topics[0] == canonicalTopic
                    && logs[i].data.length == 0
            ) {
                found = true;
            }
        }
        assertTrue(found, "canonical ERC-7572 ContractURIUpdated() not emitted");
    }

    function test_setContractURI_overwritesPrevious() public {
        token.setContractURI("https://old.example/metadata.json");

        vm.expectEmit(false, false, false, true, address(token));
        emit ContractURIsUpgradeable.ContractURIUpdated(
            "https://old.example/metadata.json", "https://new.example/metadata.json"
        );

        token.setContractURI("https://new.example/metadata.json");
        assertEq(token.contractURI(), "https://new.example/metadata.json");
    }

    function test_setContractURI_withoutRoleReverts() public {
        _expectUnauthorizedAdmin(unauthorized);
        vm.prank(unauthorized);
        token.setContractURI("https://evil.example/metadata.json");
    }

    // ─────────────────────────────────────────────
    // Independence — the three URIs are stored and updated independently
    // ─────────────────────────────────────────────

    function test_allThreeURIs_areIndependent() public {
        token.setWebsiteURI("https://website.example");
        token.setReserveInfoURI("https://reserve.example");
        token.setContractURI("https://contract.example");

        assertEq(token.websiteURI(), "https://website.example");
        assertEq(token.reserveInfoURI(), "https://reserve.example");
        assertEq(token.contractURI(), "https://contract.example");

        token.setWebsiteURI("https://website2.example");
        assertEq(token.websiteURI(), "https://website2.example");
        assertEq(token.reserveInfoURI(), "https://reserve.example", "unrelated setter must not affect reserveInfoURI");
        assertEq(token.contractURI(), "https://contract.example", "unrelated setter must not affect contractURI");
    }

    // ─────────────────────────────────────────────
    // A FEE_ADMIN_ROLE or SWEEPER_ROLE holder is NOT enough — DEFAULT_ADMIN_ROLE
    // specifically is required (these are governance-level pointers)
    // ─────────────────────────────────────────────

    function test_feeAdminRole_isNotSufficient() public {
        address feeAdmin = address(0xFEEADD01);
        token.grantRole(token.FEE_ADMIN_ROLE(), feeAdmin);

        _expectUnauthorizedAdmin(feeAdmin);
        vm.prank(feeAdmin);
        token.setReserveInfoURI("https://evil.example");
    }

    function test_sweeperRole_isNotSufficient() public {
        address sweeper = address(0x5EEEEEE1);
        token.grantRole(token.SWEEPER_ROLE(), sweeper);

        _expectUnauthorizedAdmin(sweeper);
        vm.prank(sweeper);
        token.setContractURI("https://evil.example/metadata.json");
    }
}
