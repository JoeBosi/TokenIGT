// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./FeeRoles.sol";

/**
 * @title ERC20CustodyFeeUpgradeable
 * @dev Extension that implements a periodic on-chain custody fee, collected by
 * sweeping holder balances into a treasury.
 *
 * Operating model:
 * - the fee is `custodyFeeBps` of the holder balance AT SWEEP TIME (never more
 *   than the balance, so the sweep can never fail for insufficient funds);
 * - collection happens in cycles: `startNewCycle()` opens a new cycle, then
 *   `sweepCustodyFee(holders)` is called in batches (holders enumerated
 *   off-chain from Transfer events);
 * - the sweep is idempotent per cycle (`lastSweptCycle`): a holder already
 *   swept in the current cycle is skipped, so overlapping batches are safe;
 * - the reference date of the cycle (March 20) is an OFF-CHAIN operational
 *   convention, not enforced on-chain;
 * - anti-avoidance between batches is procedural: `pause()` -> all batches ->
 *   `unpause()`. The collection path implemented by the main contract bypasses
 *   pause, transfer fee, blocklist and freeze (custody is due even from
 *   blocked/frozen accounts);
 * - a holder is skipped when: exempt, already swept this cycle, the treasury
 *   itself, or the zero address. With `custodyFeeBps = 0` (or dust balances
 *   rounding to zero) the holder is marked as swept but no transfer occurs.
 *
 * Uses ERC-7201 namespaced storage.
 */
abstract contract ERC20CustodyFeeUpgradeable is Initializable, AccessControlUpgradeable, FeeRoles {
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @dev Hard cap for the custody fee: 200 basis points = 2%
    uint16 public constant MAX_CUSTODY_FEE_BPS = 200;

    /// @dev keccak256(abi.encode(uint256(keccak256("advanced.token.custodyfee.storage")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant CUSTODY_FEE_STORAGE_LOCATION =
        0x39e77610e4c9fed66f79595071fdfdfbbeefcaacd999260f06b81d93e001ac00;

    /// @custom:storage-location erc7201:advanced.token.custodyfee.storage
    struct CustodyFeeStorage {
        uint16 custodyFeeBps; // basis points (0-200), 0 = fee disabled
        address custodyTreasury;
        uint256 currentCycle; // starts at 1; 0 in lastSweptCycle means "never swept"
        mapping(address holder => uint256 cycle) lastSweptCycle;
        EnumerableSet.AddressSet exempt;
    }

    error CustodyFeeExceedsMaximum(uint256 requested, uint256 maximum);
    error InvalidCustodyTreasury();

    event CustodyFeeUpdated(uint256 previousBps, uint256 newBps);
    event CustodyTreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event CustodyFeeExemptionChanged(address indexed account, bool exempt);
    event CycleStarted(uint256 indexed cycle, uint256 timestamp);
    event CustodyFeeCollected(address indexed holder, uint256 fee, uint256 indexed cycle);

    function __ERC20CustodyFee_init(uint256 initialFeeBps, address treasury_) internal onlyInitializing {
        if (initialFeeBps > MAX_CUSTODY_FEE_BPS) {
            revert CustodyFeeExceedsMaximum(initialFeeBps, MAX_CUSTODY_FEE_BPS);
        }
        if (treasury_ == address(0)) {
            revert InvalidCustodyTreasury();
        }

        CustodyFeeStorage storage $ = _getCustodyFeeStorage();
        $.custodyFeeBps = uint16(initialFeeBps);
        $.custodyTreasury = treasury_;
        $.currentCycle = 1;

        // Emit the initial config so the event log is self-contained for
        // off-chain monitoring (previous value is 0 / address(0) at init).
        emit CustodyFeeUpdated(0, initialFeeBps);
        emit CustodyTreasuryUpdated(address(0), treasury_);
        emit CycleStarted(1, block.timestamp);
    }

    function __ERC20CustodyFee_init_unchained() internal onlyInitializing {}

    /**
     * @notice Current custody fee in basis points (0 = disabled)
     */
    function custodyFeeBps() public view returns (uint256) {
        return _getCustodyFeeStorage().custodyFeeBps;
    }

    /**
     * @notice Address that receives the custody fees
     */
    function custodyTreasury() public view returns (address) {
        return _getCustodyFeeStorage().custodyTreasury;
    }

    /**
     * @notice Current custody cycle (starts at 1, incremented by startNewCycle)
     */
    function currentCycle() public view returns (uint256) {
        return _getCustodyFeeStorage().currentCycle;
    }

    /**
     * @notice Last cycle in which a holder was swept (0 = never)
     * @param holder The address to check
     */
    function lastSweptCycle(address holder) public view returns (uint256) {
        return _getCustodyFeeStorage().lastSweptCycle[holder];
    }

    /**
     * @notice Check if an account is exempt from the custody fee
     * @param account The address to check
     */
    function isCustodyFeeExempt(address account) public view returns (bool) {
        return _getCustodyFeeStorage().exempt.contains(account);
    }

    /**
     * @notice Full list of custody-fee-exempt accounts
     * @dev Unbounded: intended for off-chain use only. For on-chain/paginated
     * access use getCustodyFeeExemptCount + getCustodyFeeExemptAt.
     */
    function getCustodyFeeExemptList() public view returns (address[] memory) {
        return _getCustodyFeeStorage().exempt.values();
    }

    /**
     * @notice Number of custody-fee-exempt accounts (O(1), avoids downloading
     * the unbounded getCustodyFeeExemptList just to learn the size)
     */
    function getCustodyFeeExemptCount() external view returns (uint256) {
        return _getCustodyFeeStorage().exempt.length();
    }

    /**
     * @notice Set the custody fee in basis points (0 to disable, max 200)
     */
    function setCustodyFeeBps(uint256 newBps) public onlyRole(FEE_ADMIN_ROLE) {
        if (newBps > MAX_CUSTODY_FEE_BPS) {
            revert CustodyFeeExceedsMaximum(newBps, MAX_CUSTODY_FEE_BPS);
        }

        CustodyFeeStorage storage $ = _getCustodyFeeStorage();
        uint256 previousBps = $.custodyFeeBps;
        $.custodyFeeBps = uint16(newBps);
        emit CustodyFeeUpdated(previousBps, newBps);
    }

    /**
     * @notice Set the custody treasury address (cannot be the zero address)
     */
    function setCustodyTreasury(address newTreasury) public onlyRole(FEE_ADMIN_ROLE) {
        if (newTreasury == address(0)) {
            revert InvalidCustodyTreasury();
        }

        CustodyFeeStorage storage $ = _getCustodyFeeStorage();
        address previousTreasury = $.custodyTreasury;
        $.custodyTreasury = newTreasury;
        emit CustodyTreasuryUpdated(previousTreasury, newTreasury);
    }

    /**
     * @notice Add an account to the custody fee exemption list (idempotent)
     */
    function addCustodyFeeExempt(address account) public onlyRole(FEE_ADMIN_ROLE) {
        if (_getCustodyFeeStorage().exempt.add(account)) {
            emit CustodyFeeExemptionChanged(account, true);
        }
    }

    /**
     * @notice Remove an account from the custody fee exemption list (idempotent)
     */
    function removeCustodyFeeExempt(address account) public onlyRole(FEE_ADMIN_ROLE) {
        if (_getCustodyFeeStorage().exempt.remove(account)) {
            emit CustodyFeeExemptionChanged(account, false);
        }
    }

    /**
     * @notice Open a new custody cycle
     */
    function startNewCycle() public onlyRole(SWEEPER_ROLE) {
        CustodyFeeStorage storage $ = _getCustodyFeeStorage();
        uint256 newCycle = ++$.currentCycle;
        emit CycleStarted(newCycle, block.timestamp);
    }

    /**
     * @notice Sweep the custody fee from a batch of holders for the current cycle
     * @dev Never reverts for an individual holder: non-eligible holders are
     * skipped so overlapping or repeated batches are safe. Collection bypasses
     * pause, transfer fee, blocklist and freeze (see `_collectCustodyFee` in the
     * main contract).
     * @param holders The holders to sweep (enumerated off-chain)
     */
    function sweepCustodyFee(address[] calldata holders) public onlyRole(SWEEPER_ROLE) {
        CustodyFeeStorage storage $ = _getCustodyFeeStorage();
        uint256 cycle = $.currentCycle;
        uint256 bps = $.custodyFeeBps;
        address treasury = $.custodyTreasury;

        for (uint256 i = 0; i < holders.length;) {
            address holder = holders[i];

            // i < holders.length so ++i can never overflow
            unchecked {
                ++i;
            }

            if (holder == address(0) || holder == treasury) continue;
            if ($.lastSweptCycle[holder] == cycle) continue;
            if ($.exempt.contains(holder)) continue;

            $.lastSweptCycle[holder] = cycle;

            // Fee computed on the balance at execution time: can never exceed it
            uint256 fee = (balanceOf(holder) * bps) / 10000;
            if (fee > 0) {
                _collectCustodyFee(holder, treasury, fee);
                emit CustodyFeeCollected(holder, fee, cycle);
            }
        }
    }

    function _getCustodyFeeStorage() private pure returns (CustodyFeeStorage storage $) {
        assembly {
            $.slot := CUSTODY_FEE_STORAGE_LOCATION
        }
    }

    // Virtual functions implemented by the main contract
    function balanceOf(address account) public view virtual returns (uint256);

    /**
     * @dev Move `amount` from `from` to `to` bypassing pause, transfer fee,
     * blocklist and freeze. MUST only be reachable from `sweepCustodyFee`.
     */
    function _collectCustodyFee(address from, address to, uint256 amount) internal virtual;
}
