# Deployment Documentation

## Current Deployments

### Amoy Testnet (Active) — v2.1.0

| Contract | Address |
|----------|---------|
| **Token Proxy (UUPS)** | `0x2b307FabB36e54Fbd0257cE597D7bE277df84922` |
| **Implementation v2.1.0** | `0xcbc86423AaE09Aa2f67A479acD2aa779e81b78F4` (verificata ✅) |

**Explorer:**
- Proxy: https://amoy.polygonscan.com/address/0x2b307FabB36e54Fbd0257cE597D7bE277df84922
- Implementation (source verified): https://amoy.polygonscan.com/address/0xcbc86423AaE09Aa2f67A479acD2aa779e81b78F4#code

**Deploy fresco** (2026-07-07, non upgrade — rename recoverNative): la v2.x usa nuovi namespace storage
ERC-7201 conformi e una nuova `initialize` a 9 parametri — incompatibile con le
istanze v1.x.

### Token Details (Amoy, v2.0.0)

- **Name / Symbol / Decimals:** IGE Token / IGT / 18
- **Initial Supply:** 10.000 IGT
- **Transfer fee:** 1 bp (0,01%) — cap on-chain 100 bp
- **Fee collector:** `0x2D6eCb55771f262f99F9dF8163910B1968a7862F`
- **Custody fee:** 50 bp (0,50%) — cap on-chain 200 bp
- **Custody treasury:** `0x2D6eCb55771f262f99F9dF8163910B1968a7862F`
- **Current cycle:** 1

### Role Assignments (Amoy)

| Role | Address |
|------|---------|
| DEFAULT_ADMIN_ROLE | `0x2D6eCb55771f262f99F9dF8163910B1968a7862F` |
| UPGRADER_ROLE | `0x15CA765a1D8ce75a8B419F7A79bDe38e7AaD95E0` (+ admin dall'init) |
| MINTER_ROLE | `0x5366053a98f10e8cded12af53aaa6afd33a14a5a` |
| BURNER_ROLE | `0xfCb48aDbb480376089921b0A65B5022cB7EC3588` |
| PAUSER_ROLE | `0x518322969492b8e52ca5d2eb1bc6c0d2f45d5892` |
| FREEZER_ROLE | `0xf86063dDDDC0b841Ff3FBBa8a4A5E524f3D164c1` |
| BLOCKER_ROLE | `0xf86063dDDDC0b841Ff3FBBa8a4A5E524f3D164c1` |
| FEE_MANAGER_ROLE | `0x2D6eCb55771f262f99F9dF8163910B1968a7862F` |
| RECOVERER_ROLE | `0x2D6eCb55771f262f99F9dF8163910B1968a7862F` |

Smoke test on-chain post-deploy (2026-07-06): name/symbol/version, supply, fee config,
cycle, `previewNet`/`previewGross`/`maxNetTransferable`, ruoli — tutto ✅.

### Deployment storici (DEPRECATI — API v1.x incompatibile)

| Versione | Proxy |
|---|---|
| v2.0.0 (recoverETH pre-rename) | `0xCbb382dd813841f501EcA35A8E2Ab82b24ba14B6` |
| v1.6.3-security-fixes | `0x55F7DaBE49cc7947D6ac12014Af40305176581eB` |
| v1.6.2-cleanup-final | `0x0A06Bad41D08c4634a05a45b8709A32552B1A0ab` |

## Procedura di deploy

```bash
pnpm hardhat run scripts/deploy/deploy_amoy.ts --network amoy   # deploy proxy+impl
# aggiornare PROXY_ADDRESS / IMPLEMENTATION_ADDRESS in .env
pnpm hardhat run scripts/roles/grant_roles.ts --network amoy    # distribuzione ruoli
pnpm hardhat verify --network amoy <IMPLEMENTATION>             # verifica sorgente
```

Output del deploy in `deployments/amoy/` (`proxy.json`, `implementation.json`,
`deploy-info.json`) e ABI in `abi/Token.json`.

## Network Configuration

| | Amoy Testnet | Polygon Mainnet |
|---|---|---|
| Chain ID | 80002 | 137 |
| RPC | https://rpc-amoy.polygon.technology | https://polygon-rpc.com |
| Explorer | https://amoy.polygonscan.com | https://polygonscan.com |

> **Mainnet**: deploy SOLO a fine sviluppo/testing, dopo audit esterno, con
> governance su multisig (vedi AGENTS.md §3.6 e AUDIT_INTERNO_V2.md).
