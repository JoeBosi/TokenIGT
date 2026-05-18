# Monitoring System Documentation

## Overview

The IGT Token includes a comprehensive monitoring system designed for operational debugging and observability. This system provides detailed event tracking, health checks, and debug information for all critical operations.

**Version:** `1.6.2-monitoring-enabled`

## Architecture

### Event Types

The monitoring system emits three categories of events:

1. **Operation Lifecycle Events** - Track start and completion of operations
2. **Debug Detail Events** - Provide granular operation data
3. **System Health Events** - Monitor contract state

### Event Structure

```solidity
// Operation tracking
event OperationStarted(bytes32 indexed operationId, string operationType, address executor, uint256 timestamp);
event OperationCompleted(bytes32 indexed operationId, string operationType, address executor, bool success, uint256 timestamp);

// Debug events for specific operations
event MintOperationDebug(address indexed to, uint256 amount, address indexed executor, uint256 totalSupplyBefore, uint256 totalSupplyAfter, uint256 timestamp);
event BurnOperationDebug(address indexed from, uint256 amount, address indexed executor, uint256 totalSupplyBefore, uint256 totalSupplyAfter, uint256 timestamp);
event FeeOperationDebug(address indexed from, address indexed to, uint256 amount, uint256 feeAmount, address feeCollector, uint256 netValue, uint256 timestamp);
event FreezeOperationDebug(address indexed account, uint256 frozenAmount, address indexed executor, uint256 timestamp);
event BlockOperationDebug(address indexed account, bool blocked, uint256 timestamp);
event PauseOperationDebug(bool paused, address indexed executor, uint256 timestamp);
event RoleOperationDebug(bytes32 indexed role, address indexed account, bool granted, address indexed executor, uint256 timestamp);

// Health check
event HealthCheck(uint256 indexed checkId, uint256 totalSupply, uint256 activeUsers, bool isPaused, uint256 currentFee, address feeCollector, uint256 timestamp);

// Error reporting
event ErrorReport(bytes32 indexed operationId, string operationType, address executor, string errorMessage, uint256 timestamp);
```

## Usage

### Reading Events

#### JavaScript/TypeScript Example
```typescript
// Get MintOperationDebug events
const filter = token.filters.MintOperationDebug();
const events = await token.queryFilter(filter, fromBlock, toBlock);

events.forEach(event => {
  console.log(`Mint to: ${event.args.to}`);
  console.log(`Amount: ${ethers.formatEther(event.args.amount)}`);
  console.log(`Supply before: ${ethers.formatEther(event.args.totalSupplyBefore)}`);
  console.log(`Supply after: ${ethers.formatEther(event.args.totalSupplyAfter)}`);
});
```

### Health Check Functions

#### `healthCheck()`
Returns comprehensive system status:
```solidity
function healthCheck() public view returns (
  bool success,
  uint256 totalSupply,
  uint256 activeUsers,
  bool isPaused,
  uint256 currentFee,
  address feeCollector
)
```

#### `getSystemStatus()`
Returns detailed system information:
```solidity
function getSystemStatus() public view returns (
  string memory contractVersion,
  uint256 _totalSupply,
  bool _paused,
  uint256 _fee,
  address _feeCollector,
  uint256 timestamp
)
```

#### `debugRoles(address account)`
Returns role status for an account:
```solidity
function debugRoles(address account) public view returns (
  bool admin,
  bool minter,
  bool burner
)
```

#### `isAdmin(address account)`
Quick check for admin role:
```solidity
function isAdmin(address account) public view returns (bool)
```

#### `emitHealthCheck()`
Emits a HealthCheck event (for external monitoring):
```solidity
function emitHealthCheck() public returns (uint256 checkId)
```

### Monitoring Scripts

#### Comprehensive Test with Monitoring
```bash
npx hardhat run scripts/test/test_amoy_fresh_comprehensive.ts --network amoy
```

This script:
- Tests all core functions
- Verifies event emissions
- Validates state changes
- Reports health status

#### Debug Freeze/Block/Pause
```bash
npx hardhat run scripts/debug/debug_freeze_block_pause.ts --network amoy
```

## Event Signatures

For filtering and decoding:

```javascript
// Event topic hashes (keccak256)
const eventSignatures = {
  OperationStarted: "0x...", // bytes32
  OperationCompleted: "0x...",
  MintOperationDebug: token.interface.getEvent("MintOperationDebug").topicHash,
  BurnOperationDebug: token.interface.getEvent("BurnOperationDebug").topicHash,
  FeeOperationDebug: token.interface.getEvent("FeeOperationDebug").topicHash,
  FreezeOperationDebug: token.interface.getEvent("FreezeOperationDebug").topicHash,
  BlockOperationDebug: token.interface.getEvent("BlockOperationDebug").topicHash,
  PauseOperationDebug: token.interface.getEvent("PauseOperationDebug").topicHash,
  RoleOperationDebug: token.interface.getEvent("RoleOperationDebug").topicHash,
  HealthCheck: token.interface.getEvent("HealthCheck").topicHash,
  ErrorReport: token.interface.getEvent("ErrorReport").topicHash,
};
```

## Integration Examples

### WebSocket Real-time Monitoring
```javascript
const provider = new ethers.WebSocketProvider("wss://...");
const token = new ethers.Contract(address, abi, provider);

// Listen for all mints
token.on("MintOperationDebug", (to, amount, executor, supplyBefore, supplyAfter, timestamp, event) => {
  console.log(`New mint: ${amount} tokens to ${to}`);
});

// Listen for health checks
token.on("HealthCheck", (checkId, totalSupply, activeUsers, isPaused, currentFee, feeCollector, timestamp) => {
  console.log(`Health check #${checkId}: Supply=${totalSupply}, Paused=${isPaused}`);
});
```

### Backend Analytics
```javascript
// Aggregate fee data
const feeEvents = await token.queryFilter(
  token.filters.FeeOperationDebug(), 
  lastBlock - 10000, 
  'latest'
);

const totalFees = feeEvents.reduce((sum, e) => sum + e.args.feeAmount, 0n);
console.log(`Total fees in last 10k blocks: ${ethers.formatEther(totalFees)}`);
```

### Grafana/Prometheus Integration
```javascript
// Export metrics
const health = await token.healthCheck();
metrics.gauge('token_total_supply', health.totalSupply);
metrics.gauge('token_active_users', health.activeUsers);
metrics.gauge('token_fee_basis_points', health.currentFee);
metrics.gauge('token_paused', health.isPaused ? 1 : 0);
```

## Best Practices

### For Operators
1. **Regular Health Checks**: Call `emitHealthCheck()` periodically
2. **Event Monitoring**: Subscribe to `ErrorReport` for immediate alerts
3. **Supply Tracking**: Monitor `MintOperationDebug` and `BurnOperationDebug` for supply changes
4. **Fee Analysis**: Track `FeeOperationDebug` to verify fee collection

### For Developers
1. **Operation IDs**: Use `_generateOperationId()` for correlation
2. **Event Decoding**: Use the contract interface for reliable decoding
3. **Gas Optimization**: Events are the most gas-efficient way to log data
4. **Testing**: Always verify event emissions in tests

## Troubleshooting

### Events Not Found
- Verify contract address and ABI
- Check block range (events are only available from contract deployment block)
- Ensure correct network connection

### Health Check Failures
- Check role assignments with `debugRoles()`
- Verify fee collector address is valid
- Confirm contract is not paused unexpectedly

### Debug Role Issues
```bash
# Check if account has specific role
npx hardhat console --network amoy
> const token = await ethers.getContractAt("Token", "0x0A06Bad41D08c4634a05a45b8709A32552B1A0ab");
> const role = await token.MINTER_ROLE();
> await token.hasRole(role, "0xYourAddress");
```
