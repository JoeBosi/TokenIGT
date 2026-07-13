// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/access/IAccessControl.sol";
import "../../contracts/Token.sol";
import "./UUPSProxy.sol";

/**
 * @title TokenFeeRolesTest
 * @dev Cross-checks for the v2.4.0 role split (FeeRoles.sol):
 *   - FEE_ADMIN_ROLE (governance): setTransferFeeBps, setFeeCollector,
 *     add/removeTransferFeeExempt, setCustodyFeeBps, setCustodyTreasury,
 *     add/removeCustodyFeeExempt
 *   - SWEEPER_ROLE (operational): startNewCycle, sweepCustodyFee
 *
 * Each role must be able to do its own job and MUST NOT be able to do the
 * other's — a sweeper key compromise must not expose the fee/treasury
 * parameters, and a fee-admin key must not be able to move funds via sweep.
 */
contract TokenFeeRolesTest is Test {
    Token public token;

    address public admin;
    address public feeAdmin;
    address public sweeper;
    address public holder;

    uint256 constant INITIAL_SUPPLY = 1_000_000 * 10 ** 18;
    uint256 constant TRANSFER_FEE_BPS = 10;
    uint256 constant CUSTODY_FEE_BPS = 50;

    function setUp() public {
        admin = address(this);
        feeAdmin = address(0xFEEADD01);
        sweeper = address(0x5EEEEEE1);
        holder = address(0x40100001);

        Token implementation = new Token();
        bytes memory initData = abi.encodeWithSelector(
            Token.initialize.selector,
            "Test Token",
            "TEST",
            INITIAL_SUPPLY,
            holder,
            TRANSFER_FEE_BPS,
            address(0xFEE00001),
            CUSTODY_FEE_BPS,
            address(0x7EA00001),
            admin,
            3 days
        );
        UUPSProxy proxy = new UUPSProxy(address(implementation), initData);
        token = Token(payable(address(proxy)));

        // initialize() only grants FEE_ADMIN_ROLE to admin; SWEEPER_ROLE is a
        // separate operational grant, exactly like MINTER/BURNER/PAUSER/etc.
        token.grantRole(token.FEE_ADMIN_ROLE(), feeAdmin);
        token.grantRole(token.SWEEPER_ROLE(), sweeper);
    }

    function _expectUnauthorized(address account, bytes32 role) internal {
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, account, role));
    }

    // ─────────────────────────────────────────────
    // FEE_ADMIN_ROLE — positive: can do its own job
    // ─────────────────────────────────────────────

    function test_feeAdmin_canSetTransferFeeBps() public {
        vm.prank(feeAdmin);
        token.setTransferFeeBps(25);
        assertEq(token.transferFeeBps(), 25);
    }

    function test_feeAdmin_canSetFeeCollector() public {
        vm.prank(feeAdmin);
        token.setFeeCollector(address(0xC0FFEE01));
        assertEq(token.feeCollector(), address(0xC0FFEE01));
    }

    function test_feeAdmin_canManageTransferFeeExemptions() public {
        vm.startPrank(feeAdmin);
        token.addTransferFeeExempt(holder);
        assertTrue(token.isTransferFeeExempt(holder));
        token.removeTransferFeeExempt(holder);
        assertFalse(token.isTransferFeeExempt(holder));
        vm.stopPrank();
    }

    function test_feeAdmin_canSetCustodyFeeBps() public {
        vm.prank(feeAdmin);
        token.setCustodyFeeBps(75);
        assertEq(token.custodyFeeBps(), 75);
    }

    function test_feeAdmin_canSetCustodyTreasury() public {
        vm.prank(feeAdmin);
        token.setCustodyTreasury(address(0x7EA00002));
        assertEq(token.custodyTreasury(), address(0x7EA00002));
    }

    function test_feeAdmin_canManageCustodyFeeExemptions() public {
        vm.startPrank(feeAdmin);
        token.addCustodyFeeExempt(holder);
        assertTrue(token.isCustodyFeeExempt(holder));
        token.removeCustodyFeeExempt(holder);
        assertFalse(token.isCustodyFeeExempt(holder));
        vm.stopPrank();
    }

    // ─────────────────────────────────────────────
    // FEE_ADMIN_ROLE — negative: cannot do the sweeper's job
    // ─────────────────────────────────────────────

    function test_feeAdmin_cannotStartNewCycle() public {
        _expectUnauthorized(feeAdmin, token.SWEEPER_ROLE());
        vm.prank(feeAdmin);
        token.startNewCycle();
    }

    function test_feeAdmin_cannotSweepCustodyFee() public {
        address[] memory holders = new address[](1);
        holders[0] = holder;

        _expectUnauthorized(feeAdmin, token.SWEEPER_ROLE());
        vm.prank(feeAdmin);
        token.sweepCustodyFee(holders);
    }

    // ─────────────────────────────────────────────
    // SWEEPER_ROLE — positive: can do its own job
    // ─────────────────────────────────────────────

    function test_sweeper_canStartNewCycle() public {
        assertEq(token.currentCycle(), 1);
        vm.prank(sweeper);
        token.startNewCycle();
        assertEq(token.currentCycle(), 2);
    }

    function test_sweeper_canSweepCustodyFee() public {
        // `holder` received INITIAL_SUPPLY at initialize(), so the sweep has a
        // real balance to collect the custody fee from.
        uint256 expectedFee = (INITIAL_SUPPLY * CUSTODY_FEE_BPS) / 10000;
        address[] memory holders = new address[](1);
        holders[0] = holder;

        vm.prank(sweeper);
        token.sweepCustodyFee(holders);

        assertEq(token.balanceOf(holder), INITIAL_SUPPLY - expectedFee);
        assertEq(token.lastSweptCycle(holder), 1);
    }

    // ─────────────────────────────────────────────
    // SWEEPER_ROLE — negative: cannot do the fee-admin's job
    // ─────────────────────────────────────────────

    function test_sweeper_cannotSetTransferFeeBps() public {
        _expectUnauthorized(sweeper, token.FEE_ADMIN_ROLE());
        vm.prank(sweeper);
        token.setTransferFeeBps(25);
    }

    function test_sweeper_cannotSetFeeCollector() public {
        _expectUnauthorized(sweeper, token.FEE_ADMIN_ROLE());
        vm.prank(sweeper);
        token.setFeeCollector(address(0xC0FFEE01));
    }

    function test_sweeper_cannotManageTransferFeeExemptions() public {
        _expectUnauthorized(sweeper, token.FEE_ADMIN_ROLE());
        vm.prank(sweeper);
        token.addTransferFeeExempt(holder);
    }

    function test_sweeper_cannotRemoveTransferFeeExemption() public {
        vm.prank(feeAdmin);
        token.addTransferFeeExempt(holder);

        _expectUnauthorized(sweeper, token.FEE_ADMIN_ROLE());
        vm.prank(sweeper);
        token.removeTransferFeeExempt(holder);
    }

    function test_sweeper_cannotSetCustodyFeeBps() public {
        _expectUnauthorized(sweeper, token.FEE_ADMIN_ROLE());
        vm.prank(sweeper);
        token.setCustodyFeeBps(75);
    }

    function test_sweeper_cannotSetCustodyTreasury() public {
        _expectUnauthorized(sweeper, token.FEE_ADMIN_ROLE());
        vm.prank(sweeper);
        token.setCustodyTreasury(address(0x7EA00002));
    }

    function test_sweeper_cannotManageCustodyFeeExemptions() public {
        _expectUnauthorized(sweeper, token.FEE_ADMIN_ROLE());
        vm.prank(sweeper);
        token.addCustodyFeeExempt(holder);
    }

    function test_sweeper_cannotRemoveCustodyFeeExemption() public {
        vm.prank(feeAdmin);
        token.addCustodyFeeExempt(holder);

        _expectUnauthorized(sweeper, token.FEE_ADMIN_ROLE());
        vm.prank(sweeper);
        token.removeCustodyFeeExempt(holder);
    }

    // ─────────────────────────────────────────────
    // Roles are independently managed (grant/revoke one doesn't affect the other)
    // ─────────────────────────────────────────────

    function test_roles_areIndependentlyGrantedAndRevoked() public {
        address dual = address(0xD0A10001);

        token.grantRole(token.FEE_ADMIN_ROLE(), dual);
        assertTrue(token.hasRole(token.FEE_ADMIN_ROLE(), dual));
        assertFalse(token.hasRole(token.SWEEPER_ROLE(), dual));

        token.grantRole(token.SWEEPER_ROLE(), dual);
        assertTrue(token.hasRole(token.SWEEPER_ROLE(), dual));

        token.revokeRole(token.FEE_ADMIN_ROLE(), dual);
        assertFalse(token.hasRole(token.FEE_ADMIN_ROLE(), dual));
        assertTrue(token.hasRole(token.SWEEPER_ROLE(), dual), "revoking FEE_ADMIN_ROLE must not touch SWEEPER_ROLE");
    }
}
