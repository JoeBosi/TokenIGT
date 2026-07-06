// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../../contracts/Token.sol";
import "./UUPSProxy.sol";

/**
 * @title TokenFeeSemanticsTest
 * @dev Foundry tests dedicated to the DUAL transfer-fee semantics and the
 * fee preview views (see SPEC_FEE_CUSTODIA.md).
 *
 * Behaviour under test:
 *   NET path   — transfer / transferFrom:
 *     sender -value, recipient +value-fee, collector +fee
 *     two Transfer events: (from→to, value-fee) then (from→collector, fee)
 *     allowance consumed for `value` (unchanged w.r.t. plain ERC-20)
 *   GROSS path — transferAndCall / transferFromAndCall /
 *                transferWithAuthorization / receiveWithAuthorization:
 *     recipient +value EXACT, sender -(value+fee), collector +fee
 *     two Transfer events: (from→to, value) then (from→collector, fee)
 *     transferFromAndCall consumes allowance for the GROSS (value+fee)
 *   collector == from — fee stays with the sender, single Transfer event
 *   transferFeeBps == 0 (and custodyFeeBps == 0) — every path behaves as a
 *     pure ERC-20: exactly one Transfer event, exact conservation
 *   sender/recipient exemption — fee is 0 on both paths
 *   previewNet / previewGross / maxNetTransferable — pure fee-math views
 *   infinite allowance (type(uint256).max) — never decremented
 */
contract TokenFeeSemanticsTest is Test {
    Token public token; // transferFeeBps = FEE_BPS, custodyFeeBps = CUSTODY_BPS
    Token public tokenZero; // transferFeeBps = 0 AND custodyFeeBps = 0

    // EIP-712 type hash (must match exactly what the contract uses)
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    bytes32 internal constant TRANSFER_TOPIC = keccak256("Transfer(address,address,uint256)");

    address public admin;
    uint256 public alicePk;
    address public alice; // holder of the initial supply, EIP-3009 signer
    address public bob; // plain EOA recipient (no code → no ERC-1363 callback)
    address public carol; // spender for transferFrom / transferFromAndCall
    address public feeCollector;
    address public custodyTreasury;

    uint256 constant INITIAL_SUPPLY = 1_000_000 * 10 ** 18;
    uint256 constant FEE_BPS = 100; // 1% — the maximum allowed (MAX_TRANSFER_FEE_BPS)
    uint256 constant CUSTODY_BPS = 50; // 0.5% — irrelevant for transfers, swept separately
    uint256 constant AMOUNT = 10_000 * 10 ** 18;
    uint256 constant FEE_ON_AMOUNT = (AMOUNT * FEE_BPS) / 10000; // 100e18

    function setUp() public {
        admin = address(this);
        alicePk = 0xA11CE;
        alice = vm.addr(alicePk);
        bob = makeAddr("bob");
        carol = makeAddr("carol");
        feeCollector = makeAddr("feeCollector");
        custodyTreasury = makeAddr("custodyTreasury");

        token = _deployToken(FEE_BPS, CUSTODY_BPS);
        tokenZero = _deployToken(0, 0);

        // Operational roles are NOT granted by initialize — grant what the suite needs
        token.grantRole(token.MINTER_ROLE(), admin);
        token.grantRole(token.FREEZER_ROLE(), admin);
        token.grantRole(token.BLOCKER_ROLE(), admin);
    }

    // ─────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────

    function _deployToken(uint256 transferFeeBps_, uint256 custodyFeeBps_) internal returns (Token t) {
        Token implementation = new Token();
        bytes memory initData = abi.encodeWithSelector(
            Token.initialize.selector,
            "IGE Token",
            "IGT",
            INITIAL_SUPPLY,
            alice, // alice holds the initial supply
            transferFeeBps_,
            feeCollector,
            custodyFeeBps_,
            custodyTreasury,
            admin
        );
        UUPSProxy proxy = new UUPSProxy(address(implementation), initData);
        t = Token(payable(address(proxy)));
    }

    /// @dev Fee of the main fixture (FEE_BPS) with the contract's floor rounding
    function _fee(uint256 value) internal pure returns (uint256) {
        return (value * FEE_BPS) / 10000;
    }

    /// @dev Build and sign a TransferWithAuthorization EIP-712 struct for token `t`
    function _sign3009(
        Token t,
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint256 pk
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", t.DOMAIN_SEPARATOR(), structHash));
        (v, r, s) = vm.sign(pk, digest);
    }

    /// @dev Assert that the recorded logs contain EXACTLY ONE Transfer event from
    /// `emitter`, with the given args (requires vm.recordLogs() before the call)
    function _assertSingleTransfer(address emitter, address from, address to, uint256 value) internal {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 found;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter != emitter || logs[i].topics[0] != TRANSFER_TOPIC) continue;
            found++;
            assertEq(address(uint160(uint256(logs[i].topics[1]))), from, "Transfer.from");
            assertEq(address(uint160(uint256(logs[i].topics[2]))), to, "Transfer.to");
            assertEq(abi.decode(logs[i].data, (uint256)), value, "Transfer.value");
        }
        assertEq(found, 1, "expected exactly one Transfer event");
    }

    // ─────────────────────────────────────────────
    // (1a) NET path (transfer / transferFrom), fee > 0
    // ─────────────────────────────────────────────

    function test_transfer_net_balancesAndEvents() public {
        // Two Transfer events, in order: net to recipient, then fee to collector
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(alice, bob, AMOUNT - FEE_ON_AMOUNT);
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(alice, feeCollector, FEE_ON_AMOUNT);

        vm.prank(alice);
        token.transfer(bob, AMOUNT);

        // NET semantics: sender pays the stated value, recipient gets value - fee
        assertEq(token.balanceOf(alice), INITIAL_SUPPLY - AMOUNT);
        assertEq(token.balanceOf(bob), AMOUNT - FEE_ON_AMOUNT);
        assertEq(token.balanceOf(feeCollector), FEE_ON_AMOUNT);
        assertEq(token.totalSupply(), INITIAL_SUPPLY);
    }

    function test_transferFrom_net_balancesAndEvents_allowanceConsumedForValue() public {
        vm.prank(alice);
        token.approve(carol, AMOUNT);

        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(alice, bob, AMOUNT - FEE_ON_AMOUNT);
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(alice, feeCollector, FEE_ON_AMOUNT);

        vm.prank(carol);
        token.transferFrom(alice, bob, AMOUNT);

        assertEq(token.balanceOf(alice), INITIAL_SUPPLY - AMOUNT);
        assertEq(token.balanceOf(bob), AMOUNT - FEE_ON_AMOUNT);
        assertEq(token.balanceOf(feeCollector), FEE_ON_AMOUNT);
        // Allowance consumed for the stated value (NOT value + fee)
        assertEq(token.allowance(alice, carol), 0);
    }

    // ─────────────────────────────────────────────
    // (1b) GROSS path (ERC-1363 + EIP-3009), fee > 0
    // ─────────────────────────────────────────────

    function test_transferAndCall_gross_balancesAndEvents() public {
        // Two Transfer events, in order: EXACT value to recipient, then fee to collector
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(alice, bob, AMOUNT);
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(alice, feeCollector, FEE_ON_AMOUNT);

        vm.prank(alice);
        bool ok = token.transferAndCall(bob, AMOUNT);

        assertTrue(ok);
        // GROSS semantics: recipient receives exactly the stated value,
        // the sender additionally pays the fee
        assertEq(token.balanceOf(bob), AMOUNT);
        assertEq(token.balanceOf(alice), INITIAL_SUPPLY - AMOUNT - FEE_ON_AMOUNT);
        assertEq(token.balanceOf(feeCollector), FEE_ON_AMOUNT);
        assertEq(token.totalSupply(), INITIAL_SUPPLY);
    }

    function test_transferFromAndCall_gross_balancesAndEvents_allowanceConsumedForGross() public {
        // The allowance must cover the GROSS: value + fee
        vm.prank(alice);
        token.approve(carol, AMOUNT + FEE_ON_AMOUNT);

        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(alice, bob, AMOUNT);
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(alice, feeCollector, FEE_ON_AMOUNT);

        vm.prank(carol);
        bool ok = token.transferFromAndCall(alice, bob, AMOUNT);

        assertTrue(ok);
        assertEq(token.balanceOf(bob), AMOUNT);
        assertEq(token.balanceOf(alice), INITIAL_SUPPLY - AMOUNT - FEE_ON_AMOUNT);
        assertEq(token.balanceOf(feeCollector), FEE_ON_AMOUNT);
        // Allowance consumed for the gross: value + fee
        assertEq(token.allowance(alice, carol), 0);
    }

    function test_transferWithAuthorization_gross_balancesAndEvents() public {
        bytes32 nonce = keccak256("fee-3009-transfer");
        uint256 validBefore = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sign3009(token, alice, bob, AMOUNT, 0, validBefore, nonce, alicePk);

        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(alice, bob, AMOUNT);
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(alice, feeCollector, FEE_ON_AMOUNT);

        token.transferWithAuthorization(alice, bob, AMOUNT, 0, validBefore, nonce, v, r, s);

        assertEq(token.balanceOf(bob), AMOUNT);
        assertEq(token.balanceOf(alice), INITIAL_SUPPLY - AMOUNT - FEE_ON_AMOUNT);
        assertEq(token.balanceOf(feeCollector), FEE_ON_AMOUNT);
    }

    function test_receiveWithAuthorization_gross_balancesAndEvents() public {
        bytes32 nonce = keccak256("fee-3009-receive");
        uint256 validBefore = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sign3009(token, alice, bob, AMOUNT, 0, validBefore, nonce, alicePk);

        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(alice, bob, AMOUNT);
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(alice, feeCollector, FEE_ON_AMOUNT);

        // receiveWithAuthorization must be called BY the recipient
        vm.prank(bob);
        token.receiveWithAuthorization(alice, bob, AMOUNT, 0, validBefore, nonce, v, r, s);

        assertEq(token.balanceOf(bob), AMOUNT);
        assertEq(token.balanceOf(alice), INITIAL_SUPPLY - AMOUNT - FEE_ON_AMOUNT);
        assertEq(token.balanceOf(feeCollector), FEE_ON_AMOUNT);
    }

    function test_transferAndCall_insufficientBalanceForGrossFeeReverts() public {
        // poor holds exactly AMOUNT: value fits but value + fee does not
        address poor = makeAddr("poor");
        token.mint(poor, AMOUNT);

        vm.prank(poor);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, poor, 0, FEE_ON_AMOUNT));
        token.transferAndCall(bob, AMOUNT);
    }

    // ─────────────────────────────────────────────
    // (2) collector == from — the fee stays with the sender
    // ─────────────────────────────────────────────

    function test_transfer_collectorIsSender_singleEventFeeStays() public {
        token.setFeeCollector(alice);

        vm.recordLogs();
        vm.prank(alice);
        token.transfer(bob, AMOUNT);

        // Only the net leg is settled: no (from→collector) event
        _assertSingleTransfer(address(token), alice, bob, AMOUNT - FEE_ON_AMOUNT);
        // The fee simply stays with the sender
        assertEq(token.balanceOf(alice), INITIAL_SUPPLY - (AMOUNT - FEE_ON_AMOUNT));
        assertEq(token.balanceOf(bob), AMOUNT - FEE_ON_AMOUNT);
        assertEq(token.totalSupply(), INITIAL_SUPPLY);
    }

    function test_transferAndCall_collectorIsSender_singleEventFeeStays() public {
        token.setFeeCollector(alice);

        vm.recordLogs();
        vm.prank(alice);
        bool ok = token.transferAndCall(bob, AMOUNT);

        assertTrue(ok);
        // Recipient still receives the exact value; the fee leg is skipped
        _assertSingleTransfer(address(token), alice, bob, AMOUNT);
        assertEq(token.balanceOf(alice), INITIAL_SUPPLY - AMOUNT);
        assertEq(token.balanceOf(bob), AMOUNT);
        assertEq(token.totalSupply(), INITIAL_SUPPLY);
    }

    // ─────────────────────────────────────────────
    // (3) FEE = 0 matrix — transferFeeBps = 0 AND custodyFeeBps = 0:
    //     every path behaves as a pure ERC-20
    // ─────────────────────────────────────────────

    function test_zeroFee_transfer_behavesAsPureERC20() public {
        vm.recordLogs();
        vm.prank(alice);
        tokenZero.transfer(bob, AMOUNT);

        _assertSingleTransfer(address(tokenZero), alice, bob, AMOUNT);
        assertEq(tokenZero.balanceOf(alice), INITIAL_SUPPLY - AMOUNT);
        assertEq(tokenZero.balanceOf(bob), AMOUNT);
        assertEq(tokenZero.balanceOf(feeCollector), 0);
        assertEq(tokenZero.totalSupply(), INITIAL_SUPPLY);
    }

    function test_zeroFee_transferFrom_behavesAsPureERC20() public {
        vm.prank(alice);
        tokenZero.approve(carol, AMOUNT);

        vm.recordLogs();
        vm.prank(carol);
        tokenZero.transferFrom(alice, bob, AMOUNT);

        _assertSingleTransfer(address(tokenZero), alice, bob, AMOUNT);
        assertEq(tokenZero.balanceOf(alice), INITIAL_SUPPLY - AMOUNT);
        assertEq(tokenZero.balanceOf(bob), AMOUNT);
        assertEq(tokenZero.balanceOf(feeCollector), 0);
        assertEq(tokenZero.allowance(alice, carol), 0);
    }

    function test_zeroFee_transferAndCall_behavesAsPureERC20() public {
        vm.recordLogs();
        vm.prank(alice);
        bool ok = tokenZero.transferAndCall(bob, AMOUNT);

        assertTrue(ok);
        _assertSingleTransfer(address(tokenZero), alice, bob, AMOUNT);
        assertEq(tokenZero.balanceOf(alice), INITIAL_SUPPLY - AMOUNT);
        assertEq(tokenZero.balanceOf(bob), AMOUNT);
        assertEq(tokenZero.balanceOf(feeCollector), 0);
        assertEq(tokenZero.totalSupply(), INITIAL_SUPPLY);
    }

    function test_zeroFee_transferFromAndCall_behavesAsPureERC20() public {
        // With fee = 0 the gross equals the value: allowance = value suffices
        vm.prank(alice);
        tokenZero.approve(carol, AMOUNT);

        vm.recordLogs();
        vm.prank(carol);
        bool ok = tokenZero.transferFromAndCall(alice, bob, AMOUNT);

        assertTrue(ok);
        _assertSingleTransfer(address(tokenZero), alice, bob, AMOUNT);
        assertEq(tokenZero.balanceOf(alice), INITIAL_SUPPLY - AMOUNT);
        assertEq(tokenZero.balanceOf(bob), AMOUNT);
        assertEq(tokenZero.balanceOf(feeCollector), 0);
        assertEq(tokenZero.allowance(alice, carol), 0);
    }

    function test_zeroFee_transferWithAuthorization_behavesAsPureERC20() public {
        bytes32 nonce = keccak256("zerofee-3009-transfer");
        uint256 validBefore = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sign3009(tokenZero, alice, bob, AMOUNT, 0, validBefore, nonce, alicePk);

        vm.recordLogs();
        tokenZero.transferWithAuthorization(alice, bob, AMOUNT, 0, validBefore, nonce, v, r, s);

        _assertSingleTransfer(address(tokenZero), alice, bob, AMOUNT);
        assertEq(tokenZero.balanceOf(alice), INITIAL_SUPPLY - AMOUNT);
        assertEq(tokenZero.balanceOf(bob), AMOUNT);
        assertEq(tokenZero.balanceOf(feeCollector), 0);
        assertEq(tokenZero.totalSupply(), INITIAL_SUPPLY);
    }

    function test_zeroFee_receiveWithAuthorization_behavesAsPureERC20() public {
        bytes32 nonce = keccak256("zerofee-3009-receive");
        uint256 validBefore = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sign3009(tokenZero, alice, bob, AMOUNT, 0, validBefore, nonce, alicePk);

        vm.recordLogs();
        vm.prank(bob);
        tokenZero.receiveWithAuthorization(alice, bob, AMOUNT, 0, validBefore, nonce, v, r, s);

        _assertSingleTransfer(address(tokenZero), alice, bob, AMOUNT);
        assertEq(tokenZero.balanceOf(alice), INITIAL_SUPPLY - AMOUNT);
        assertEq(tokenZero.balanceOf(bob), AMOUNT);
        assertEq(tokenZero.balanceOf(feeCollector), 0);
        assertEq(tokenZero.totalSupply(), INITIAL_SUPPLY);
    }

    // ─────────────────────────────────────────────
    // (4) Sender/recipient exemption on both paths
    // ─────────────────────────────────────────────

    function test_transfer_senderExempt_noFee() public {
        token.addTransferFeeExempt(alice);

        vm.recordLogs();
        vm.prank(alice);
        token.transfer(bob, AMOUNT);

        _assertSingleTransfer(address(token), alice, bob, AMOUNT);
        assertEq(token.balanceOf(alice), INITIAL_SUPPLY - AMOUNT);
        assertEq(token.balanceOf(bob), AMOUNT);
        assertEq(token.balanceOf(feeCollector), 0);
    }

    function test_transfer_recipientExempt_noFee() public {
        token.addTransferFeeExempt(bob);

        vm.recordLogs();
        vm.prank(alice);
        token.transfer(bob, AMOUNT);

        _assertSingleTransfer(address(token), alice, bob, AMOUNT);
        assertEq(token.balanceOf(alice), INITIAL_SUPPLY - AMOUNT);
        assertEq(token.balanceOf(bob), AMOUNT);
        assertEq(token.balanceOf(feeCollector), 0);
    }

    function test_transferAndCall_senderExempt_noFee() public {
        token.addTransferFeeExempt(alice);

        vm.recordLogs();
        vm.prank(alice);
        bool ok = token.transferAndCall(bob, AMOUNT);

        assertTrue(ok);
        _assertSingleTransfer(address(token), alice, bob, AMOUNT);
        // Exempt gross transfer: the sender pays exactly the value, no fee leg
        assertEq(token.balanceOf(alice), INITIAL_SUPPLY - AMOUNT);
        assertEq(token.balanceOf(bob), AMOUNT);
        assertEq(token.balanceOf(feeCollector), 0);
    }

    function test_transferAndCall_recipientExempt_noFee() public {
        token.addTransferFeeExempt(bob);

        vm.recordLogs();
        vm.prank(alice);
        bool ok = token.transferAndCall(bob, AMOUNT);

        assertTrue(ok);
        _assertSingleTransfer(address(token), alice, bob, AMOUNT);
        assertEq(token.balanceOf(alice), INITIAL_SUPPLY - AMOUNT);
        assertEq(token.balanceOf(bob), AMOUNT);
        assertEq(token.balanceOf(feeCollector), 0);
    }

    function test_transferFromAndCall_senderExempt_allowanceConsumedForValueOnly() public {
        token.addTransferFeeExempt(alice);

        // With the exemption the gross equals the value: allowance = value suffices
        vm.prank(alice);
        token.approve(carol, AMOUNT);

        vm.prank(carol);
        bool ok = token.transferFromAndCall(alice, bob, AMOUNT);

        assertTrue(ok);
        assertEq(token.balanceOf(alice), INITIAL_SUPPLY - AMOUNT);
        assertEq(token.balanceOf(bob), AMOUNT);
        assertEq(token.allowance(alice, carol), 0);
    }

    // ─────────────────────────────────────────────
    // (5)+(6) Preview views — previewNet / previewGross
    // ─────────────────────────────────────────────

    function test_preview_concreteValues() public view {
        // FEE_BPS = 100 (1%): transfer(1000) delivers 990
        assertEq(token.previewNet(1000), 990);
        // Smallest gross delivering >= 990 is 999 (999 - floor(9.99) = 990)
        assertEq(token.previewGross(990), 999);
        assertEq(token.previewGross(0), 0);
    }

    function test_preview_zeroFee_identity() public view {
        assertEq(tokenZero.previewNet(AMOUNT), AMOUNT);
        assertEq(tokenZero.previewGross(AMOUNT), AMOUNT);
        assertEq(tokenZero.previewNet(0), 0);
        assertEq(tokenZero.previewGross(0), 0);
    }

    function testFuzz_previewNet_formula(uint256 gross, uint256 bps) public {
        gross = bound(gross, 0, type(uint128).max);
        bps = bound(bps, 0, 100);
        token.setTransferFeeBps(bps);

        assertEq(token.previewNet(gross), gross - (gross * bps) / 10000);
    }

    function testFuzz_previewGross_correctAndMinimal(uint256 net, uint256 bps) public {
        net = bound(net, 0, 1e30);
        bps = bound(bps, 1, 100);
        token.setTransferFeeBps(bps);

        uint256 g = token.previewGross(net);
        // Correctness: transferring g delivers at least net
        uint256 delivered = g - (g * bps) / 10000;
        assertGe(delivered, net, "previewGross must deliver at least net");

        // Minimality: g - 1 would deliver strictly less than net
        if (net > 0) {
            uint256 gMinus = g - 1;
            assertLt(gMinus - (gMinus * bps) / 10000, net, "previewGross must be minimal");
        }
    }

    // ─────────────────────────────────────────────
    // (7) maxNetTransferable
    // ─────────────────────────────────────────────

    function testFuzz_maxNetTransferable_maximalGrossSpend(uint256 balance, uint256 bps) public {
        balance = bound(balance, 0, 1e30);
        bps = bound(bps, 1, 100);
        token.setTransferFeeBps(bps);

        address holder = makeAddr("fuzz-holder");
        token.mint(holder, balance);

        uint256 v = token.maxNetTransferable(holder);
        // v + fee(v) fits in the balance...
        assertLe(v + (v * bps) / 10000, balance, "v + fee(v) must fit in balance");
        // ...and v is maximal: v + 1 would not fit
        assertGt(v + 1 + ((v + 1) * bps) / 10000, balance, "v must be maximal");
    }

    function test_maxNetTransferable_exemptReturnsFullBalance() public {
        token.addTransferFeeExempt(alice);
        assertEq(token.maxNetTransferable(alice), INITIAL_SUPPLY);
    }

    function test_maxNetTransferable_zeroFeeReturnsFullBalance() public view {
        assertEq(tokenZero.maxNetTransferable(alice), INITIAL_SUPPLY);
    }

    function test_maxNetTransferable_frozenReturnsZero() public {
        token.freeze(alice);
        assertEq(token.maxNetTransferable(alice), 0);
    }

    function test_maxNetTransferable_blockedReturnsZero() public {
        token.blockAccount(alice);
        assertEq(token.maxNetTransferable(alice), 0);
    }

    function test_maxNetTransferable_boundaryOnGrossPath() public {
        uint256 v = token.maxNetTransferable(alice);

        // v + 1 is NOT spendable via the gross path (the revert may happen on
        // either leg, so match the selector only)
        vm.prank(alice);
        vm.expectPartialRevert(IERC20Errors.ERC20InsufficientBalance.selector);
        token.transferAndCall(bob, v + 1);

        // v is spendable via the gross path
        vm.prank(alice);
        bool ok = token.transferAndCall(bob, v);

        assertTrue(ok);
        assertEq(token.balanceOf(bob), v);
        assertEq(token.balanceOf(alice), INITIAL_SUPPLY - v - _fee(v));
        assertEq(token.balanceOf(feeCollector), _fee(v));
    }

    // ─────────────────────────────────────────────
    // (8)+(9) Allowance semantics
    // ─────────────────────────────────────────────

    function test_transferFrom_infiniteAllowanceNotDecremented() public {
        vm.prank(alice);
        token.approve(carol, type(uint256).max);

        vm.prank(carol);
        token.transferFrom(alice, bob, AMOUNT);

        // Infinite allowance is NOT decremented (v1 fix)
        assertEq(token.allowance(alice, carol), type(uint256).max);
        assertEq(token.balanceOf(bob), AMOUNT - FEE_ON_AMOUNT);
        assertEq(token.balanceOf(feeCollector), FEE_ON_AMOUNT);
    }

    function test_transferFromAndCall_infiniteAllowanceNotDecremented() public {
        vm.prank(alice);
        token.approve(carol, type(uint256).max);

        vm.prank(carol);
        bool ok = token.transferFromAndCall(alice, bob, AMOUNT);

        assertTrue(ok);
        assertEq(token.allowance(alice, carol), type(uint256).max);
        assertEq(token.balanceOf(bob), AMOUNT);
        assertEq(token.balanceOf(alice), INITIAL_SUPPLY - AMOUNT - FEE_ON_AMOUNT);
    }

    function test_transferFromAndCall_insufficientGrossAllowanceReverts() public {
        // Allowance covers the value but NOT the gross (value + fee)
        vm.prank(alice);
        token.approve(carol, AMOUNT + FEE_ON_AMOUNT - 1);

        vm.prank(carol);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector,
                carol,
                AMOUNT + FEE_ON_AMOUNT - 1,
                AMOUNT + FEE_ON_AMOUNT
            )
        );
        token.transferFromAndCall(alice, bob, AMOUNT);
    }
}
