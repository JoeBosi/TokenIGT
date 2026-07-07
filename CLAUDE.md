# CLAUDE.md — TokenIGT

Token ERC-20 professionale, UUPS upgradeable, destinato a Polygon mainnet. **Progetto in fase pre-produzione: privilegiare sempre sicurezza e correttezza rispetto alla velocità.**

## Documento di riferimento

Le specifiche operative complete (ruoli, storage layout ERC-7201, vincoli sulle estensioni, flussi di deploy/upgrade) sono in **AGENTS.md** — consultarlo prima di modificare contratti, ruoli o script. `aggiornamento_documenti.md` elenca quali documenti aggiornare per ogni tipo di modifica: seguirlo dopo ogni cambiamento.

## Stack

- Solidity `^0.8.28`, OpenZeppelin Upgradeable `5.x`, pattern UUPS (ERC-1967) con storage namespaced ERC-7201
- Standard implementati: ERC-20, EIP-2612 Permit, EIP-3009, ERC-1363, EIP-5267
- Feature custom: Fee (max 999 bp), Freeze, Block/Restricted, Recoverable, Pausable
- Doppio toolchain: **Hardhat** (test TS + deploy) e **Foundry** (unit/fuzz/invariant)
- Reti: locale (31337), Amoy testnet (80002), Polygon mainnet (137)

## Comandi

```shell
pnpm test                 # 192 test Hardhat (~6s)
forge test                # 261 test Foundry: unit + fuzz + invariant (~18s)
forge coverage            # Coverage (Token 100%/100%; estensioni 100% branches)
forge build --sizes       # Verifica limite EIP-170 (runtime < 24.576 B)
forge fmt                 # Format (la CI fa forge fmt --check)
pnpm hardhat compile      # Build Hardhat (output artifacts/; Foundry usa out/ — NON unificarli)
```

## Vincoli non negoziabili

1. **Mai modificare l'ordine/layout dello storage** nei contratti upgradeable: solo append nei namespace ERC-7201. Validare con OZ Upgrades prima di ogni upgrade.
2. **Optimizer allineato**: foundry.toml e hardhat.config.ts compilano entrambi con `optimizer=true, runs=200, evm_version=cancun`. Non disallinearli: i test devono coprire il bytecode che va on-chain.
3. **Tutti i 453 test devono passare** (192 Hardhat + 261 Foundry) prima di ogni commit. La CI (.github/workflows/test.yml) esegue `forge fmt --check`, `forge build --sizes`, `forge test -vvv`.
4. **Mai committare segreti**: `.env` è gitignored e contiene chiavi private/API key; usare `.env.example` come template. Non stampare mai il contenuto di `.env`.
5. **Access control**: ogni funzione privilegiata richiede il ruolo dedicato (MINTER, BURNER, PAUSER, FREEZER, BLOCKER, FEE_ADMIN, UPGRADER, RECOVERER). Nuove funzioni privilegiate → nuovo test di access control su entrambe le suite.
6. **Deploy**: script in `scripts/deploy/`; gli esiti vanno in `deployments/<rete>/`. Il deploy mainnet Polygon non è ancora avvenuto — richiede sempre conferma esplicita dell'utente.

## Skills installate (.claude/skills/)

Skill di sicurezza e sviluppo installate a livello progetto — usarle nei momenti giusti:

| Skill | Fonte | Quando usarla |
|---|---|---|
| `secure-workflow-guide` | Trail of Bits | Workflow di security review completo (integra Slither); prima di milestone/release |
| `token-integration-analyzer` | Trail of Bits | Analisi conformità ERC-20 e "weird token patterns" (fee-on-transfer, blocklist, pausable) |
| `entry-point-analyzer` | Trail of Bits | Mappare gli entry point state-changing prima di un audit |
| `code-maturity-assessor` | Trail of Bits | Valutazione maturità del codice (9 categorie) pre-produzione |
| `audit-prep-assistant` | Trail of Bits | Preparare il codebase per l'audit esterno pre-mainnet |
| `guidelines-advisor` | Trail of Bits | Best practice su upgradeability, documentazione, testing |
| `differential-review` | Trail of Bits | Review di sicurezza dei diff — usare prima di ogni upgrade dell'implementation |
| `property-based-testing` | Trail of Bits | Progettare property/invariant test (estensione di TokenHandler.sol) |
| `mutation-testing` | Trail of Bits | Verificare che la suite di test uccida i mutanti |
| `develop-secure-contracts` | OpenZeppelin | Integrazione corretta delle librerie OZ (pattern aggiornati a OZ 5.x) |
| `upgrade-solidity-contracts` | OpenZeppelin | Gestione sicura degli upgrade UUPS e validazione storage layout |
| `scv-scan` | community (kadenzipfel) | Scan sistematico su 36 classi di vulnerabilità note |

Inoltre sono disponibili i comandi built-in `/security-review` e `/code-review` per review generiche del diff.

## Struttura

- `contracts/Token.sol` — contratto principale (V1); `TokenV2/V3.sol` — versioni per test di upgrade
- `contracts/extensions/` — estensioni custom upgradeable (Fee, Freezable, Restricted, Recoverable, EIP3009, ERC1363)
- `test/` — suite Hardhat (TS); `test/foundry/` — suite Foundry (unit, fuzz, invariant + `TokenHandler.sol`)
- `TODO.md` / `TODO_TESTS.md` — task pendenti e stato coverage
