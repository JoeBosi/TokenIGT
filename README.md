# TokenIGT — Advanced ERC-20 Token

Token ERC-20 avanzato con UUPS upgradeable pattern, implementante standard ERC-20, EIP-2612 (Permit), EIP-3009 (Transfer With Authorization), ERC-1363 (Payable Token), e funzionalità custom (Fee, Freeze, Block, Recovery).

## Features

- **ERC-20 Standard**: Transfer, approve, allowance, balance tracking
- **EIP-2612 Permit**: Gasless approvals via signatures
- **EIP-3009**: Transfer with authorization (gasless transfers)
- **ERC-1363**: Payable token with callback support
- **Fee System**: Configurable transaction fees (max 999 bp / 9.99%)
- **Freeze/Block**: Account restriction mechanisms
- **Pausable**: Emergency pause functionality
- **UUPS Upgradeable**: Proxy pattern for contract upgrades
- **Access Control**: Role-based permissions (MINTER, BURNER, PAUSER, FREEZER, BLOCKER, FEE_ADMIN, UPGRADER, RECOVERER)

## Stack

- Solidity `^0.8.28`
- OpenZeppelin Contracts `5.6.1`
- Hardhat `^2.22.0` with `hardhat-foundry` plugin
- Foundry for fuzz/invariant testing
- TypeScript for deployment scripts

## Documentation

- [AGENTS.md](./AGENTS.md) — Specifiche operative per sviluppatori AI
- [API.md](./API.md) — API reference
- [CHANGELOG.md](./CHANGELOG.md) — Changelog versioni
- [DEPLOYMENT.md](./DEPLOYMENT.md) — Guide deploy

## Testing

### Hardhat Tests

```shell
pnpm test
```

Test suite TypeScript con coverage su core, features, upgrade e interazioni cross-feature.

### Foundry Tests (Fuzz & Invariant)

```shell
forge test
forge coverage
```

**Test Foundry attuali:** 38 test passanti
- Fuzz transfer con fee
- Fuzz mint/burn
- Freeze/block/unblock/unfreeze
- Fee whitelist
- Pause/unpause
- Health check, version, permit, domain separator

**Coverage Foundry:**
- TokenHandler: 97.65% line, 98.78% branch
- UUPSProxy: 100% line

### Build

```shell
pnpm hardhat compile  # or: forge build
```

## Usage

### Local Deploy

```shell
pnpm hardhat run scripts/deploy/deploy_local.ts
```

### Amoy Testnet Deploy

```shell
pnpm hardhat run scripts/deploy/deploy_amoy.ts --network amoy
```

### Foundry Commands

```shell
forge build      # Compile
forge test       # Run tests
forge coverage   # Coverage report
forge fmt        # Format code
forge snapshot   # Gas snapshots
```

## License

MIT
