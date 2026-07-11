// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/IAccessControl.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "../../contracts/Token.sol";
import "./UUPSProxy.sol";

/**
 * @title TokenCustodyFeeTest
 * @dev Full coverage suite for ERC20CustodyFeeUpgradeable (custody fee extension):
 *
 *  1. Initialization:
 *     - cycle starts at 1, CycleStarted(1, ts) emitted
 *     - custodyFeeBps > MAX_CUSTODY_FEE_BPS → CustodyFeeExceedsMaximum
 *     - custodyTreasury == address(0) → InvalidCustodyTreasury
 *
 *  2. Sweep semantics:
 *     - fee = balance * bps / 10000 computed AT EXECUTION TIME
 *     - Transfer(holder → treasury) + CustodyFeeCollected events
 *     - skip: exempt / already swept this cycle / holder == treasury / holder == 0
 *     - double sweep in same cycle = no-op; startNewCycle → collects again
 *     - bypasses pause, freeze and blocklist (decision D3)
 *     - NO transfer fee applied on the collection path
 *     - custodyFeeBps = 0 and dust balances: marked, no transfer, no event
 *
 *  3. Setters & access control:
 *     - setCustodyFeeBps (cap 200), setCustodyTreasury (!= 0), exemption list
 *     - idempotent add/remove (no event when state unchanged)
 *     - governance setters require FEE_ADMIN_ROLE, startNewCycle/sweepCustodyFee
 *       require SWEEPER_ROLE → AccessControlUnauthorizedAccount
 *
 *  4. Fuzz: fee never exceeds balance, sweep never reverts, duplicates in batch.
 */
contract TokenCustodyFeeTest is Test {
    Token public token;

    address public admin;
    address public holderA;
    address public holderB;
    address public exemptHolder;
    address public unauthorized;
    address public feeCollectorAddr;
    address public custodyTreasuryAddr;

    uint256 constant INITIAL_SUPPLY = 1_000_000 * 10 ** 18;
    uint256 constant TRANSFER_FEE_BPS = 10; // 0.1%
    uint256 constant CUSTODY_FEE_BPS = 50; // 0.5%
    uint256 constant AMOUNT = 100_000 * 10 ** 18;

    function setUp() public {
        admin = address(this);
        holderA = address(0xC0570001);
        holderB = address(0xC0570002);
        exemptHolder = address(0xC0570003);
        unauthorized = address(0xC0570004);
        feeCollectorAddr = address(0xC0570005);
        custodyTreasuryAddr = address(0xC0570006);

        Token implementation = new Token();
        bytes memory initData = abi.encodeWithSelector(
            Token.initialize.selector,
            "IGE Token",
            "IGT",
            INITIAL_SUPPLY,
            admin,
            TRANSFER_FEE_BPS,
            feeCollectorAddr,
            CUSTODY_FEE_BPS,
            custodyTreasuryAddr,
            admin,
            3 days
        );
        UUPSProxy proxy = new UUPSProxy(address(implementation), initData);
        token = Token(payable(address(proxy)));

        // Operational roles (init only grants governance roles to the admin)
        token.grantRole(token.MINTER_ROLE(), admin);
        token.grantRole(token.BURNER_ROLE(), admin);
        token.grantRole(token.PAUSER_ROLE(), admin);
        token.grantRole(token.FREEZER_ROLE(), admin);
        token.grantRole(token.BLOCKER_ROLE(), admin);
        token.grantRole(token.SWEEPER_ROLE(), admin);
    }

    // ─────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────

    function _arr(address a) internal pure returns (address[] memory holders) {
        holders = new address[](1);
        holders[0] = a;
    }

    function _arr(address a, address b) internal pure returns (address[] memory holders) {
        holders = new address[](2);
        holders[0] = a;
        holders[1] = b;
    }

    function _contains(address[] memory list, address account) internal pure returns (bool) {
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == account) return true;
        }
        return false;
    }

    function _freshUninitializedToken() internal returns (Token fresh) {
        Token implementation = new Token();
        UUPSProxy proxy = new UUPSProxy(address(implementation), "");
        fresh = Token(payable(address(proxy)));
    }

    // ─────────────────────────────────────────────
    // Initialization — cycle 1 + custody param validation
    // ─────────────────────────────────────────────

    /// @dev init stores custody params and MAX_CUSTODY_FEE_BPS is 200
    function test_initialize_custodyParamsStored() public view {
        assertEq(token.custodyFeeBps(), CUSTODY_FEE_BPS);
        assertEq(token.custodyTreasury(), custodyTreasuryAddr);
        assertEq(token.MAX_CUSTODY_FEE_BPS(), 200);
        assertEq(token.currentCycle(), 1);
    }

    /// @dev init emits CycleStarted(1, timestamp) and the cycle starts at 1
    function test_initialize_emitsCycleStartedOne() public {
        Token fresh = _freshUninitializedToken();

        vm.expectEmit(true, false, false, true, address(fresh));
        emit ERC20CustodyFeeUpgradeable.CycleStarted(1, block.timestamp);

        fresh.initialize(
            "IGE Token",
            "IGT",
            0,
            address(0),
            TRANSFER_FEE_BPS,
            feeCollectorAddr,
            CUSTODY_FEE_BPS,
            custodyTreasuryAddr,
            admin,
            3 days
        );
        assertEq(fresh.currentCycle(), 1);
    }

    /// @dev init with custodyFeeBps > 200 reverts CustodyFeeExceedsMaximum
    function test_initialize_custodyFeeAboveCapReverts() public {
        Token fresh = _freshUninitializedToken();

        vm.expectRevert(abi.encodeWithSelector(ERC20CustodyFeeUpgradeable.CustodyFeeExceedsMaximum.selector, 201, 200));
        fresh.initialize(
            "IGE Token",
            "IGT",
            0,
            address(0),
            TRANSFER_FEE_BPS,
            feeCollectorAddr,
            201,
            custodyTreasuryAddr,
            admin,
            3 days
        );
    }

    /// @dev init with custodyTreasury == 0 reverts InvalidCustodyTreasury
    function test_initialize_zeroTreasuryReverts() public {
        Token fresh = _freshUninitializedToken();

        vm.expectRevert(ERC20CustodyFeeUpgradeable.InvalidCustodyTreasury.selector);
        fresh.initialize(
            "IGE Token",
            "IGT",
            0,
            address(0),
            TRANSFER_FEE_BPS,
            feeCollectorAddr,
            CUSTODY_FEE_BPS,
            address(0),
            admin,
            3 days
        );
    }

    // ─────────────────────────────────────────────
    // Sweep — core collection semantics
    // ─────────────────────────────────────────────

    /// @dev sweep moves fee = balance*bps/10000 from the holder to the treasury
    function test_sweep_collectsFee_updatesBalances() public {
        token.mint(holderA, AMOUNT);

        uint256 expectedFee = (AMOUNT * CUSTODY_FEE_BPS) / 10000;
        uint256 supplyBefore = token.totalSupply();

        token.sweepCustodyFee(_arr(holderA));

        assertEq(token.balanceOf(holderA), AMOUNT - expectedFee);
        assertEq(token.balanceOf(custodyTreasuryAddr), expectedFee);
        // The sweep moves tokens, it never mints/burns
        assertEq(token.totalSupply(), supplyBefore);
        assertEq(token.lastSweptCycle(holderA), 1);
    }

    /// @dev sweep emits Transfer(holder, treasury, fee) then CustodyFeeCollected(holder, fee, cycle)
    function test_sweep_emitsTransferAndCustodyFeeCollected() public {
        token.mint(holderA, AMOUNT);
        uint256 expectedFee = (AMOUNT * CUSTODY_FEE_BPS) / 10000;

        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(holderA, custodyTreasuryAddr, expectedFee);
        vm.expectEmit(true, true, false, true, address(token));
        emit ERC20CustodyFeeUpgradeable.CustodyFeeCollected(holderA, expectedFee, 1);

        token.sweepCustodyFee(_arr(holderA));
    }

    /// @dev the fee is computed on the balance AT EXECUTION TIME, not when the cycle opened
    function test_sweep_feeComputedAtExecutionTime() public {
        token.mint(holderA, AMOUNT);
        uint256 fee1 = (AMOUNT * CUSTODY_FEE_BPS) / 10000;
        token.sweepCustodyFee(_arr(holderA));
        assertEq(token.balanceOf(custodyTreasuryAddr), fee1);

        // Balance changes before the next cycle's sweep
        token.mint(holderA, AMOUNT);
        token.startNewCycle();

        uint256 balanceNow = token.balanceOf(holderA);
        assertEq(balanceNow, 2 * AMOUNT - fee1);
        uint256 fee2 = (balanceNow * CUSTODY_FEE_BPS) / 10000;

        token.sweepCustodyFee(_arr(holderA));

        assertEq(token.balanceOf(holderA), balanceNow - fee2);
        assertEq(token.balanceOf(custodyTreasuryAddr), fee1 + fee2);
    }

    /// @dev a batch sweeps every eligible holder in a single call
    function test_sweep_multipleHolders_batch() public {
        token.mint(holderA, AMOUNT);
        token.mint(holderB, AMOUNT / 2);

        uint256 feeA = (AMOUNT * CUSTODY_FEE_BPS) / 10000;
        uint256 feeB = ((AMOUNT / 2) * CUSTODY_FEE_BPS) / 10000;

        token.sweepCustodyFee(_arr(holderA, holderB));

        assertEq(token.balanceOf(holderA), AMOUNT - feeA);
        assertEq(token.balanceOf(holderB), AMOUNT / 2 - feeB);
        assertEq(token.balanceOf(custodyTreasuryAddr), feeA + feeB);
        assertEq(token.lastSweptCycle(holderA), 1);
        assertEq(token.lastSweptCycle(holderB), 1);
    }

    // ─────────────────────────────────────────────
    // Sweep — skip branches
    // ─────────────────────────────────────────────

    /// @dev exempt holder is skipped: no transfer, no event, NOT marked as swept
    function test_sweep_skipsExemptHolder() public {
        token.mint(exemptHolder, AMOUNT);
        token.addCustodyFeeExempt(exemptHolder);

        vm.recordLogs();
        token.sweepCustodyFee(_arr(exemptHolder));

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 0);
        assertEq(token.balanceOf(exemptHolder), AMOUNT);
        assertEq(token.balanceOf(custodyTreasuryAddr), 0);
        assertEq(token.lastSweptCycle(exemptHolder), 0);
    }

    /// @dev holder already swept in the current cycle is skipped (idempotent batches)
    function test_sweep_skipsAlreadySweptInCycle() public {
        token.mint(holderA, AMOUNT);
        token.sweepCustodyFee(_arr(holderA));

        uint256 holderAfterFirst = token.balanceOf(holderA);
        uint256 treasuryAfterFirst = token.balanceOf(custodyTreasuryAddr);

        vm.recordLogs();
        token.sweepCustodyFee(_arr(holderA)); // second sweep, same cycle

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 0);
        assertEq(token.balanceOf(holderA), holderAfterFirst);
        assertEq(token.balanceOf(custodyTreasuryAddr), treasuryAfterFirst);
    }

    /// @dev the treasury itself is never swept
    function test_sweep_skipsTreasury() public {
        token.mint(custodyTreasuryAddr, AMOUNT);

        vm.recordLogs();
        token.sweepCustodyFee(_arr(custodyTreasuryAddr));

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 0);
        assertEq(token.balanceOf(custodyTreasuryAddr), AMOUNT);
        assertEq(token.lastSweptCycle(custodyTreasuryAddr), 0);
    }

    /// @dev address(0) in the batch is skipped without reverting
    function test_sweep_skipsZeroAddress() public {
        vm.recordLogs();
        token.sweepCustodyFee(_arr(address(0)));

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 0);
        assertEq(token.lastSweptCycle(address(0)), 0);
    }

    /// @dev skipped-in-batch holders do not prevent collection from eligible ones
    function test_sweep_mixedBatch_collectsOnlyEligible() public {
        token.mint(holderA, AMOUNT);
        token.mint(exemptHolder, AMOUNT);
        token.addCustodyFeeExempt(exemptHolder);

        address[] memory holders = new address[](4);
        holders[0] = address(0);
        holders[1] = custodyTreasuryAddr;
        holders[2] = exemptHolder;
        holders[3] = holderA;

        uint256 expectedFee = (AMOUNT * CUSTODY_FEE_BPS) / 10000;
        token.sweepCustodyFee(holders);

        assertEq(token.balanceOf(custodyTreasuryAddr), expectedFee);
        assertEq(token.balanceOf(holderA), AMOUNT - expectedFee);
        assertEq(token.balanceOf(exemptHolder), AMOUNT);
    }

    /// @dev after removeCustodyFeeExempt the holder becomes sweepable again (never marked while exempt)
    function test_sweep_afterExemptionRemoved_collectsInSameCycle() public {
        token.mint(holderA, AMOUNT);
        token.addCustodyFeeExempt(holderA);

        token.sweepCustodyFee(_arr(holderA)); // skipped, not marked
        assertEq(token.balanceOf(holderA), AMOUNT);
        assertEq(token.lastSweptCycle(holderA), 0);

        token.removeCustodyFeeExempt(holderA);
        uint256 expectedFee = (AMOUNT * CUSTODY_FEE_BPS) / 10000;

        token.sweepCustodyFee(_arr(holderA)); // same cycle: now collected
        assertEq(token.balanceOf(holderA), AMOUNT - expectedFee);
        assertEq(token.lastSweptCycle(holderA), 1);
    }

    // ─────────────────────────────────────────────
    // Cycles — startNewCycle / lastSweptCycle
    // ─────────────────────────────────────────────

    /// @dev startNewCycle increments currentCycle and emits CycleStarted
    function test_startNewCycle_incrementsAndEmits() public {
        assertEq(token.currentCycle(), 1);

        vm.expectEmit(true, false, false, true, address(token));
        emit ERC20CustodyFeeUpgradeable.CycleStarted(2, block.timestamp);
        token.startNewCycle();

        assertEq(token.currentCycle(), 2);
    }

    /// @dev a holder swept in cycle N is collected again after startNewCycle
    function test_startNewCycle_allowsResweep() public {
        token.mint(holderA, AMOUNT);

        uint256 fee1 = (AMOUNT * CUSTODY_FEE_BPS) / 10000;
        token.sweepCustodyFee(_arr(holderA));
        assertEq(token.balanceOf(custodyTreasuryAddr), fee1);

        token.startNewCycle();

        uint256 fee2 = ((AMOUNT - fee1) * CUSTODY_FEE_BPS) / 10000;
        vm.expectEmit(true, true, false, true, address(token));
        emit ERC20CustodyFeeUpgradeable.CustodyFeeCollected(holderA, fee2, 2);
        token.sweepCustodyFee(_arr(holderA));

        assertEq(token.balanceOf(custodyTreasuryAddr), fee1 + fee2);
        assertEq(token.balanceOf(holderA), AMOUNT - fee1 - fee2);
    }

    /// @dev lastSweptCycle: 0 = never swept, then tracks the sweep cycle
    function test_lastSweptCycle_viewLifecycle() public {
        token.mint(holderA, AMOUNT);
        assertEq(token.lastSweptCycle(holderA), 0); // never swept

        token.sweepCustodyFee(_arr(holderA));
        assertEq(token.lastSweptCycle(holderA), 1);

        token.startNewCycle();
        assertEq(token.lastSweptCycle(holderA), 1); // unchanged until swept again

        token.sweepCustodyFee(_arr(holderA));
        assertEq(token.lastSweptCycle(holderA), 2);
    }

    // ─────────────────────────────────────────────
    // Sweep — bypasses pause / freeze / blocklist (D3)
    // ─────────────────────────────────────────────

    /// @dev sweep works while the token is paused; normal transfers revert EnforcedPause
    function test_sweep_worksWhilePaused() public {
        token.mint(holderA, AMOUNT);
        token.pause();

        // Normal transfer reverts while paused
        vm.prank(holderA);
        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        token.transfer(holderB, 1);

        // Sweep bypasses the pause
        uint256 expectedFee = (AMOUNT * CUSTODY_FEE_BPS) / 10000;
        token.sweepCustodyFee(_arr(holderA));

        assertEq(token.balanceOf(holderA), AMOUNT - expectedFee);
        assertEq(token.balanceOf(custodyTreasuryAddr), expectedFee);
    }

    /// @dev sweep works on a frozen holder; the holder itself cannot transfer
    function test_sweep_worksOnFrozenHolder() public {
        token.mint(holderA, AMOUNT);
        token.freeze(holderA);
        assertTrue(token.isFrozen(holderA));

        vm.prank(holderA);
        vm.expectRevert(ERC20FreezableUpgradeable.AccountFrozen.selector);
        token.transfer(holderB, 1);

        uint256 expectedFee = (AMOUNT * CUSTODY_FEE_BPS) / 10000;
        token.sweepCustodyFee(_arr(holderA));

        assertEq(token.balanceOf(holderA), AMOUNT - expectedFee);
        assertEq(token.balanceOf(custodyTreasuryAddr), expectedFee);
    }

    /// @dev sweep works on a blocked holder; the holder itself cannot transfer
    function test_sweep_worksOnBlockedHolder() public {
        token.mint(holderA, AMOUNT);
        token.blockAccount(holderA);
        assertTrue(token.isBlocked(holderA));

        vm.prank(holderA);
        vm.expectRevert(ERC20BlocklistUpgradeable.AccountBlocked.selector);
        token.transfer(holderB, 1);

        uint256 expectedFee = (AMOUNT * CUSTODY_FEE_BPS) / 10000;
        token.sweepCustodyFee(_arr(holderA));

        assertEq(token.balanceOf(holderA), AMOUNT - expectedFee);
        assertEq(token.balanceOf(custodyTreasuryAddr), expectedFee);
    }

    // ─────────────────────────────────────────────
    // Sweep — no transfer fee on the collection path
    // ─────────────────────────────────────────────

    /// @dev the sweep does NOT pay the transfer fee: the treasury receives the
    /// full custody fee, the transfer-fee collector receives nothing, and exactly
    /// one Transfer + one CustodyFeeCollected are emitted
    function test_sweep_doesNotApplyTransferFee() public {
        assertEq(token.transferFeeBps(), TRANSFER_FEE_BPS); // transfer fee is active
        token.mint(holderA, AMOUNT);

        uint256 expectedFee = (AMOUNT * CUSTODY_FEE_BPS) / 10000;
        uint256 collectorBefore = token.balanceOf(feeCollectorAddr);

        vm.recordLogs();
        token.sweepCustodyFee(_arr(holderA));

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 2);
        assertEq(logs[0].topics[0], keccak256("Transfer(address,address,uint256)"));
        assertEq(address(uint160(uint256(logs[0].topics[1]))), holderA);
        assertEq(address(uint160(uint256(logs[0].topics[2]))), custodyTreasuryAddr);
        assertEq(logs[1].topics[0], keccak256("CustodyFeeCollected(address,uint256,uint256)"));

        // Full custody fee to the treasury, nothing to the transfer-fee collector
        assertEq(token.balanceOf(custodyTreasuryAddr), expectedFee);
        assertEq(token.balanceOf(feeCollectorAddr), collectorBefore);
    }

    // ─────────────────────────────────────────────
    // Sweep — zero bps and dust balances
    // ─────────────────────────────────────────────

    /// @dev custodyFeeBps = 0: the holder is marked as swept, but no transfer and
    /// no CustodyFeeCollected event occur
    function test_sweep_zeroBps_marksCycleWithoutTransfer() public {
        token.setCustodyFeeBps(0);
        token.mint(holderA, AMOUNT);

        vm.recordLogs();
        token.sweepCustodyFee(_arr(holderA));

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 0);
        assertEq(token.balanceOf(holderA), AMOUNT);
        assertEq(token.balanceOf(custodyTreasuryAddr), 0);
        assertEq(token.lastSweptCycle(holderA), 1); // marked anyway
    }

    /// @dev dust balance (balance * bps < 10000): fee rounds to 0, holder is
    /// still marked as swept, no transfer and no event
    function test_sweep_dustBalance_feeZeroButMarked() public {
        uint256 dust = 199; // 199 * 50 / 10000 = 0
        token.mint(holderA, dust);

        vm.recordLogs();
        token.sweepCustodyFee(_arr(holderA));

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 0);
        assertEq(token.balanceOf(holderA), dust);
        assertEq(token.balanceOf(custodyTreasuryAddr), 0);
        assertEq(token.lastSweptCycle(holderA), 1);
    }

    // ─────────────────────────────────────────────
    // Setters — setCustodyFeeBps
    // ─────────────────────────────────────────────

    /// @dev setCustodyFeeBps updates the fee and emits CustodyFeeUpdated(old, new)
    function test_setCustodyFeeBps_updatesAndEmits() public {
        vm.expectEmit(false, false, false, true, address(token));
        emit ERC20CustodyFeeUpgradeable.CustodyFeeUpdated(CUSTODY_FEE_BPS, 75);

        token.setCustodyFeeBps(75);
        assertEq(token.custodyFeeBps(), 75);
    }

    /// @dev the cap value itself (200) is accepted
    function test_setCustodyFeeBps_atCapSucceeds() public {
        token.setCustodyFeeBps(200);
        assertEq(token.custodyFeeBps(), 200);
    }

    /// @dev above the cap reverts CustodyFeeExceedsMaximum(requested, maximum)
    function test_setCustodyFeeBps_aboveCapReverts() public {
        vm.expectRevert(abi.encodeWithSelector(ERC20CustodyFeeUpgradeable.CustodyFeeExceedsMaximum.selector, 201, 200));
        token.setCustodyFeeBps(201);
    }

    // ─────────────────────────────────────────────
    // Setters — setCustodyTreasury
    // ─────────────────────────────────────────────

    /// @dev setCustodyTreasury updates the address and emits CustodyTreasuryUpdated(old, new)
    function test_setCustodyTreasury_updatesAndEmits() public {
        address newTreasury = address(0x7EA50001);

        vm.expectEmit(true, true, false, true, address(token));
        emit ERC20CustodyFeeUpgradeable.CustodyTreasuryUpdated(custodyTreasuryAddr, newTreasury);

        token.setCustodyTreasury(newTreasury);
        assertEq(token.custodyTreasury(), newTreasury);
    }

    /// @dev setCustodyTreasury(0) reverts InvalidCustodyTreasury
    function test_setCustodyTreasury_zeroAddressReverts() public {
        vm.expectRevert(ERC20CustodyFeeUpgradeable.InvalidCustodyTreasury.selector);
        token.setCustodyTreasury(address(0));
    }

    // ─────────────────────────────────────────────
    // Setters — exemption list (idempotent)
    // ─────────────────────────────────────────────

    /// @dev addCustodyFeeExempt adds and emits CustodyFeeExemptionChanged(account, true)
    function test_addCustodyFeeExempt_addsAndEmits() public {
        assertFalse(token.isCustodyFeeExempt(exemptHolder));

        vm.expectEmit(true, false, false, true, address(token));
        emit ERC20CustodyFeeUpgradeable.CustodyFeeExemptionChanged(exemptHolder, true);

        token.addCustodyFeeExempt(exemptHolder);
        assertTrue(token.isCustodyFeeExempt(exemptHolder));
    }

    /// @dev repeated add is a no-op: no event emitted
    function test_addCustodyFeeExempt_repeatedNoEvent() public {
        token.addCustodyFeeExempt(exemptHolder);

        vm.recordLogs();
        token.addCustodyFeeExempt(exemptHolder); // already exempt

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 0);
        assertTrue(token.isCustodyFeeExempt(exemptHolder));
    }

    /// @dev removeCustodyFeeExempt removes and emits CustodyFeeExemptionChanged(account, false)
    function test_removeCustodyFeeExempt_removesAndEmits() public {
        token.addCustodyFeeExempt(exemptHolder);

        vm.expectEmit(true, false, false, true, address(token));
        emit ERC20CustodyFeeUpgradeable.CustodyFeeExemptionChanged(exemptHolder, false);

        token.removeCustodyFeeExempt(exemptHolder);
        assertFalse(token.isCustodyFeeExempt(exemptHolder));
    }

    /// @dev removing a non-member is a no-op: no event emitted
    function test_removeCustodyFeeExempt_nonMemberNoEvent() public {
        vm.recordLogs();
        token.removeCustodyFeeExempt(exemptHolder); // never added

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 0);
        assertFalse(token.isCustodyFeeExempt(exemptHolder));
    }

    /// @dev getCustodyFeeExemptList: assert membership and length, NOT order (EnumerableSet)
    function test_getCustodyFeeExemptList_membership() public {
        assertEq(token.getCustodyFeeExemptList().length, 0);

        token.addCustodyFeeExempt(holderA);
        token.addCustodyFeeExempt(holderB);
        token.addCustodyFeeExempt(exemptHolder);

        address[] memory list = token.getCustodyFeeExemptList();
        assertEq(list.length, 3);
        assertTrue(_contains(list, holderA));
        assertTrue(_contains(list, holderB));
        assertTrue(_contains(list, exemptHolder));

        token.removeCustodyFeeExempt(holderB);

        list = token.getCustodyFeeExemptList();
        assertEq(list.length, 2);
        assertTrue(_contains(list, holderA));
        assertFalse(_contains(list, holderB));
        assertTrue(_contains(list, exemptHolder));
    }

    // ─────────────────────────────────────────────
    // Access control — FEE_ADMIN_ROLE (governance setters) / SWEEPER_ROLE (ops)
    // ─────────────────────────────────────────────

    function _expectUnauthorized(address account, bytes32 role) internal {
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, account, role));
    }

    function test_setCustodyFeeBps_withoutRoleReverts() public {
        _expectUnauthorized(unauthorized, token.FEE_ADMIN_ROLE());
        vm.prank(unauthorized);
        token.setCustodyFeeBps(10);
    }

    function test_setCustodyTreasury_withoutRoleReverts() public {
        _expectUnauthorized(unauthorized, token.FEE_ADMIN_ROLE());
        vm.prank(unauthorized);
        token.setCustodyTreasury(address(0x7EA50002));
    }

    function test_addCustodyFeeExempt_withoutRoleReverts() public {
        _expectUnauthorized(unauthorized, token.FEE_ADMIN_ROLE());
        vm.prank(unauthorized);
        token.addCustodyFeeExempt(holderA);
    }

    function test_removeCustodyFeeExempt_withoutRoleReverts() public {
        _expectUnauthorized(unauthorized, token.FEE_ADMIN_ROLE());
        vm.prank(unauthorized);
        token.removeCustodyFeeExempt(holderA);
    }

    function test_startNewCycle_withoutRoleReverts() public {
        _expectUnauthorized(unauthorized, token.SWEEPER_ROLE());
        vm.prank(unauthorized);
        token.startNewCycle();
    }

    function test_sweepCustodyFee_withoutRoleReverts() public {
        address[] memory holders = _arr(holderA);
        _expectUnauthorized(unauthorized, token.SWEEPER_ROLE());
        vm.prank(unauthorized);
        token.sweepCustodyFee(holders);
    }

    // ─────────────────────────────────────────────
    // Fuzz
    // ─────────────────────────────────────────────

    /// @dev for any bps in [0, 200] and any balance: the fee never exceeds the
    /// balance and the sweep never reverts
    function testFuzz_sweep_feeNeverExceedsBalance(uint256 bps, uint128 balance) public {
        bps = bound(bps, 0, 200);
        token.setCustodyFeeBps(bps);
        if (balance > 0) {
            token.mint(holderA, balance);
        }

        uint256 expectedFee = (uint256(balance) * bps) / 10000;
        assertLe(expectedFee, balance);

        token.sweepCustodyFee(_arr(holderA)); // must never revert

        assertEq(token.balanceOf(holderA), uint256(balance) - expectedFee);
        assertEq(token.balanceOf(custodyTreasuryAddr), expectedFee);
        assertEq(token.lastSweptCycle(holderA), 1); // marked even when fee == 0
    }

    /// @dev a batch containing address(0), the treasury, an exempt account and
    /// duplicates never reverts and charges each eligible holder exactly once
    function testFuzz_sweep_mixedBatchNeverReverts(uint256 bps, uint128 balance) public {
        bps = bound(bps, 0, 200);
        token.setCustodyFeeBps(bps);
        if (balance > 0) {
            token.mint(holderA, balance);
        }
        token.mint(exemptHolder, AMOUNT);
        token.addCustodyFeeExempt(exemptHolder);

        address[] memory holders = new address[](5);
        holders[0] = holderA;
        holders[1] = address(0);
        holders[2] = custodyTreasuryAddr;
        holders[3] = exemptHolder;
        holders[4] = holderA; // duplicate

        uint256 treasuryBefore = token.balanceOf(custodyTreasuryAddr);
        uint256 expectedFee = (uint256(balance) * bps) / 10000;

        token.sweepCustodyFee(holders); // must never revert

        assertEq(token.balanceOf(holderA), uint256(balance) - expectedFee); // charged once
        assertEq(token.balanceOf(custodyTreasuryAddr), treasuryBefore + expectedFee);
        assertEq(token.balanceOf(exemptHolder), AMOUNT); // untouched
        assertEq(token.lastSweptCycle(exemptHolder), 0);
        assertEq(token.lastSweptCycle(custodyTreasuryAddr), 0);
        assertEq(token.lastSweptCycle(address(0)), 0);
    }

    /// @dev the same holder repeated N times in one batch is charged exactly once
    function testFuzz_sweep_duplicateHolderChargedOnce(uint128 balance, uint8 repeats) public {
        repeats = uint8(bound(repeats, 2, 20));
        vm.assume(balance > 0);
        token.mint(holderA, balance);

        address[] memory holders = new address[](repeats);
        for (uint256 i = 0; i < repeats; i++) {
            holders[i] = holderA;
        }

        uint256 expectedFee = (uint256(balance) * CUSTODY_FEE_BPS) / 10000;

        token.sweepCustodyFee(holders);

        assertEq(token.balanceOf(holderA), uint256(balance) - expectedFee);
        assertEq(token.balanceOf(custodyTreasuryAddr), expectedFee);
    }

    /// @dev POLICY (coerente con D3): la treasury FROZEN riceve comunque la
    /// custody fee — il prelievo bypassa i check anche in ricezione
    function test_sweep_worksWithFrozenTreasury() public {
        token.mint(holderA, 10_000 * 10 ** 18);
        token.freeze(custodyTreasuryAddr);

        uint256 expectedFee = (token.balanceOf(holderA) * CUSTODY_FEE_BPS) / 10000;

        address[] memory holders = new address[](1);
        holders[0] = holderA;
        token.sweepCustodyFee(holders);

        assertEq(token.balanceOf(custodyTreasuryAddr), expectedFee);
    }

    /// @dev POLICY: idem con treasury in blocklist
    function test_sweep_worksWithBlockedTreasury() public {
        token.mint(holderA, 10_000 * 10 ** 18);
        token.blockAccount(custodyTreasuryAddr);

        uint256 expectedFee = (token.balanceOf(holderA) * CUSTODY_FEE_BPS) / 10000;

        address[] memory holders = new address[](1);
        holders[0] = holderA;
        token.sweepCustodyFee(holders);

        assertEq(token.balanceOf(custodyTreasuryAddr), expectedFee);
    }

    /// @dev batch vuoto: no-op senza revert
    function test_sweep_emptyBatch_noop() public {
        uint256 treasuryBefore = token.balanceOf(custodyTreasuryAddr);

        token.sweepCustodyFee(new address[](0));

        assertEq(token.balanceOf(custodyTreasuryAddr), treasuryBefore);
        assertEq(token.currentCycle(), 1);
    }

    /// @dev profilo gas: guardia anti-regressione per il dimensionamento dei
    /// batch operativi (runbook). Budget: < 100k gas per holder.
    function test_sweep_gasProfile_batch100() public {
        uint256 n = 100;
        address[] memory holders = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            holders[i] = address(uint160(0x6A5000 + i));
            token.mint(holders[i], 1_000 * 10 ** 18);
        }

        uint256 gasBefore = gasleft();
        token.sweepCustodyFee(holders);
        uint256 used = gasBefore - gasleft();

        emit log_named_uint("gas totale sweep batch 100 holder", used);
        emit log_named_uint("gas medio per holder", used / n);
        assertLt(used / n, 100_000, "gas per holder oltre il budget del runbook");
    }

    /// @dev un holder gia' spazzato nel ciclo corrente deve essere SALTATO (continue),
    /// non deve interrompere il batch (break): gli holder successivi vanno comunque spazzati.
    function test_sweep_alreadySweptHolderDoesNotStopBatch() public {
        token.mint(holderA, AMOUNT);
        token.mint(holderB, AMOUNT);

        // Prima passata: solo holderA viene spazzato in questo ciclo
        token.sweepCustodyFee(_arr(holderA));
        assertEq(token.lastSweptCycle(holderA), 1);
        assertEq(token.lastSweptCycle(holderB), 0);

        uint256 expectedFeeB = (AMOUNT * CUSTODY_FEE_BPS) / 10000;
        uint256 treasuryBefore = token.balanceOf(custodyTreasuryAddr);

        // Batch con holderA (gia' spazzato) PRIMA di holderB (non spazzato):
        // con `continue` holderA e' saltato e holderB viene spazzato;
        // con `break` il loop si ferma su holderA e holderB resta intatto.
        token.sweepCustodyFee(_arr(holderA, holderB));

        assertEq(
            token.balanceOf(holderB), AMOUNT - expectedFeeB, "holderB deve essere spazzato dopo holderA gia' spazzato"
        );
        assertEq(token.balanceOf(custodyTreasuryAddr), treasuryBefore + expectedFeeB);
        assertEq(token.lastSweptCycle(holderB), 1);
    }
}
