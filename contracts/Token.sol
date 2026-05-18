// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "./extensions/ERC20FreezableUpgradeable.sol";
import "./extensions/ERC20RestrictedUpgradeable.sol";
import "./extensions/ERC20FeeUpgradeable.sol";
import "./extensions/ERC20EIP3009Upgradeable.sol";
import "./extensions/ERC20_1363Upgradeable.sol";
import "./extensions/ERC20RecoverableUpgradeable.sol";

/**
 * @title IGE Token (IGT)
 * @dev Advanced ERC-20 token with UUPS upgradeability, access control, pause, freeze, block, fee, EIP-2612, EIP-3009, ERC-1363, recovery, and comprehensive monitoring
 */
contract Token is
    Initializable,
    ERC20Upgradeable,
    ERC20PermitUpgradeable,
    ERC20PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    ERC20FreezableUpgradeable,
    ERC20RestrictedUpgradeable,
    ERC20FeeUpgradeable,
    ERC20EIP3009Upgradeable,
    ERC20_1363Upgradeable,
    ERC20RecoverableUpgradeable
{
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    // ========================================
    // 🔧 MONITORING EVENTS
    // ========================================
    
    /**
     * @dev Emitted when an operation is logged (consolidated start/complete)
     */
    event OperationLogged(
        bytes32 indexed operationId,
        string operationType,
        address indexed executor,
        bool success,
        bytes data,
        bytes result,
        uint256 timestamp
    );
    
    /**
     * @dev Emitted for detailed debugging of fee operations
     */
    event FeeOperationDebug(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 feeAmount,
        address indexed collector,
        uint256 netValue,
        uint256 timestamp
    );
    
    /**
     * @dev Emitted for detailed debugging of mint operations
     */
    event MintOperationDebug(
        address indexed to,
        uint256 amount,
        address indexed executor,
        uint256 totalSupplyBefore,
        uint256 totalSupplyAfter,
        uint256 timestamp
    );
    
    /**
     * @dev Emitted for detailed debugging of burn operations
     */
    event BurnOperationDebug(
        address indexed from,
        uint256 amount,
        address indexed executor,
        uint256 totalSupplyBefore,
        uint256 totalSupplyAfter,
        uint256 balanceBefore,
        uint256 balanceAfter,
        uint256 timestamp
    );
    
    /**
     * @dev Emitted for detailed debugging of freeze operations
     */
    event FreezeOperationDebug(
        address indexed account,
        uint256 amount,
        address indexed executor,
        uint256 frozenBefore,
        uint256 frozenAfter,
        uint256 timestamp
    );
    
    /**
     * @dev Emitted for detailed debugging of block operations
     */
    event BlockOperationDebug(
        address indexed account,
        bool blocked,
        address indexed executor,
        uint256 timestamp
    );
    
    /**
     * @dev Emitted for detailed debugging of pause operations
     */
    event PauseOperationDebug(
        bool paused,
        address indexed executor,
        uint256 timestamp
    );
    
    /**
     * @dev Emitted for role changes debugging
     */
    event RoleOperationDebug(
        bytes32 indexed role,
        address indexed account,
        bool granted,
        address indexed executor,
        uint256 timestamp
    );
    
    /**
     * @dev Emitted for system health checks
     */
    event HealthCheck(
        uint256 timestamp,
        uint256 totalSupply,
        bool isPaused,
        uint256 currentFee,
        address indexed checker
    );
    
    /**
     * @dev Emitted for error tracking
     */
    event ErrorReport(
        bytes32 indexed errorId,
        string errorType,
        address indexed executor,
        string message,
        bytes data,
        uint256 timestamp
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the token
     * @param name_ Token name
     * @param symbol_ Token symbol
     * @param initialSupply_ Initial supply to mint
     * @param initialHolder_ Address to receive initial supply
     * @param initialFee_ Initial transaction fee in basis points
     * @param feeCollector_ Address to collect transaction fees
     * @param defaultAdmin_ Address to receive DEFAULT_ADMIN_ROLE
     */
    function initialize(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply_,
        address initialHolder_,
        uint256 initialFee_,
        address feeCollector_,
        address defaultAdmin_
    ) public initializer {
        __ERC20_init(name_, symbol_);
        __ERC20Permit_init(name_);
        __ERC20Pausable_init();
        __AccessControl_init();
        __ERC20Freezable_init();
        __ERC20Restricted_init();
        __ERC20Fee_init(initialFee_, feeCollector_);
        __ERC20EIP3009_init();
        __ERC20_1363_init();
        __ERC20Recoverable_init();

        // Grant initial roles
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin_);
        _grantRole(UPGRADER_ROLE, defaultAdmin_);
        _grantRole(FEE_ADMIN_ROLE, defaultAdmin_);
        _grantRole(RECOVERER_ROLE, defaultAdmin_);
        
        // Mint initial supply to the initial holder
        if (initialSupply_ > 0 && initialHolder_ != address(0)) {
            _mint(initialHolder_, initialSupply_);
        }
    }

    /**
     * @notice Mint new tokens
     * @param to Address to mint tokens to
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        uint256 totalSupplyBefore = totalSupply();
        
        ERC20Upgradeable._mint(to, amount);
        
        uint256 totalSupplyAfter = totalSupply();
        
        emit MintOperationDebug(
            to,
            amount,
            msg.sender,
            totalSupplyBefore,
            totalSupplyAfter,
            _blockTimestamp()
        );
        
        _emitOperation("MINT", msg.sender, abi.encode(to, amount), true, abi.encode(totalSupplyAfter));
    }

    /**
     * @notice Burn tokens from an address
     * @param from Address to burn tokens from
     * @param amount Amount to burn
     */
    function burn(address from, uint256 amount) public onlyRole(BURNER_ROLE) {
        uint256 totalSupplyBefore = totalSupply();
        uint256 balanceBefore = balanceOf(from);
        
        ERC20Upgradeable._burn(from, amount);
        
        uint256 totalSupplyAfter = totalSupply();
        uint256 balanceAfter = balanceOf(from);
        
        emit BurnOperationDebug(
            from,
            amount,
            msg.sender,
            totalSupplyBefore,
            totalSupplyAfter,
            balanceBefore,
            balanceAfter,
            _blockTimestamp()
        );
        
        _emitOperation("BURN", msg.sender, abi.encode(from, amount), true, abi.encode(totalSupplyAfter));
    }

    /**
     * @notice Pause all transfers
     */
    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
        emit PauseOperationDebug(true, msg.sender, _blockTimestamp());
        _emitOperation("PAUSE", msg.sender, abi.encode(true), true, abi.encode(true));
    }

    /**
     * @notice Unpause all transfers
     */
    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
        emit PauseOperationDebug(false, msg.sender, _blockTimestamp());
        _emitOperation("UNPAUSE", msg.sender, abi.encode(false), true, abi.encode(false));
    }

    /**
     * @notice Freeze all tokens for an address (prevent transfers)
     * @param account Address to freeze
     */
    function freeze(address account) public onlyRole(FREEZER_ROLE) {
        uint256 frozenBefore = frozenOf(account);
        
        freezeAll(account);
        uint256 frozenAfter = frozenOf(account);
        
        emit FreezeOperationDebug(
            account,
            frozenAfter - frozenBefore,
            msg.sender,
            frozenBefore,
            frozenAfter,
            _blockTimestamp()
        );
        
        _emitOperation("FREEZE", msg.sender, abi.encode(account), true, abi.encode(frozenAfter));
    }

    
    /**
     * @notice Block an address (prevent transfers)
     * @param account Address to block
     */
    function blockAddress(address account) public onlyRole(BLOCKER_ROLE) {
        blockUser(account);
        emit BlockOperationDebug(account, true, msg.sender, _blockTimestamp());
        _emitOperation("BLOCK", msg.sender, abi.encode(account, true), true, abi.encode(true));
    }

    /**
     * @notice Unblock an address (allow transfers)
     * @param account Address to unblock
     */
    function unblock(address account) public onlyRole(BLOCKER_ROLE) {
        resetUser(account);
        emit BlockOperationDebug(account, false, msg.sender, _blockTimestamp());
        _emitOperation("UNBLOCK", msg.sender, abi.encode(account, false), true, abi.encode(false));
    }

    /**
     * @notice Freeze a specific amount of tokens for an account
     * @param account Address to freeze
     * @param amount Amount to freeze (type(uint256).max for "frozen all")
     */
    function freeze(address account, uint256 amount) public override onlyRole(FREEZER_ROLE) {
        ERC20FreezableUpgradeable.freeze(account, amount);
    }

    /**
     * @notice Freeze all tokens for an account
     * @param account Address to freeze
     */
    function freezeAll(address account) public override onlyRole(FREEZER_ROLE) {
        ERC20FreezableUpgradeable.freezeAll(account);
    }

    /**
     * @notice Check if an address is frozen
     * @param account Address to check
     * @return true if frozen
     */
    function isFrozen(address account) public view returns (bool) {
        return frozenOf(account) > 0;
    }

    /**
     * @dev Centralized security checks (BLOCK + FREEZE)
     * Skips checks for mint/burn (from or to == address(0))
     */
    function _runSecurityChecks(address from, address to) private view {
        if (from == address(0) || to == address(0)) return;
        if (isBlocked(from) || isBlocked(to)) revert AccountBlocked();
        if (isFrozen(from) || isFrozen(to)) revert AccountFrozen();
    }

    /**
     * @dev Override _update to implement canonical order of checks
     * Order: PAUSE -> BLOCK -> FREEZE -> FEE -> SETTLEMENT
     */
    function _update(address from, address to, uint256 value) internal override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        // 1. PAUSE check (from ERC20PausableUpgradeable via super._update)
        
        // 2 + 3. BLOCK + FREEZE checks
        _runSecurityChecks(from, to);
        
        // 4. FEE check (only for transfers, not mint/burn)
        if (from != address(0) && to != address(0)) {
            uint256 feeAmount = _calculateFee(from, to, value);
            
            if (feeAmount > 0) {
                address collector = feeCollector();
                uint256 netValue = value - feeAmount;
                
                // Emit fee operation debug event
                emit FeeOperationDebug(
                    from,
                    to,
                    value,
                    feeAmount,
                    collector,
                    netValue,
                    _blockTimestamp()
                );
                
                // Perform the transfer with fee deduction
                super._update(from, to, netValue);
                
                // Transfer fee to collector (only if collector is not the sender)
                // If collector is the sender, fee is already in sender's balance
                if (collector != from) {
                    super._update(from, collector, feeAmount);
                }
                // If collector == from, fee stays with sender (no additional transfer needed)
            } else {
                // No fee, normal transfer
                super._update(from, to, value);
            }
        } else {
            // Mint or burn - no fees, no checks
            super._update(from, to, value);
        }
    }

    /**
     * @dev Authorize upgrade (UUPS)
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    /**
     * @dev Version with consolidated operations and refactored security checks
     */
    function version() public pure returns (string memory) {
        return "1.7.0-refactor";
    }

    // ========================================
    // 🔧 MONITORING & HEALTH CHECK FUNCTIONS
    // ========================================

    /**
     * @dev Get current block timestamp
     */
    function _blockTimestamp() internal view returns (uint256) {
        return block.timestamp;
    }

    /**
     * @dev Generate unique operation ID for tracking
     */
    function _generateOperationId(string memory operationType, address executor) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(operationType, executor, _blockTimestamp(), block.number));
    }

    /**
     * @dev Emit operation log event (consolidated)
     */
    function _emitOperation(
        string memory operationType,
        address executor,
        bytes memory data,
        bool success,
        bytes memory result
    ) internal returns (bytes32) {
        bytes32 operationId = _generateOperationId(operationType, executor);
        emit OperationLogged(operationId, operationType, executor, success, data, result, _blockTimestamp());
        return operationId;
    }

    /**
     * @dev Emit error report for debugging
     */
    function _emitError(string memory errorType, address executor, string memory message, bytes memory data) internal {
        bytes32 errorId = keccak256(abi.encodePacked(errorType, executor, _blockTimestamp(), message));
        emit ErrorReport(errorId, errorType, executor, message, data, _blockTimestamp());
    }

    /**
     * @notice Comprehensive health check function
     * @return success Whether the health check passed
     * @return totalSupply Current total supply
     * @return isPaused Current pause status
     * @return currentFee Current fee in basis points
     */
    function healthCheck() public view returns (
        bool success,
        uint256 totalSupply,
        bool isPaused,
        uint256 currentFee
    ) {
        // In view functions we can't use try/catch, so we assume success
        // unless there are obvious issues
        totalSupply = this.totalSupply();
        isPaused = this.paused();
        currentFee = this.fee();

        success = true;
    }

    /**
     * @notice Emit health check event
     */
    function emitHealthCheck() public {
        (, uint256 totalSupply, bool isPaused, uint256 currentFee) = healthCheck();

        emit HealthCheck(
            _blockTimestamp(),
            totalSupply,
            isPaused,
            currentFee,
            msg.sender
        );
    }

    /**
     * @notice Get detailed system status for monitoring
     */
    function getSystemStatus() public view returns (
        string memory contractVersion,
        uint256 _totalSupply,
        bool _paused,
        uint256 _fee,
        address feeCollectorAddr,
        uint256 _blockNumber,
        uint256 _timestamp
    ) {
        return (
            version(),
            totalSupply(),
            paused(),
            fee(),
            feeCollector(),
            block.number,
            _blockTimestamp()
        );
    }

    /**
     * @notice Debug function to check if an address has admin role
     */
    function isAdmin(address account) public view returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, account);
    }

    /**
     * @notice Debug function to check all critical roles of an address
     */
    function debugRoles(address account) public view returns (
        bool admin,
        bool minter,
        bool burner
    ) {
        return (
            hasRole(DEFAULT_ADMIN_ROLE, account),
            hasRole(MINTER_ROLE, account),
            hasRole(BURNER_ROLE, account)
        );
    }

    /**
     * @dev Implement _emitTransfer for fee module
     */
    function _emitTransfer(address from, address to, uint256 value) internal override {
        emit Transfer(from, to, value);
    }

    /**
     * @dev Update without fee but WITH security checks (PAUSE/BLOCK/FREEZE)
     * Used by EIP-3009 and ERC-1363 to bypass fees but not security
     */
    function _updateWithoutFee(address from, address to, uint256 value) internal {
        _runSecurityChecks(from, to);
        super._update(from, to, value);
    }

    /**
     * @dev Implement _executeTransfer for EIP-3009 module (no fees)
     * Uses _updateWithoutFee to bypass fee logic but keep security checks
     */
    function _executeTransfer(address from, address to, uint256 value) internal override {
        _updateWithoutFee(from, to, value);
    }

    /**
     * @dev Implement _transfer1363 for ERC-1363 module (no fees)
     * Uses _updateWithoutFee to bypass fee logic but keep security checks
     */
    function _transfer1363(address from, address to, uint256 value) internal override {
        _updateWithoutFee(from, to, value);
    }

    /**
     * @dev Implement _spendAllowance for ERC-1363 module
     */
    function _spendAllowance(address owner, address spender, uint256 value) internal override(ERC20Upgradeable, ERC20_1363Upgradeable) {
        uint256 current = allowance(owner, spender);
        if (current < value) {
            revert ERC20InsufficientAllowance(spender, current, value);
        }
        _approve(owner, spender, current - value);
    }


    /**
     * @dev Implement balanceOf for ERC20FreezableUpgradeable module
     */
    function balanceOf(address account) public view override(ERC20Upgradeable, ERC20FreezableUpgradeable) returns (uint256) {
        return super.balanceOf(account);
    }

    /**
     * @dev Implement _approve1363 for ERC-1363 module
     */
    function _approve1363(address owner, address spender, uint256 value) internal override {
        _approve(owner, spender, value);
    }

    /**
     * @dev Implement supportsInterface for ERC20_1363 and AccessControl
     */
    function supportsInterface(bytes4 interfaceId) public view override(AccessControlUpgradeable, ERC20_1363Upgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
