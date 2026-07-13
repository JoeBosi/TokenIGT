# TokenIGT — Advanced ERC-20 Token (v2.5.0)

[![CI](https://github.com/JoeBosi/TokenIGT/actions/workflows/test.yml/badge.svg)](https://github.com/JoeBosi/TokenIGT/actions/workflows/test.yml)
![Tests](https://img.shields.io/badge/tests-561%20passing-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-Token.sol%20100%25-brightgreen)
![Solidity](https://img.shields.io/badge/solidity-0.8.28-blue)

**Sottostante: 1 IGT = 2 grammi d'oro fino** (vedi [PEG_ORO.md](./PEG_ORO.md)).

Token ERC-20 avanzato con pattern UUPS upgradeable: ERC-20, EIP-2612 (Permit),
EIP-3009 (Transfer With Authorization), ERC-1363 (Payable Token), fee di scambio
a doppia semantica, **fee di custodia on-chain a cicli**, freeze, blocklist,
pausa e recovery.

## Features

- **ERC-20 Standard** + EIP-2612 Permit + EIP-5267
- **Fee di scambio** (`transferFeeBps`, cap 100 bp = 1%, azzerabile):
  - su `transfer`/`transferFrom`: **dedotta dall'importo** (il destinatario riceve il netto)
  - su ERC-1363 ed EIP-3009: **il destinatario riceve esattamente il valore indicato**,
    il mittente paga valore + fee (allowance sul lordo per `transferFromAndCall`)
  - view di preview: `previewNet(lordo)`, `previewGross(netto)`, `maxNetTransferable(mittente)`
  - esenzioni enumerabili (`getTransferFeeExemptList`)
- **Fee di custodia** (`custodyFeeBps`, cap 200 bp = 2%, azzerabile):
  - prelievo a cicli via `sweepCustodyFee(holders)` — idempotente per ciclo,
    calcolata sul balance al momento dell'esecuzione (mai insufficienza)
  - preleva anche da account frozen/blocked e a token in pausa (procedura
    anti-elusione: `pause()` → batch → `unpause()`)
  - treasury dedicata, esenzioni enumerabili, eventi di riconciliazione
- **Freeze binario** / **Blocklist**: restrizioni per account (mittente e destinatario)
- **Pausable**: pausa di emergenza (unica eccezione: lo sweep di custodia)
- **Recovery**: recupero di ERC-20/POL(nativo)/NFT inviati per errore al contratto (SafeERC20)
- **UUPS Upgradeable** con storage ERC-7201 conforme (verificato on-chain nei test)
- **ContractURIs** (v2.4.0): `websiteURI`, `reserveInfoURI` (pointer proof-of-reserve),
  `contractURI` (ERC-7572) — gestiti da `DEFAULT_ADMIN_ROLE`
- **Governance a due fasi** (v2.4.0, `AccessControlDefaultAdminRulesUpgradeable`):
  trasferimento di `DEFAULT_ADMIN_ROLE` con delay obbligatorio
  (`beginDefaultAdminTransfer` → `acceptDefaultAdminTransfer`)
- **Access Control**: MINTER, BURNER, PAUSER, FREEZER, BLOCKER, FEE_ADMIN,
  SWEEPER (split v2.4.0), UPGRADER, RECOVERER — matrice completa in [roles.md](./roles.md)

## Stack

- Solidity `^0.8.28` (optimizer 200 runs, EVM cancun)
- OpenZeppelin Contracts Upgradeable `5.6.1`
- Hardhat `^2.22` + Foundry (fuzz/invariant)
- TypeScript + ethers v6

## Documentation

- [AGENTS.md](./AGENTS.md) — specifica operativa (sviluppo AI-assisted)
- [SPEC_FEE_CUSTODIA.md](./SPEC_FEE_CUSTODIA.md) — spec fee v2 + decisioni D1–D8
- [roles.md](./roles.md) — matrice ruoli × metodi
- [AUDIT_INTERNO_V2.md](./AUDIT_INTERNO_V2.md) — audit interno v2.0.0
- [MONITORING.md](./MONITORING.md) — osservabilità off-chain
- [API.md](./API.md) — API reference
- [DEPLOYMENT.md](./DEPLOYMENT.md) — guida deploy
- [GOVERNANCE.md](./GOVERNANCE.md) — mappa ruoli→indirizzi + handover a due fasi
- [AMOY_TEST_REPORT.md](./AMOY_TEST_REPORT.md) — test on-chain (integrazione, caveaux, scala)
- [MUTATION_TESTING.md](./MUTATION_TESTING.md) — mutation testing (mewt)
- [CHANGELOG.md](./CHANGELOG.md) — changelog

## Testing

**561 test, tutti passanti** (stato 2026-07-13):

```shell
pnpm test        # 226 test Hardhat (~6s)
forge test       # 335 test Foundry: 
                 #   unit + fuzz + invariant (~18s)
forge coverage   # Token.sol: 100% lines/branches; estensioni: 100% branches
```

Suite dedicate v2: doppia semantica fee (`TokenFeeSemanticsTest`), custody
(`TokenCustodyFeeTest`), conformità storage ERC-7201 verificata con `vm.load`
(`TokenStorageLayoutTest`), matrice fee=0 su tutti i percorsi, invariante
somma-balance == totalSupply con sweep nel loop stateful.

## Build & Deploy

```shell
pnpm hardhat compile          # build + typechain
forge build --sizes           # check EIP-170 (runtime ~24.1KB, margine +0.5KB)

pnpm hardhat run scripts/deploy/deploy_local.ts
pnpm hardhat run scripts/deploy/deploy_amoy.ts --network amoy
pnpm hardhat run scripts/roles/grant_roles.ts --network amoy
pnpm hardhat run scripts/roles/finalize_governance.ts --network amoy   # handover FASE 1
pnpm hardhat run scripts/roles/accept_governance.ts --network amoy    # handover FASE 2
pnpm hardhat run scripts/deploy/verify.ts --network amoy
```

> Il deploy su Polygon mainnet è previsto SOLO a fine fase di sviluppo/testing,
> dopo audit esterno e migrazione della governance su multisig.

## Integrazione (ethers v6)

```typescript
const token = new ethers.Contract(PROXY, ABI, providerOrSigner);

// ── Trasferimento standard: fee DEDOTTA (il destinatario riceve il netto) ──
const gross = ethers.parseEther("100");
const net = await token.previewNet(gross);         // quanto arriverà
await token.transfer(to, gross);                    // to riceve `net`

// per consegnare un netto esatto:
const needed = await token.previewGross(ethers.parseEther("100"));
await token.transfer(to, needed);                   // to riceve ≥ 100

// ── ERC-1363 / EIP-3009: semantica LORDA (to riceve ESATTAMENTE value) ──
await token.transferAndCall(to, value);             // mittente paga value + fee
// transferFromAndCall: l'allowance deve coprire value + fee (il "lordo")
const fee = value - (await token.previewNet(value));
await token.approve(spender, value + fee);

// ── Quanto posso inviare al massimo (percorso lordo)? ──
const max = await token.maxNetTransferable(sender);
```

Nota custodia: lo 0,50%/ciclo viene prelevato dall'emittente con la procedura in
[RUNBOOK_SWEEP.md](./RUNBOOK_SWEEP.md) (pausa → snapshot → sweep → verifica → unpause);
numeri e simulazioni in [SIMULAZIONE_CUSTODY_FEE.md](./SIMULAZIONE_CUSTODY_FEE.md).

## License

MIT
