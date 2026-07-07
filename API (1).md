# IGT Token API Documentation

## Contract Addresses

### Amoy Testnet
- **Proxy:** `0x0A06Bad41D08c4634a05a45b8709A32552B1A0ab`
- **Implementation:** `0xaf5c904Aab2dd9A30BF5a76b9913cBafdF218BFf`

## Core Functions

### Token Information
```solidity
function name() public view returns (string memory)
function symbol() public view returns (string memory)
function decimals() public view returns (uint8)
function totalSupply() public view returns (uint256)
function balanceOf(address account) public view returns (uint256)
function version() public pure returns (string memory)
```

### Transfers
```solidity
function transfer(address to, uint256 value) public returns (bool)
function transferFrom(address from, address to, uint256 value) public returns (bool)
function approve(address spender, uint256 value) public returns (bool)
function allowance(address owner, address spender) public view returns (uint256)
```

### Minting & Burning
```solidity
function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE)
function burn(address from, uint256 amount) public onlyRole(BURNER_ROLE)
```

### Pause
```solidity
function pause() public onlyRole(PAUSER_ROLE)
function unpause() public onlyRole(PAUSER_ROLE)
function paused() public view returns (bool)
```

### Freeze
```solidity
function freeze(address account, uint256 amount) public onlyRole(FREEZER_ROLE)
function unfreeze(address account) public onlyRole(FREEZER_ROLE)
function frozenOf(address account) public view returns (uint256)
function isFrozen(address account) public view returns (bool)
```

### Block
```solidity
function blockAddress(address account) public onlyRole(BLOCKER_ROLE)
function unblock(address account) public onlyRole(BLOCKER_ROLE)
function isBlocked(address account) public view returns (bool)
```

### Fee System
```solidity
function fee() public view returns (uint256)
function feeCollector() public view returns (address)
function setFee(uint256 newFee) public onlyRole(FEE_ADMIN_ROLE)
function setFeeCollector(address newCollector) public onlyRole(FEE_ADMIN_ROLE)
function addFeeFreeAccount(address account) public onlyRole(FEE_ADMIN_ROLE)
function removeFeeFreeAccount(address account) public onlyRole(FEE_ADMIN_ROLE)
function isFeeFree(address account) public view returns (bool)
```

### Role Management
```solidity
function hasRole(bytes32 role, address account) public view returns (bool)
function grantRole(bytes32 role, address account) public onlyRole(DEFAULT_ADMIN_ROLE)
function revokeRole(bytes32 role, address account) public onlyRole(DEFAULT_ADMIN_ROLE)
function renounceRole(bytes32 role, address account) public
```

### Monitoring
```solidity
function healthCheck() public view returns (bool, uint256, uint256, bool, uint256, address)
function getSystemStatus() public view returns (string memory, uint256, bool, uint256, address, uint256)
function debugRoles(address account) public view returns (bool, bool, bool)
function isAdmin(address account) public view returns (bool)
function emitHealthCheck() public returns (uint256)
```

### EIP-3009 (Transfer With Authorization)
```solidity
function transferWithAuthorization(
  address from, address to, uint256 value,
  uint256 validAfter, uint256 validBefore, bytes32 nonce,
  uint8 v, bytes32 r, bytes32 s
) public

function receiveWithAuthorization(
  address from, address to, uint256 value,
  uint256 validAfter, uint256 validBefore, bytes32 nonce,
  uint8 v, bytes32 r, bytes32 s
) public

function authorizationState(address authorizer, bytes32 nonce) public view returns (bool)
```

### Permit (EIP-2612)
```solidity
function permit(
  address owner, address spender, uint256 value,
  uint256 deadline, uint8 v, bytes32 r, bytes32 s
) public

function nonces(address owner) public view returns (uint256)
function DOMAIN_SEPARATOR() external view returns (bytes32)
```

## Events

### ERC-20 Standard
```solidity
event Transfer(address indexed from, address indexed to, uint256 value)
event Approval(address indexed owner, address indexed spender, uint256 value)
```

### Monitoring Events
```solidity
event MintOperationDebug(address indexed to, uint256 amount, address indexed executor, uint256 totalSupplyBefore, uint256 totalSupplyAfter, uint256 timestamp)
event BurnOperationDebug(address indexed from, uint256 amount, address indexed executor, uint256 totalSupplyBefore, uint256 totalSupplyAfter, uint256 timestamp)
event FeeOperationDebug(address indexed from, address indexed to, uint256 amount, uint256 feeAmount, address feeCollector, uint256 netValue, uint256 timestamp)
event FreezeOperationDebug(address indexed account, uint256 frozenAmount, address indexed executor, uint256 timestamp)
event BlockOperationDebug(address indexed account, bool blocked, uint256 timestamp)
event PauseOperationDebug(bool paused, address indexed executor, uint256 timestamp)
event HealthCheck(uint256 indexed checkId, uint256 totalSupply, uint256 activeUsers, bool isPaused, uint256 currentFee, address feeCollector, uint256 timestamp)
```

### State Change Events (v1.6.3+)
```solidity
// Freeze events
event Frozen(address indexed account)
event Unfrozen(address indexed account)
event FrozenAmountChanged(address indexed account, uint256 previousAmount, uint256 newAmount)

// Fee admin events
event FeeUpdated(uint256 previousFee, uint256 newFee)
event FeeCollectorUpdated(address indexed previousCollector, address indexed newCollector)
event FeeFreeStatusChanged(address indexed account, bool isFeeFree)

// EIP-3009 events
event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)
event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce)
```

### Role Events
```solidity
event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)
event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)
event RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole)
```

## Role Hashes

```javascript
const ROLES = {
  DEFAULT_ADMIN_ROLE: "0x0000000000000000000000000000000000000000000000000000000000000000",
  UPGRADER_ROLE: keccak256("UPGRADER_ROLE"),
  MINTER_ROLE: keccak256("MINTER_ROLE"),
  BURNER_ROLE: keccak256("BURNER_ROLE"),
  PAUSER_ROLE: keccak256("PAUSER_ROLE"),
  FREEZER_ROLE: keccak256("FREEZER_ROLE"),
  BLOCKER_ROLE: keccak256("BLOCKER_ROLE"),
  FEE_ADMIN_ROLE: keccak256("FEE_ADMIN_ROLE"),
  RECOVERER_ROLE: keccak256("RECOVERER_ROLE"),
}
```

## ABI Files

Available in `abi/` directory:
- `Token.json` - Main token ABI
- `TokenV2.json` - V2 extended ABI
- `ERC1967Proxy.json` - Proxy ABI

## Usage Example

```typescript
import { ethers } from "ethers";
import TokenABI from "./abi/Token.json";

const provider = new ethers.JsonRpcProvider("https://rpc-amoy.polygon.technology");
const token = new ethers.Contract(
  "0x0A06Bad41D08c4634a05a45b8709A32552B1A0ab",
  TokenABI.abi,
  provider
);

// Read balance
const balance = await token.balanceOf("0x...");
console.log(ethers.formatEther(balance));

// Check if address is blocked
const blocked = await token.isBlocked("0x...");
console.log("Blocked:", blocked);
```
