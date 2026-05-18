# IGE Token (IGT)

Advanced ERC-20 token with UUPS upgradeability, role-based access control, comprehensive monitoring, and multiple extensions.

**Author:** Giuseppe Bosi  
**Property of:** IGE Gold S.p.A.

[![Solidity Version](https://img.shields.io/badge/solidity-0.8.28-blue)](https://soliditylang.org/)
[![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-5.6.1-green)](https://openzeppelin.com/)
[![Hardhat](https://img.shields.io/badge/Hardhat-2.22.0-yellow)](https://hardhat.org/)

## 🚀 Active Deployment

### 📍 Amoy Testnet (Polygon)

| | |
|---|---|
| **Proxy Address** | `0x55F7DaBE49cc7947D6ac12014Af40305176581eB` |
| **Implementation** | `0xeD7741db36Cf22e9D339A48e767313f33EFAb360` |
| **Version** | `1.6.3-security-fixes` |
| **Network** | Amoy (Chain ID: 80002) |
| **Status** | ✅ Fully Operational (9/9 tests) |
| **Explorer** | [View on Amoy Polygonscan](https://amoy.polygonscan.com/address/0x55F7DaBE49cc7947D6ac12014Af40305176581eB) |

**Previous Deployment:** `0x0A06Bad41D08c4634a05a45b8709A32552B1A0ab` (v1.6.2-cleanup-final)

**Deployment Files:** `deployments/amoy-fresh/`
- `proxy.json` - Proxy configuration
- `implementation.json` - Implementation details  
- `roles.json` - Role assignments
- `test-results.json` - Test execution results

### Test Results
- **Local Tests:** 162/162 passing (100%)
- **Amoy Tests:** 9/9 passing (100%)
- **Upgrade Test:** V1 → V2 successful ✅
- **Security Fixes:** 9/9 completed ✅ 

## 📦 Contract ABI

### ABI Files Location
```
abi/
├── Token.json      # Main contract ABI (use this for dApps)
├── TokenV2.json    # V2 extended ABI
├── TokenV3.json    # V3 extended ABI
└── ERC1967Proxy.json # Proxy ABI
```

### Quick Import for Frontend
```typescript
import TokenABI from './abi/Token.json';
// or
import TokenABI from '../abi/Token.json';
// or copy the file to your project
```

### TypeChain Types (TypeScript)
```typescript
import { Token } from './typechain-types';
// Full TypeScript types for the contract
```

## Documentation

- [Deployment Details](./DEPLOYMENT.md) - Contract addresses and role assignments
- [API Reference](./API.md) - Function signatures and events
- [Monitoring Guide](./MONITORING.md) - Health checks and debug events
- [Changelog](./CHANGELOG.md) - Version history and fixes

## Features

- **ERC-20 Standard**: Full compliance with ERC-20, ERC-20 Permit (EIP-2612), ERC-20 Pausable
- **UUPS Upgradeability**: Proxy pattern with ERC-1822 for secure upgrades
- **Access Control**: 9 granular roles via OpenZeppelin AccessControl
- **Fee Mechanism**: Configurable transaction fee (max 9.99%) with whitelist
- **Freeze/Ban**: Address freezing and blocking for compliance
- **EIP-3009**: Transfer With Authorization for gasless transfers (no fees)
- **ERC-1363**: Payable Token with callback support (no fees)
- **Recovery**: Recover ERC20, ETH, ERC721 sent by mistake
- **EIP-712/EIP-5267**: Typed structured data hashing
- ** Monitoring System**: Comprehensive debug events and health checks
  - Mint/Burn/Fee/Freeze/Block/Pause operation events
  - Real-time health check functions
  - Role debug utilities

## Tech Stack

| Component | Version |
|-----------|---------|
| Solidity | ^0.8.28 |
| OpenZeppelin Contracts | 5.6.1 |
| OpenZeppelin Upgrades | ^3.9.1 |
| Hardhat | ^2.28.6 |
| Ethers.js | ^6.16.0 |
| Package Manager | pnpm |
| Proxy Pattern | UUPS (ERC-1822 + ERC-1967) |
| Storage Pattern | ERC-7201 Namespaced Storage |
| Test Framework | Mocha + Chai + TypeScript

## Installation

```bash
# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env

# Configure your environment variables in .env
```

## Environment Variables

See `.env.example` for all required variables:

```bash
# Network
PRIVATE_KEY=
POLYGONSCAN_API_KEY=
AMOY_RPC_URL=https://rpc-amoy.polygon.technology
POLYGON_RPC_URL=https://polygon-rpc.com

# Role Addresses (testnet)
DEFAULT_ADMIN_ADDRESS=
UPGRADER_ADDRESS=
MINTER_ADDRESS=
BURNER_ADDRESS=
PAUSER_ADDRESS=
FREEZER_ADDRESS=
BLOCKER_ADDRESS=
FEE_ADMIN_ADDRESS=
RECOVERER_ADDRESS=
FEE_COLLECTOR_ADDRESS=
INITIAL_HOLDER_ADDRESS=

# Token Configuration
TOKEN_NAME=IGE Token
TOKEN_SYMBOL=IGT
TOKEN_DECIMALS=18
INITIAL_SUPPLY=10000000000000000000000
TRANSACTION_FEE_BASIS_POINTS=10
```

## Roles

| Role | Description |
|------|-------------|
| `DEFAULT_ADMIN_ROLE` | Can grant/revoke all other roles |
| `UPGRADER_ROLE` | Can upgrade the contract implementation |
| `MINTER_ROLE` | Can mint new tokens |
| `BURNER_ROLE` | Can burn tokens from any address |
| `PAUSER_ROLE` | Can pause/unpause the contract |
| `FREEZER_ROLE` | Can freeze/unfreeze addresses |
| `BLOCKER_ROLE` | Can block/unblock addresses |
| `FEE_ADMIN_ROLE` | Can set fee and fee collector, manage fee-free whitelist |
| `RECOVERER_ROLE` | Can recover tokens from the contract |

## Deployment

### Local Network

```bash
npx hardhat run scripts/deploy/deploy_local.ts --network hardhat
```

### Amoy Testnet

```bash
npx hardhat run scripts/deploy/deploy_amoy.ts --network amoy
```

### Polygon Mainnet

```bash
npx hardhat run scripts/deploy/deploy_polygon.ts --network polygon
```

## Verification

After deployment, verify the contract on Polygonscan:

```bash
npx hardhat run scripts/deploy/verify.ts --network <network>
```

## Upgrade

### Local Network

```bash
npx hardhat run scripts/upgrade/upgrade_local.ts --network hardhat
```

### Amoy Testnet

```bash
npx hardhat run scripts/upgrade/upgrade_amoy.ts --network amoy
```

### Polygon Mainnet

```bash
npx hardhat run scripts/upgrade/upgrade_polygon.ts --network polygon
```

## Role Management

### Grant Roles

```bash
npx hardhat run scripts/roles/grant_roles.ts --network <network>
```

### Revoke Roles

```bash
npx hardhat run scripts/roles/revoke_roles.ts --network <network>
```

### List Role Members

```bash
npx hardhat run scripts/roles/list_roles.ts --network <network>
```

## Testing

Run all tests:

```bash
npx hardhat test
```

Run specific test suite:

```bash
npx hardhat test test/core/token.core.spec.ts
npx hardhat test test/features/token.fee.spec.ts
npx hardhat test test/upgrade/upgrade.forward.spec.ts
```

Run coverage:

```bash
npx hardhat coverage
```

## Contract Structure

```
contracts/
├── Token.sol                          # Main token contract (V1)
├── TokenV2.sol                        # V2 for forward upgrade tests
├── TokenV3.sol                        # V3 for compatibility upgrade tests
├── extensions/
│   ├── ERC20FreezableUpgradeable.sol  # Freeze functionality
│   ├── ERC20RestrictedUpgradeable.sol # Block functionality
│   ├── ERC20FeeUpgradeable.sol        # Fee mechanism
│   ├── ERC20EIP3009Upgradeable.sol    # EIP-3009 support
│   ├── ERC20_1363Upgradeable.sol      # ERC-1363 support
│   └── ERC20RecoverableUpgradeable.sol# Recovery functions
├── interfaces/
│   ├── IERC1363.sol
│   ├── IERC1363Receiver.sol
│   ├── IERC1363Spender.sol
│   └── IERC3009.sol
└── mocks/
    ├── MockERC1363Receiver.sol
    ├── MockERC1363Spender.sol
    ├── MockERC20.sol
    └── MockERC721.sol
```

## 📁 Project Structure & File Locations

### Essential Files for Development

| Category | Path | Description |
|----------|------|-------------|
| **Main Contract** | `contracts/Token.sol` | Core token implementation |
| **ABI (Frontend)** | `abi/Token.json` | JSON ABI for dApp integration |
| **ABI V2** | `abi/TokenV2.json` | Extended ABI with V2 functions |
| **TypeChain** | `typechain-types/` | TypeScript contract types |
| **Deployment** | `deployments/amoy-fresh/proxy.json` | Deployed addresses |

### Configuration Files

| File | Purpose |
|------|---------|
| `.env` | Private keys, RPC URLs, API keys |
| `hardhat.config.ts` | Network settings, compiler config |
| `tsconfig.json` | TypeScript configuration |

## 🧪 Testing Files

### Test Suites
```
test/
├── core/                    # Core functionality tests
│   ├── token.core.spec.ts   # Basic ERC-20 tests
│   ├── token.roles.spec.ts  # Access control tests
│   ├── token.pause.spec.ts  # Pausable tests
│   └── token.supply.spec.ts # Mint/Burn tests
├── features/                # Feature-specific tests
│   ├── token.fee.spec.ts    # Fee system tests
│   ├── token.freeze.spec.ts # Freeze functionality
│   ├── token.block.spec.ts  # Block functionality
│   ├── token.permit.spec.ts # EIP-2612 tests
│   ├── token.eip3009.spec.ts# EIP-3009 tests
│   └── token.erc1363.spec.ts # ERC-1363 tests
└── upgrade/                 # Upgrade tests
    ├── upgrade.forward.spec.ts  # V1 -> V2 tests
    └── upgrade.compatibility.spec.ts # Storage layout tests
```

### Amoy Test Scripts
```
scripts/
├── test/
│   └── test_amoy_fresh_comprehensive.ts  # Full Amoy test suite
├── debug/
│   └── debug_freeze_block_pause.ts       # Debug specific functions
└── fix/
    ├── fix_amoy_fresh_roles.ts         # Fix role assignments
    └── fix_amoy_burner_role.ts          # Fix specific role
```

### Run Tests
```bash
# All local tests
npx hardhat test

# Specific test file
npx hardhat test test/core/token.core.spec.ts

# Amoy comprehensive test
npx hardhat run scripts/test/test_amoy_fresh_comprehensive.ts --network amoy

# Debug functions
npx hardhat run scripts/debug/debug_freeze_block_pause.ts --network amoy
```

## 🎨 Frontend Integration

### Quick Start for dApp Developers

#### 1. Install Dependencies
```bash
npm install ethers
# or
yarn add ethers
```

#### 2. Import ABI
```typescript
import TokenABI from './abi/Token.json';

const TOKEN_ADDRESS = '0x0A06Bad41D08c4634a05a45b8709A32552B1A0ab';
const RPC_URL = 'https://rpc-amoy.polygon.technology';
```

#### 3. Connect to Contract
```typescript
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider(RPC_URL);
const token = new ethers.Contract(TOKEN_ADDRESS, TokenABI.abi, provider);

// For write operations
const signer = new ethers.Wallet(privateKey, provider);
const tokenWithSigner = token.connect(signer);
```

#### 4. Read Operations (No Gas)
```typescript
// Token info
const name = await token.name();
const symbol = await token.symbol();
const decimals = await token.decimals();
const totalSupply = await token.totalSupply();
const fee = await token.fee();

// Balance
const balance = await token.balanceOf(userAddress);
console.log(`Balance: ${ethers.formatEther(balance)} ${symbol}`);

// Health check
const health = await token.healthCheck();
console.log(`Supply: ${ethers.formatEther(health.totalSupply)}`);
console.log(`Paused: ${health.isPaused}`);
```

#### 5. Write Operations (Requires Gas)
```typescript
// Transfer
const tx = await tokenWithSigner.transfer(toAddress, ethers.parseEther('10'));
await tx.wait();

// Approve
const approveTx = await tokenWithSigner.approve(spenderAddress, ethers.parseEther('100'));
await approveTx.wait();

// Check allowance
const allowance = await token.allowance(ownerAddress, spenderAddress);
```

#### 6. Event Listening (WebSocket)
```typescript
const wsProvider = new ethers.WebSocketProvider('wss://...');
const wsToken = new ethers.Contract(TOKEN_ADDRESS, TokenABI.abi, wsProvider);

// Listen for transfers
wsToken.on('Transfer', (from, to, value, event) => {
  console.log(`Transfer: ${ethers.formatEther(value)} from ${from} to ${to}`);
});

// Listen for fee operations
wsToken.on('FeeOperationDebug', (from, to, amount, feeAmount, collector, netValue) => {
  console.log(`Fee: ${ethers.formatEther(feeAmount)} collected`);
});
```

### React Hook Example
```typescript
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import TokenABI from '../abi/Token.json';

const TOKEN_ADDRESS = '0x0A06Bad41D08c4634a05a45b8709A32552B1A0ab';

export function useTokenBalance(address: string) {
  const [balance, setBalance] = useState<string>('0');

  useEffect(() => {
    const provider = new ethers.JsonRpcProvider('https://rpc-amoy.polygon.technology');
    const token = new ethers.Contract(TOKEN_ADDRESS, TokenABI.abi, provider);
    
    token.balanceOf(address).then((bal: bigint) => {
      setBalance(ethers.formatEther(bal));
    });

    // Listen for balance changes
    token.on('Transfer', (from, to, value, event) => {
      if (from === address || to === address) {
        token.balanceOf(address).then((bal: bigint) => {
          setBalance(ethers.formatEther(bal));
        });
      }
    });

    return () => {
      token.removeAllListeners();
    };
  }, [address]);

  return balance;
}
```

### Vue.js Composable Example
```typescript
import { ref, onMounted, onUnmounted } from 'vue';
import { ethers } from 'ethers';
import TokenABI from '@/abi/Token.json';

export function useToken() {
  const token = ref<ethers.Contract | null>(null);
  const health = ref<any>(null);

  onMounted(() => {
    const provider = new ethers.JsonRpcProvider('https://rpc-amoy.polygon.technology');
    token.value = new ethers.Contract(
      '0x0A06Bad41D08c4634a05a45b8709A32552B1A0ab',
      TokenABI.abi,
      provider
    );
    
    // Fetch health check
    token.value.healthCheck().then((h: any) => {
      health.value = h;
    });
  });

  return { token, health };
}
```

## 🔧 Useful Hardhat Commands

```bash
# Compile contracts
npx hardhat compile

# Clean build artifacts
npx hardhat clean

# Run tests with coverage
npx hardhat coverage

# Verify contract on Polygonscan
npx hardhat verify --network amoy PROXY_ADDRESS

# Interactive console
npx hardhat console --network amoy

# Check contract size
npx hardhat size-contracts
```

## Security Considerations

- **Mainnet Deployment**: All critical roles (DEFAULT_ADMIN, UPGRADER, MINTER, BURNER) must be assigned to multisig wallets with timelock
- **Fee Cap**: Maximum fee is capped at 999 basis points (9.99%)
- **Storage Layout**: Uses ERC-7201 namespaced storage to prevent storage collisions in upgrades
- **Upgrade Safety**: All upgrades are validated by OpenZeppelin's upgrade safety checks

## License

MIT
