# IGT Token

Advanced ERC-20 token with UUPS upgradeability, role-based access control, and multiple extensions.

## Features

- **ERC-20 Standard**: Full compliance with ERC-20, ERC-20 Permit (EIP-2612), and ERC-20 Pausable
- **UUPS Upgradeability**: Proxy pattern with ERC-1822 for secure upgrades
- **Access Control**: Granular role-based permissions via OpenZeppelin AccessControl
- **Fee Mechanism**: Configurable transaction fee with whitelist and cap (max 9.99%)
- **Freeze/Ban**: Ability to freeze or block addresses for compliance
- **EIP-3009**: Transfer With Authorization for gasless transfers
- **ERC-1363**: Payable Token with callback support
- **Recovery**: Recover ERC20, ETH, and ERC721 tokens accidentally sent to contract
- **EIP-712/EIP-5267**: Typed structured data hashing and domain separator

## Tech Stack

- **Solidity**: ^0.8.28
- **OpenZeppelin Contracts**: 5.6.1
- **Hardhat**: ^2.22.0
- **Package Manager**: pnpm
- **Proxy Pattern**: UUPS (ERC-1822 + ERC-1967)
- **Storage Pattern**: ERC-7201 Namespaced Storage

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

## Security Considerations

- **Mainnet Deployment**: All critical roles (DEFAULT_ADMIN, UPGRADER, MINTER, BURNER) must be assigned to multisig wallets with timelock
- **Fee Cap**: Maximum fee is capped at 999 basis points (9.99%)
- **Storage Layout**: Uses ERC-7201 namespaced storage to prevent storage collisions in upgrades
- **Upgrade Safety**: All upgrades are validated by OpenZeppelin's upgrade safety checks

## License

MIT
