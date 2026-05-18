# Checklist Aggiornamento Documenti

Questo file elenca tutti i documenti che devono essere riarmonizzati quando si modifica il codice del token ERC-20.

---

## 1. Modifica Contratti (contracts/)

**Quando:** Qualsiasi modifica a `.sol` (aggiunta feature, bug fix, refactor, cambio nomi, rimozione codice)

| Documento | Azione | Dettaglio |
|-----------|--------|-----------|
| `AGENTS.md` | **AGGIORNARE** | Sezione 1 (stack), sezione 10 (layout storage), sezione 11 (estensioni custom), sezione 13 (API). Aggiornare descrizioni feature, eventi, errori custom. |
| `README.md` | **AGGIORNARE** | Sezione "Features" (tabella e descrizioni), sezione "Architecture", esempi di codice (se cambiano interface/funzioni). |
| `2026.05.17 - Progettazione del Token.md` | **AGGIORNARE** | Sezioni "Specifiche tecniche", "Funzionalità", diagrammi architetturali. |

**Esempi trigger:**
- Nuova estensione in `contracts/extensions/`
- Nuovo ruolo in `Token.sol`
- Cambio parametro fee/burn/mint
- Nuovo evento o error custom
- Rifattorizzazione storage layout

---

## 2. Bug Fix

**Quando:** Correzione bug nei contratti, nei test, negli script

| Documento | Azione | Dettaglio |
|-----------|--------|-----------|
| `AGENTS.md` | **AGGIORNARE** | Sezione relativa al componente fixato (estensione, ruolo, storage). Verificare che i vincoli elencati siano ancora validi. |
| `README.md` | **VERIFICARE** | Se il bug era documentato come comportamento noto, rimuovere la nota. |
| `test-results.json` | **RICREARE** | Rieseguire `pnpm test` e salvare nuovi risultati. |

**Esempi trigger:**
- Fix overflow/underflow
- Fix access control
- Fix storage collision
- Fix edge case in test

---

## 3. Modifica Parametri Token

**Quando:** Cambiamento valori iniziali o limiti (name, symbol, decimals, supply, fee cap, basis points)

| Documento | Azione | Dettaglio |
|-----------|--------|-----------|
| `.env.example` | **AGGIORNARE** | `TOKEN_NAME`, `TOKEN_SYMBOL`, `INITIAL_SUPPLY`, `TRANSACTION_FEE_BASIS_POINTS`. |
| `AGENTS.md` | **VERIFICARE** | Sezione 3.5 (configurazione token) - verificare valori di esempio. |
| `README.md` | **AGGIORNARE** | Sezione "Token Parameters" con nuovi valori. |
| `scripts/deploy/*.ts` | **VERIFICARE** | Controllare che gli script usino `.env` o abbiano valori coerenti nei commenti. |

**Esempi trigger:**
- Cambio nome/symbol token
- Cambio supply iniziale
- Modifica fee basis points default
- Cambio cap fee (max 999 bp)

---

## 4. Modifica Test

**Quando:** Nuovi test, modifiche test esistenti, aggiunta edge case, cambio coverage

| Documento | Azione | Dettaglio |
|-----------|--------|-----------|
| `test-results.json` | **RICREARE** | Rieseguire `pnpm test` con `--reporter json > test-results.json`. |
| `AGENTS.md` | **AGGIORNARE** | Sezione 5 (struttura test) - aggiornare elenco file test e matrici se aggiunte. |
| `README.md` | **AGGIORNARE** | Sezione "Testing" - aggiornare coverage %, elenco test suite. |

**Esempi trigger:**
- Nuovo file `test/features/*.spec.ts`
- Nuovi test suite in file esistente
- Fix test falliti
- Aumento coverage
- Nuovi test Foundry (`test/foundry/*.sol`)

---

## 5. Deploy (qualsiasi rete)

**Quando:** Deploy nuovo, re-deploy, upgrade proxy, cambio indirizzi

| Documento | Azione | Dettaglio |
|-----------|--------|-----------|
| `.env` | **AGGIORNARE** | `PROXY_ADDRESS`, `IMPLEMENTATION_ADDRESS` (popolati da script). |
| `deployments/{local,amoy,polygon}/` | **RICREARE** | JSON con proxy, implementation, roles. |
| `abi/` | **RICREARE** | `pnpm hardhat compile` + copia ABI da artifacts. |
| `AGENTS.md` | **VERIFICARE** | Sezione 3.2-3.4 (indirizzi ruoli) - verificare che corrispondano a `.env`. |
| `README.md` | **AGGIORNARE** | Sezione "Deployed Contracts" con nuovi indirizzi e Explorer links. |

**Esempi trigger:**
- `pnpm hardhat run scripts/deploy/deploy_amoy.ts`
- Upgrade V1 → V2
- Cambio ruoli post-deploy (`grant_roles.ts`)

---

## 6. Modifica Ruoli / Access Control

**Quando:** Nuovo ruolo, cambio ruoli assegnati, nuovo indirizzo ruolo

| Documento | Azione | Dettaglio |
|-----------|--------|-----------|
| `.env.example` | **AGGIORNARE** | Indirizzi ruoli (`*_ADDRESS`). |
| `AGENTS.md` | **AGGIORNARE** | Sezione 3 (tutte le tabelle ruoli), sezione 7 (flusso assegnazione ruoli), sezione 9 (matrice pause ruoli). |
| `scripts/roles/*.ts` | **VERIFICARE** | Controllare che i ruoli nel codice corrispondano a `.env` e `AGENTS.md`. |
| `deployments/*/roles.json` | **RICREARE** | Eseguire script di setup ruoli e salvare output. |

**Esempi trigger:**
- Nuovo ruolo in `Token.sol` (es. `RECOVERER_ROLE` aggiunto)
- Cambio indirizzo `MINTER_ADDRESS`
- Riassegnazione ruoli post-deploy

---

## 7. Modifica Dipendenze / Stack

**Quando:** Aggiornamento pacchetti npm, cambio versione OpenZeppelin, aggiornamento Hardhat

| Documento | Azione | Dettaglio |
|-----------|--------|-----------|
| `package.json` | **AGGIORNARE** | Versioni pacchetti. |
| `AGENTS.md` | **AGGIORNARE** | Sezione 1 (tabella stack tecnologico). Verificare vincoli OZ v5.6.1. |
| `hardhat.config.ts` | **VERIFICARE** | Versione Solidity, optimizer settings, EVM target. |
| `pnpm-lock.yaml` | **RICREARE** | `pnpm install` dopo modifica `package.json`. |

**Esempi trigger:**
- `pnpm update @openzeppelin/contracts`
- Aggiornamento Hardhat 2.22 → 2.23
- Cambio versione Solidity `^0.8.28`

---

## 8. Modifica Script

**Quando:** Nuovi script deploy/upgrade/roles, modifiche script esistenti

| Documento | Azione | Dettaglio |
|-----------|--------|-----------|
| `AGENTS.md` | **AGGIORNARE** | Sezione 4 (deploy), sezione 6 (upgrade), sezione 7 (ruoli). Aggiornare nomi script e sequenze. |
| `README.md` | **AGGIORNARE** | Sezione "Scripts" con usage examples. |

**Esempi trigger:**
- Nuovo `deploy_amoy_fresh_start.ts`
- Nuovo script `fix_amoy_burner_role.ts`
- Modifica sequenza deploy

---

## 9. Cambio Risultati Test / Coverage

**Quando:** Output test cambia (pass/fail), coverage % cambia

| Documento | Azione | Dettaglio |
|-----------|--------|-----------|
| `test-results.json` | **RICREARE** | `pnpm test 2>&1 | tee test-output.txt` e parsare. |
| `README.md` | **AGGIORNARE** | Badge coverage, tabella risultati test. |

**Esempi trigger:**
- Fix test falliti → ora passano
- Nuovi test → coverage aumenta
- Refactor → coverage cambia

---

## 10. Modifica Storage Layout / Upgrade Pattern

**Quando:** Cambio variabili storage, nuova versione V2/V3, validazione layout

| Documento | Azione | Dettaglio |
|-----------|--------|-----------|
| `AGENTS.md` | **AGGIORNARE** | Sezione 10 (ERC-7201 storage), sezione 6 (upgrade). Aggiornare tabelle layout. |
| `.openzeppelin/*.json` | **RICREARE** | File di storage layout generati da OZ Upgrades. |
| `test/upgrade/*.spec.ts` | **VERIFICARE** | Test di compatibilità storage layout. |

**Esempi trigger:**
- Nuova variabile in `TokenV2.sol`
- Cambio namespace ERC-7201
- Nuova versione `TokenV3.sol`

---

## 11. Modifica Interfacce (IERC)

**Quando:** Nuova interfaccia, modifiche interface esistenti (IERC1363, IERC3009, ecc.)

| Documento | Azione | Dettaglio |
|-----------|--------|-----------|
| `AGENTS.md` | **AGGIORNARE** | Sezione 12 (interfacce). Aggiornare tabella e funzioni supportate. |
| `README.md` | **AGGIORNARE** | Sezione "Standards" se nuovo standard implementato. |
| `abi/` | **RICREARE** | Ricompilare per ottenere nuove interface ABI. |

**Esempi trigger:**
- Nuova funzione in `IERC3009.sol`
- Cambio `IERC1363Receiver`
- Aggiunta `ERC165` support

---

## 12. Modifica Documentazione Tecnica

**Quando:** Cambio documento di progettazione principale

| Documento | Azione | Dettaglio |
|-----------|--------|-----------|
| `README.md` | **SINCRONIZZARE** | Assicurarsi che README rifletta la progettazione attuale. |
| `AGENTS.md` | **SINCRONIZZARE** | Se la progettazione cambia, AGENTS deve essere coerente. |

**Esempi trigger:**
- Modifica `2026.05.17 - Progettazione del Token.md`
- Cambio decisioni architetturali

---

## File Priorità Alta (sempre verificare)

1. `TODO.md` - Task pendenti e progress tracking
2. `AGENTS.md` - Contiene vincoli operativi fondamentali
3. `.env.example` - Template per configurazione
4. `README.md` - Documentazione utente
5. `test-results.json` - Stato test attuale

## File Priorità Media (verificare per tipo modifica)

6. `deployments/*` - Indirizzi deploy
7. `abi/` - ABI contratti
8. `.openzeppelin/*` - Storage layout OZ

## File Priorità Bassa (verificare occasionalmente)

9. `hardhat.config.ts` - Configurazione build
10. `tsconfig.json` - Configurazione TypeScript
11. `.gitignore` - Se nuovi file generati
