# Deployment Documentation

## Current Deployments

### Amoy Testnet (Active) — v2.4.0 (deploy di TEST)

| Contract | Address |
|----------|---------|
| **Token Proxy (UUPS)** | `0x8B4aFEd36CbD8418E2e4bc34E71b20433Ecb7515` |
| **Implementation v2.4.0** | `0x4409cC3D3fdFC26800223A26e931CbAD333DBD05` (verificata ✅) |

**Explorer:**
- Proxy: https://amoy.polygonscan.com/address/0x8B4aFEd36CbD8418E2e4bc34E71b20433Ecb7515
- Implementation (source verified): https://amoy.polygonscan.com/address/0x4409cC3D3fdFC26800223A26e931CbAD333DBD05#code

**Deploy fresco** (2026-07-11, non upgrade — split ruoli FEE_ADMIN/SWEEPER,
ContractURIs, AccessControlDefaultAdminRules): la v2.4.0 usa un nuovo namespace
storage ERC-7201 (`advanced.token.contracturis.storage`) e una nuova
`initialize` a 10 parametri — incompatibile con le istanze v2.3.x e precedenti.

### Token Details (Amoy, v2.4.0 — valori di INITIALIZE)

> ⚠️ Questi sono i valori di `initialize`. Il proxy è un DEPLOY DI TEST: durante
> i test on-chain (2026-07-11) collector/treasury sono stati spostati su
> `0x…FEE1`/`0x…FEE2` e il ciclo custodia è stato avanzato (cycle 2) — lo stato
> corrente NON coincide più con questi valori iniziali. Verificare sempre lo
> stato reale con `feeCollector()`/`custodyTreasury()`/`currentCycle()` prima
> di operare su questo proxy.

- **Name / Symbol / Decimals:** IGE Token / IGT / 18
- **Initial Supply:** 10.000 IGT
- **Transfer fee:** 1 bp (0,01%) — cap on-chain 100 bp
- **Fee collector (a initialize):** `0x2D6eCb55771f262f99F9dF8163910B1968a7862F`
- **Custody fee:** 50 bp (0,50%) — cap on-chain 200 bp
- **Custody treasury (a initialize):** `0x2D6eCb55771f262f99F9dF8163910B1968a7862F`
- **Current cycle (a initialize):** 1
- **Admin transfer delay:** 259.200 s (3 giorni)

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
| FEE_ADMIN_ROLE | `0x2D6eCb55771f262f99F9dF8163910B1968a7862F` (+ admin dall'init) |
| SWEEPER_ROLE | `0x518322969492b8e52ca5d2eb1bc6c0d2f45d5892` |
| RECOVERER_ROLE | `0x2D6eCb55771f262f99F9dF8163910B1968a7862F` |

Test on-chain v2.4.0 (2026-07-11): integrazione (fee/freeze/block/pause/recovery)
+ caveaux (sweep, con SWEEPER_ROLE) tutti verdi. Smoke test: name/symbol/version,
supply, fee config, cycle, `previewNet`/`previewGross`/`maxNetTransferable`,
ruoli — tutto ✅.

### Deployment storici (DEPRECATI)

| Versione | Proxy |
|---|---|
| v2.3.0 | `0x479DE4c471a88c0AFdf24e9E5462555BBab03BcC` |
| v2.1.0 | `0x2b307FabB36e54Fbd0257cE597D7bE277df84922` |
| v2.0.0 (recoverETH pre-rename) | `0xCbb382dd813841f501EcA35A8E2Ab82b24ba14B6` |
| v1.6.3-security-fixes | `0x55F7DaBE49cc7947D6ac12014Af40305176581eB` |
| v1.6.2-cleanup-final | `0x0A06Bad41D08c4634a05a45b8709A32552B1A0ab` |

## Procedura di deploy

```bash
pnpm hardhat run scripts/deploy/deploy_amoy.ts --network amoy       # deploy proxy+impl
# aggiornare PROXY_ADDRESS / IMPLEMENTATION_ADDRESS in .env
pnpm hardhat run scripts/roles/grant_roles.ts --network amoy        # ruoli operativi
PROXY_ADDRESS=... pnpm hardhat run scripts/deploy/verify.ts --network amoy
                                                                     # verifica ENTRAMBI:
                                                                     # implementation + proxy marcato come proxy
```

Per il redeploy pulito pre-mainnet (governance verso multisig), dopo il deploy:
```bash
GOVERNANCE_ADMIN=<safe> PROXY_ADDRESS=... \
  pnpm hardhat run scripts/roles/finalize_governance.ts --network <rete>
```
Vedi la checklist completa in `PIANO_LAVORI.md` §E3.

Output del deploy in `deployments/<rete>/` (`proxy.json`, `implementation.json`,
`deploy-info.json`/`deployment.json`, `upgrade-history.json`) e ABI in `abi/Token.json`.

## Network Configuration

| | Amoy Testnet | Polygon Mainnet |
|---|---|---|
| Chain ID | 80002 | 137 |
| RPC | https://polygon-amoy-bor-rpc.publicnode.com | https://polygon-bor-rpc.publicnode.com |
| Explorer | https://amoy.polygonscan.com | https://polygonscan.com |

> RPC ufficiali (`rpc-amoy.polygon.technology`, `polygon-rpc.com`) sono spesso
> rate-limited (Cloudflare 1015) — vedi `AMOY_TEST_REPORT.md`. Usare publicnode.

> **Mainnet**: deploy SOLO a fine sviluppo/testing, dopo audit esterno, con
> governance su multisig (vedi AGENTS.md §3.6 e AUDIT_INTERNO_V2.md).
