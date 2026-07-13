// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../../contracts/Token.sol";
import "forge-std/Test.sol";

/**
 * @title TokenHandler
 * @dev Handler contract for invariant testing - exposes stateful functions
 * for the Token v2.0.0 API.
 *
 * All token movements triggered by this handler stay inside the tracked set
 * {actors} U {feeCollector, custodyTreasury}, so the fundamental invariant
 * sum(balanceOf(tracked)) == totalSupply() can be asserted by the test contract.
 */
contract TokenHandler is Test {
    Token public token;

    // Actors for testing
    address[] public actors;
    mapping(address => bool) public isActor;

    // Ghost variables for tracking
    uint256 public totalMinted;
    uint256 public totalBurned;
    uint256 public currentTransferFeeBps;
    uint256 public cyclesStarted;

    // Roles
    address public admin;
    address public minter;
    address public burner;
    address public pauser;
    address public freezer;
    address public blocker;
    address public feeAdmin;
    address public sweeper;

    constructor(Token _token, address _admin, address _initialHolder) {
        token = _token;
        admin = _admin;

        // Setup roles
        minter = address(0x1);
        burner = address(0x2);
        pauser = address(0x3);
        freezer = address(0x4);
        blocker = address(0x5);
        feeAdmin = address(0x6);
        sweeper = address(0x7);

        // Grant roles (requires admin to have DEFAULT_ADMIN_ROLE)
        vm.startPrank(admin);
        _token.grantRole(_token.MINTER_ROLE(), minter);
        _token.grantRole(_token.BURNER_ROLE(), burner);
        _token.grantRole(_token.PAUSER_ROLE(), pauser);
        _token.grantRole(_token.FREEZER_ROLE(), freezer);
        _token.grantRole(_token.BLOCKER_ROLE(), blocker);
        _token.grantRole(_token.FEE_ADMIN_ROLE(), feeAdmin);
        _token.grantRole(_token.SWEEPER_ROLE(), sweeper);
        vm.stopPrank();

        // Track the initial holder so the balance-sum invariant accounts for
        // the supply minted by initialize(); count that supply in the ghost
        // accounting too, otherwise burns from the initial holder could exceed
        // the handler-tracked mints
        totalMinted = _token.totalSupply();
        if (_initialHolder != address(0)) {
            actors.push(_initialHolder);
            isActor[_initialHolder] = true;
        }

        // Initialize actors
        for (uint256 i = 0; i < 5; i++) {
            address actor = address(uint160(0x1000 + i));
            actors.push(actor);
            isActor[actor] = true;

            // Fund actors with some tokens
            vm.prank(minter);
            _token.mint(actor, 10000 * 10 ** 18);
            totalMinted += 10000 * 10 ** 18;
        }

        currentTransferFeeBps = _token.transferFeeBps();
    }

    function getActors() external view returns (address[] memory) {
        return actors;
    }

    // Stateful functions for fuzzing

    function mint(uint256 actorIndex, uint256 amount) external {
        // Mint goes through the pausable _update
        if (token.paused()) return;

        address to = actors[bound(actorIndex, 0, actors.length - 1)];
        amount = bound(amount, 0, 1_000_000 * 10 ** 18); // Max 1M tokens

        vm.prank(minter);
        token.mint(to, amount);
        totalMinted += amount;
    }

    function burn(uint256 actorIndex, uint256 amount) external {
        // Burn goes through the pausable _update
        if (token.paused()) return;

        address from = actors[bound(actorIndex, 0, actors.length - 1)];
        uint256 balance = token.balanceOf(from);
        amount = bound(amount, 0, balance);

        if (amount > 0) {
            vm.prank(burner);
            token.burn(from, amount);
            totalBurned += amount;
        }
    }

    function transfer(uint256 fromIndex, uint256 toIndex, uint256 amount) external {
        address from = actors[bound(fromIndex, 0, actors.length - 1)];
        address to = actors[bound(toIndex, 0, actors.length - 1)];

        // Skip if same address, paused, blocked or frozen (block/freeze apply
        // to both sender and recipient in v2)
        if (from == to || token.paused()) return;
        if (token.isBlocked(from) || token.isBlocked(to)) return;
        if (token.isFrozen(from) || token.isFrozen(to)) return;

        // Net path: the sender pays exactly `amount` (fee deducted from it)
        amount = bound(amount, 0, token.balanceOf(from));

        if (amount > 0) {
            vm.prank(from);
            token.transfer(to, amount);
        }
    }

    function transferAndCall(uint256 fromIndex, uint256 toIndex, uint256 amount) external {
        address from = actors[bound(fromIndex, 0, actors.length - 1)];
        address to = actors[bound(toIndex, 0, actors.length - 1)];

        if (from == to || token.paused()) return;
        if (token.isBlocked(from) || token.isBlocked(to)) return;
        if (token.isFrozen(from) || token.isFrozen(to)) return;

        // Gross path: the sender must cover amount + fee(amount)
        amount = bound(amount, 0, token.maxNetTransferable(from));

        if (amount > 0) {
            vm.prank(from);
            token.transferAndCall(to, amount);
        }
    }

    function setTransferFeeBps(uint256 newBps) external {
        newBps = bound(newBps, 0, token.MAX_TRANSFER_FEE_BPS());

        vm.prank(feeAdmin);
        token.setTransferFeeBps(newBps);
        currentTransferFeeBps = newBps;
    }

    function setCustodyFeeBps(uint256 newBps) external {
        newBps = bound(newBps, 0, token.MAX_CUSTODY_FEE_BPS());

        vm.prank(feeAdmin);
        token.setCustodyFeeBps(newBps);
    }

    function freeze(uint256 actorIndex) external {
        address account = actors[bound(actorIndex, 0, actors.length - 1)];

        vm.prank(freezer);
        token.freeze(account);
    }

    function unfreeze(uint256 actorIndex) external {
        address account = actors[bound(actorIndex, 0, actors.length - 1)];

        vm.prank(freezer);
        token.unfreeze(account);
    }

    function blockAccount(uint256 actorIndex) external {
        address account = actors[bound(actorIndex, 0, actors.length - 1)];

        vm.prank(blocker);
        token.blockAccount(account);
    }

    function unblockAccount(uint256 actorIndex) external {
        address account = actors[bound(actorIndex, 0, actors.length - 1)];

        vm.prank(blocker);
        token.unblockAccount(account);
    }

    function sweepCustodyFee(uint256 seed) external {
        // Random subset of actors selected by the seed bitmask; the sweep is
        // idempotent per cycle and never reverts for individual holders, and
        // it bypasses pause, blocklist and freeze
        uint256 count = 0;
        for (uint256 i = 0; i < actors.length; i++) {
            if ((seed >> i) & 1 == 1) {
                count++;
            }
        }
        if (count == 0) return;

        address[] memory holders = new address[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < actors.length; i++) {
            if ((seed >> i) & 1 == 1) {
                holders[j] = actors[i];
                j++;
            }
        }

        vm.prank(sweeper);
        token.sweepCustodyFee(holders);
    }

    function startNewCycle() external {
        vm.prank(sweeper);
        token.startNewCycle();
        cyclesStarted++;
    }

    function pause() external {
        if (token.paused()) return;

        vm.prank(pauser);
        token.pause();
    }

    function unpause() external {
        if (!token.paused()) return;

        vm.prank(pauser);
        token.unpause();
    }
}
