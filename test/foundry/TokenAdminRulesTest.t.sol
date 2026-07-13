// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/access/IAccessControl.sol";
import "@openzeppelin/contracts/access/extensions/IAccessControlDefaultAdminRules.sol";
import "../../contracts/Token.sol";
import "./UUPSProxy.sol";

/**
 * @title TokenAdminRulesTest
 * @dev Coverage for AccessControlDefaultAdminRulesUpgradeable as wired into
 * Token.sol (v2.4.0): the two-phase, delayed DEFAULT_ADMIN_ROLE transfer
 * replaces the former single-step grant/renounce governance handover.
 *
 * See GOVERNANCE.md / RUNBOOK_UPGRADE.md for the operational flow.
 */
contract TokenAdminRulesTest is Test {
    Token public token;

    address public admin;
    address public newAdmin;
    address public anotherAdmin;
    address public unauthorized;

    uint48 constant DELAY = 3 days;
    uint256 constant INITIAL_SUPPLY = 1_000_000 * 10 ** 18;

    function setUp() public {
        admin = address(this);
        newAdmin = address(0xA0000001);
        anotherAdmin = address(0xA0000002);
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
            DELAY
        );
        UUPSProxy proxy = new UUPSProxy(address(implementation), initData);
        token = Token(payable(address(proxy)));
    }

    // ─────────────────────────────────────────────
    // Initial state
    // ─────────────────────────────────────────────

    function test_initialState() public view {
        assertEq(token.owner(), admin);
        assertEq(token.defaultAdmin(), admin);
        assertEq(token.defaultAdminDelay(), DELAY);
        assertTrue(token.hasRole(token.DEFAULT_ADMIN_ROLE(), admin));

        (address pendingAdmin, uint48 schedule) = token.pendingDefaultAdmin();
        assertEq(pendingAdmin, address(0));
        assertEq(schedule, 0);
    }

    // ─────────────────────────────────────────────
    // grantRole / revokeRole on DEFAULT_ADMIN_ROLE always revert
    // ─────────────────────────────────────────────

    function test_grantRole_defaultAdminAlwaysReverts() public {
        // Read the role BEFORE expectRevert: the external view call would
        // otherwise be consumed as the "next call" itself
        bytes32 defaultAdminRole = token.DEFAULT_ADMIN_ROLE();
        vm.expectRevert(IAccessControlDefaultAdminRules.AccessControlEnforcedDefaultAdminRules.selector);
        token.grantRole(defaultAdminRole, newAdmin);
    }

    function test_revokeRole_defaultAdminAlwaysReverts() public {
        bytes32 defaultAdminRole = token.DEFAULT_ADMIN_ROLE();
        vm.expectRevert(IAccessControlDefaultAdminRules.AccessControlEnforcedDefaultAdminRules.selector);
        token.revokeRole(defaultAdminRole, admin);
    }

    // ─────────────────────────────────────────────
    // beginDefaultAdminTransfer
    // ─────────────────────────────────────────────

    function test_beginDefaultAdminTransfer_schedulesAndEmits() public {
        uint48 expectedSchedule = uint48(block.timestamp) + DELAY;

        vm.expectEmit(true, false, false, true, address(token));
        emit IAccessControlDefaultAdminRules.DefaultAdminTransferScheduled(newAdmin, expectedSchedule);

        token.beginDefaultAdminTransfer(newAdmin);

        (address pendingAdmin, uint48 schedule) = token.pendingDefaultAdmin();
        assertEq(pendingAdmin, newAdmin);
        assertEq(schedule, expectedSchedule);

        // Nothing changes yet — the current admin is still in charge
        assertEq(token.defaultAdmin(), admin);
        assertTrue(token.hasRole(token.DEFAULT_ADMIN_ROLE(), admin));
    }

    function test_beginDefaultAdminTransfer_withoutRoleReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, unauthorized, token.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(unauthorized);
        token.beginDefaultAdminTransfer(newAdmin);
    }

    /// @dev Re-scheduling before the first transfer completes silently
    /// overwrites the pending admin/schedule (OZ `_setPendingDefaultAdmin`):
    /// emits DefaultAdminTransferCanceled for the old one, then
    /// DefaultAdminTransferScheduled for the new one. The original candidate
    /// can no longer accept once overwritten.
    function test_beginDefaultAdminTransfer_reschedulingOverwritesPending() public {
        token.beginDefaultAdminTransfer(newAdmin);
        (address firstPending,) = token.pendingDefaultAdmin();
        assertEq(firstPending, newAdmin);

        uint48 expectedSchedule = uint48(block.timestamp) + DELAY;

        vm.expectEmit(false, false, false, true, address(token));
        emit IAccessControlDefaultAdminRules.DefaultAdminTransferCanceled();
        vm.expectEmit(true, false, false, true, address(token));
        emit IAccessControlDefaultAdminRules.DefaultAdminTransferScheduled(anotherAdmin, expectedSchedule);

        token.beginDefaultAdminTransfer(anotherAdmin);

        (address pendingAdmin, uint48 schedule) = token.pendingDefaultAdmin();
        assertEq(pendingAdmin, anotherAdmin);
        assertEq(schedule, expectedSchedule);

        // The overwritten candidate can no longer accept, even after the
        // (now-irrelevant) original schedule would have passed
        vm.warp(schedule + 1);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControlDefaultAdminRules.AccessControlInvalidDefaultAdmin.selector, newAdmin)
        );
        vm.prank(newAdmin);
        token.acceptDefaultAdminTransfer();

        // The new candidate can
        vm.prank(anotherAdmin);
        token.acceptDefaultAdminTransfer();
        assertEq(token.defaultAdmin(), anotherAdmin);
    }

    // ─────────────────────────────────────────────
    // acceptDefaultAdminTransfer
    // ─────────────────────────────────────────────

    function test_acceptDefaultAdminTransfer_beforeDelayReverts() public {
        token.beginDefaultAdminTransfer(newAdmin);
        (, uint48 schedule) = token.pendingDefaultAdmin();

        // Still within the delay window
        vm.warp(schedule - 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControlDefaultAdminRules.AccessControlEnforcedDefaultAdminDelay.selector, schedule
            )
        );
        vm.prank(newAdmin);
        token.acceptDefaultAdminTransfer();
    }

    function test_acceptDefaultAdminTransfer_wrongCallerReverts() public {
        token.beginDefaultAdminTransfer(newAdmin);
        (, uint48 schedule) = token.pendingDefaultAdmin();
        vm.warp(schedule + 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControlDefaultAdminRules.AccessControlInvalidDefaultAdmin.selector, unauthorized
            )
        );
        vm.prank(unauthorized);
        token.acceptDefaultAdminTransfer();
    }

    function test_acceptDefaultAdminTransfer_afterDelaySucceeds() public {
        token.beginDefaultAdminTransfer(newAdmin);
        (, uint48 schedule) = token.pendingDefaultAdmin();
        vm.warp(schedule + 1);

        vm.prank(newAdmin);
        token.acceptDefaultAdminTransfer();

        assertEq(token.defaultAdmin(), newAdmin);
        assertTrue(token.hasRole(token.DEFAULT_ADMIN_ROLE(), newAdmin));
        assertFalse(token.hasRole(token.DEFAULT_ADMIN_ROLE(), admin));

        (address pendingAdmin, uint48 pendingSchedule) = token.pendingDefaultAdmin();
        assertEq(pendingAdmin, address(0));
        assertEq(pendingSchedule, 0);
    }

    function test_acceptDefaultAdminTransfer_oldAdminLosesGovernanceAfterHandover() public {
        token.beginDefaultAdminTransfer(newAdmin);
        (, uint48 schedule) = token.pendingDefaultAdmin();
        vm.warp(schedule + 1);

        vm.prank(newAdmin);
        token.acceptDefaultAdminTransfer();

        // The old admin can no longer schedule transfers or grant roles
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, admin, token.DEFAULT_ADMIN_ROLE()
            )
        );
        token.beginDefaultAdminTransfer(admin);
    }

    // ─────────────────────────────────────────────
    // cancelDefaultAdminTransfer
    // ─────────────────────────────────────────────

    function test_cancelDefaultAdminTransfer_resetsPending() public {
        token.beginDefaultAdminTransfer(newAdmin);

        vm.expectEmit(false, false, false, true, address(token));
        emit IAccessControlDefaultAdminRules.DefaultAdminTransferCanceled();

        token.cancelDefaultAdminTransfer();

        (address pendingAdmin, uint48 schedule) = token.pendingDefaultAdmin();
        assertEq(pendingAdmin, address(0));
        assertEq(schedule, 0);
    }

    function test_cancelDefaultAdminTransfer_thenAcceptReverts() public {
        token.beginDefaultAdminTransfer(newAdmin);
        (, uint48 schedule) = token.pendingDefaultAdmin();
        vm.warp(schedule + 1);

        token.cancelDefaultAdminTransfer();

        vm.expectRevert(
            abi.encodeWithSelector(IAccessControlDefaultAdminRules.AccessControlInvalidDefaultAdmin.selector, newAdmin)
        );
        vm.prank(newAdmin);
        token.acceptDefaultAdminTransfer();
    }

    function test_cancelDefaultAdminTransfer_withoutRoleReverts() public {
        token.beginDefaultAdminTransfer(newAdmin);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, unauthorized, token.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(unauthorized);
        token.cancelDefaultAdminTransfer();
    }

    // ─────────────────────────────────────────────
    // changeDefaultAdminDelay
    // ─────────────────────────────────────────────

    function test_changeDefaultAdminDelay_increaseWaitsUpToIncreaseWait() public {
        uint48 newDelay = 10 days;
        // Increasing the delay: wait = min(newDelay, defaultAdminDelayIncreaseWait()=5 days)
        uint48 expectedSchedule = uint48(block.timestamp) + 5 days;

        token.changeDefaultAdminDelay(newDelay);

        (uint48 pendingDelay, uint48 schedule) = token.pendingDefaultAdminDelay();
        assertEq(pendingDelay, newDelay);
        assertEq(schedule, expectedSchedule);

        // Not effective yet
        assertEq(token.defaultAdminDelay(), DELAY);

        vm.warp(schedule + 1);
        assertEq(token.defaultAdminDelay(), newDelay);
    }

    function test_changeDefaultAdminDelay_decreaseWaitsTheDifference() public {
        uint48 newDelay = 1 days;
        // Decreasing the delay: wait = currentDelay - newDelay = 3 days - 1 days = 2 days
        uint48 expectedSchedule = uint48(block.timestamp) + 2 days;

        token.changeDefaultAdminDelay(newDelay);

        (, uint48 schedule) = token.pendingDefaultAdminDelay();
        assertEq(schedule, expectedSchedule);

        vm.warp(schedule + 1);
        assertEq(token.defaultAdminDelay(), newDelay);
    }

    function test_changeDefaultAdminDelay_withoutRoleReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, unauthorized, token.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(unauthorized);
        token.changeDefaultAdminDelay(1 days);
    }

    // ─────────────────────────────────────────────
    // UPGRADER_ROLE / FEE_ADMIN_ROLE / RECOVERER_ROLE are unaffected by the
    // default-admin transfer flow (they are plain AccessControl roles)
    // ─────────────────────────────────────────────

    function test_otherGovernanceRoles_survivesDefaultAdminHandover() public {
        assertTrue(token.hasRole(token.UPGRADER_ROLE(), admin));
        assertTrue(token.hasRole(token.FEE_ADMIN_ROLE(), admin));
        assertTrue(token.hasRole(token.RECOVERER_ROLE(), admin));

        token.beginDefaultAdminTransfer(newAdmin);
        (, uint48 schedule) = token.pendingDefaultAdmin();
        vm.warp(schedule + 1);
        vm.prank(newAdmin);
        token.acceptDefaultAdminTransfer();

        // The old admin keeps its other roles: only DEFAULT_ADMIN_ROLE moved
        assertTrue(token.hasRole(token.UPGRADER_ROLE(), admin));
        assertTrue(token.hasRole(token.FEE_ADMIN_ROLE(), admin));
        assertTrue(token.hasRole(token.RECOVERER_ROLE(), admin));

        // The new admin does NOT automatically inherit them
        assertFalse(token.hasRole(token.UPGRADER_ROLE(), newAdmin));
        assertFalse(token.hasRole(token.FEE_ADMIN_ROLE(), newAdmin));
        assertFalse(token.hasRole(token.RECOVERER_ROLE(), newAdmin));
    }
}
