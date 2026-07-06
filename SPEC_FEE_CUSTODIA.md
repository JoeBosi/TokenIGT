# SPEC — Fee di custodia on-chain e fee di scambio + Audit pre-implementazione

> Branch: `2026706ClaudeCode` · Data: 2026-07-06 · Stato: **DECISIONI CHIUSE — in esecuzione**
>
> **Decisioni finali (confermate dall'utente il 2026-07-06):**
> - **D1** — Transfer fee su `transfer`/`transferFrom`: **dedotta dall'importo** (trasferisco 100, arriva il netto).
> - **D2** — **Un solo ruolo**: `FEE_MANAGER_ROLE` (parametri fee + sweep + cicli). Nessun ruolo operatore separato.
> - **D3** — Sweep custodia: **preleva anche da holder blocked/frozen** (la custodia si paga comunque).
> - **D4** — Fee di scambio su **tutti** i percorsi, con doppia semantica: `transfer`/`transferFrom` = netto al destinatario; **ERC-1363 ed EIP-3009 = il destinatario riceve esattamente il valore indicato, il mittente paga valore + fee** (l'allowance deve coprire il lordo). View pubbliche: `previewNet(lordo)`, `previewGross(netto)`, `maxNetTransferable(mittente)`.
> - **D5** — Cap transfer fee: **100 bp (1%)**, azzerabile.
> - **D6** — Freeze **binario/totale**: rimossi gli importi parziali (`freeze(addr,amount)`, `reduceFrozen`, `frozenOf`, `availableBalanceOf`).
> - **D7** — ERC-1363: **resta l'implementazione custom** (necessaria per la semantica gross di D4), rinominata e ripulita.
> - **D8** — **Rimozione completa** dello strato monitoring/debug on-chain.
> - **Deploy**: **nuovo deploy fresco su Amoy** (non upgrade) — permette il fix ERC-7201 (A1) e i rename dei ruoli.
> - **Treasury**: nuova var `.env` `CUSTODY_TREASURY_ADDRESS` (default operativo: valore di `FEE_COLLECTOR_ADDRESS`).
> - **Requisito trasversale**: con **fee = 0** (transfer e/o custody) tutto deve funzionare identicamente a un ERC-20 senza fee.

Questo documento rivaluta la spec richiesta alla luce del contratto attuale (`Token.sol` v1.7.0 + 6 estensioni ERC-7201) e include l'audit di organizzazione/naming/ruoli. Le decisioni aperte sono marcate **[D#]** e riepilogate in fondo.

---

## Parte 1 — Cosa esiste già nel contratto (rilevante per la spec)

| Elemento richiesto dalla spec | Stato nel contratto attuale |
|---|---|
| Transfer fee | **GIÀ ESISTE**: `ERC20FeeUpgradeable` — `fee()` in bp (cap 999), `feeCollector`, whitelist `isFeeFree` (mapping non enumerabile, unica per mittente E destinatario), `FEE_ADMIN_ROLE` |
| Semantica fee attuale | **Dedotta dall'importo**: su `transfer(to, 100)` il destinatario riceve `100 - fee`, il collector riceve `fee`. La spec chiede invece "a carico del sender" (destinatario riceve 100 pieni) → **[D1]** |
| Esenzioni enumerabili | NON esistono: mapping semplice, nessuna `getExemptList()`. `EnumerableSet` disponibile in OZ 5.6.1 |
| Custody fee / cicli / sweep | NON esiste nulla: estensione completamente nuova |
| `FEE_MANAGER_ROLE` | Esiste `FEE_ADMIN_ROLE` con lo stesso scopo → rename o ruolo nuovo **[D2]** |
| Pausable | ESISTE (`PAUSER_ROLE`), blocca **tutti** i percorsi di trasferimento, inclusi ERC-1363 ed EIP-3009 |

### Vincoli architetturali scoperti leggendo il codice (impattano la spec)

**V1 — La pausa blocca anche lo sweep.** La procedura anti-elusione richiesta è `pause() → batch sweep → unpause()`. Ma nel contratto attuale ogni trasferimento passa da `ERC20PausableUpgradeable._update`, che **reverta in pausa**. Se `sweepCustodyFee` usasse `_transfer`/`_update` normali, non potrebbe girare durante la pausa. → Lo sweep deve usare un percorso interno dedicato che salta il check di pausa (chiamata diretta a `ERC20Upgradeable._update`), come già fa `mint()` con `ERC20Upgradeable._mint`.

**V2 — Lo sweep non deve pagare la transfer fee.** Il prelievo custodia va a `custodyTreasury` senza applicare `transferFeeBps` (altrimenti doppia tassazione). Il percorso dedicato di cui sopra risolve anche questo.

**V3 — Holder frozen/blocked.** `_update` reverta se `from` è blocked o frozen. In un batch da N holder, un solo holder congelato farebbe revertare l'intero batch. → Serve una policy esplicita **[D3]** e in ogni caso lo sweep deve processare gli holder problematici senza far fallire il batch.

**V4 — ERC-1363 ed EIP-3009 oggi bypassano la fee.** `_transfer1363` e `_executeTransfer` usano `_updateWithoutFee` (pause/block/freeze sì, fee no). Con la transfer fee chiunque può eludere la fee usando `transferAndCall` verso un EOA. Nota: `roles.md` dichiara il contrario del codice ("soggetti alle stesse restrizioni … fee") — incoerenza documentale. → **[D4]**

**V5 — Arrotondamento.** `fee = balance × bps / 10000` con floor: con `custodyFeeBps = 50`, holder con balance < 200 wei di token → fee 0. Va comunque marcato come "sweepato" per l'idempotenza.

---

## Parte 2 — Spec rivalutata

### 2.1 Architettura

Due interventi separati, entrambi con storage ERC-7201 dedicato (upgrade-safe per aggiunta):

1. **Refactor `ERC20FeeUpgradeable`** (transfer fee): esenzioni enumerabili, cap ridotto, rename ruolo.
2. **Nuova estensione `ERC20CustodyFeeUpgradeable`** (custody fee): parametri, cicli, sweep. Namespace nuovo: `advanced.token.custodyfee.storage` (con formula ERC-7201 **corretta**, vedi audit A1).

`Token.sol` eredita la nuova estensione e implementa il virtual `_collectCustodyFee(holder, treasury, amount)` con chiamata diretta a `ERC20Upgradeable._update` (bypass pausa + fee, vedi V1/V2).

### 2.2 Parametri e storage

```solidity
/// erc7201:advanced.token.custodyfee.storage  (slot con mask & ~0xff — vedi A1)
struct CustodyFeeStorage {
    uint16  custodyFeeBps;         // default 50 (0,50%) — cap MAX_CUSTODY_FEE_BPS = 200
    address custodyTreasury;       // != address(0), validato in setter e init
    uint256 currentCycle;          // parte da 1 nell'init; 0 = "mai sweepato" nei mapping
    mapping(address holder => uint256 cycle) lastSweptCycle;
    EnumerableSet.AddressSet custodyFeeExempt;
}
```

Nel refactor della transfer fee (`FeeStorage`, namespace esistente):
- `fee` → resta `uint256` bp; **default operativo 1 bp** (da `.env`), azzerabile (`setTransferFeeBps(0)`)
- cap: `MAX_TRANSFER_FEE_BPS` — proposto **100** (1%) al posto di 999 **[D5]**
- whitelist: da `mapping isFeeFree` a `EnumerableSet transferFeeExempt` (una sola lista, esenzione se mittente O destinatario è nel set — semantica attuale conservata)

La data ciclo (20 marzo) resta **off-chain**: on-chain esiste solo `currentCycle` (contatore) + eventi con timestamp.

### 2.3 API proposta (nomi definitivi)

**Transfer fee (refactor dell'esistente — rename per simmetria con custody):**

| Attuale | Proposto | Note |
|---|---|---|
| `fee()` | `transferFeeBps()` | disambigua rispetto alla custody fee |
| `setFee(uint256)` | `setTransferFeeBps(uint256)` | cap check, evento `TransferFeeUpdated(old, new)` |
| `feeCollector()` / `setFeeCollector(address)` | invariati | evento esistente ok |
| `addFeeFree` / `removeFeeFree` / `isFeeFree` | `addTransferFeeExempt` / `removeTransferFeeExempt` / `isTransferFeeExempt` | evento `TransferFeeExemptionChanged(account, exempt)` |
| — | `getTransferFeeExemptList() → address[]` | view, solo off-chain (unbounded) |

**Custody fee (nuova estensione):**

```solidity
// Config — onlyRole(FEE_MANAGER_ROLE), tutti con evento e validazione
setCustodyFeeBps(uint16 newBps)                 // ≤ 200, evento CustodyFeeUpdated(old, new)
setCustodyTreasury(address newTreasury)         // != 0, evento CustodyTreasuryUpdated(old, new)
addCustodyFeeExempt(address) / removeCustodyFeeExempt(address)  // evento CustodyFeeExemptionChanged
// View pubbliche
custodyFeeBps() · custodyTreasury() · currentCycle()
isCustodyFeeExempt(address) → bool
getCustodyFeeExemptList() → address[]
lastSweptCycle(address) → uint256

// Operatività — onlyRole(FEE_MANAGER_ROLE)
startNewCycle()                                  // currentCycle++, evento CycleStarted(newCycle, timestamp)
sweepCustodyFee(address[] calldata holders)      // vedi 2.4
```

### 2.4 Semantica `sweepCustodyFee` (rivalutata)

```
per ogni holder in holders:
  skip se isCustodyFeeExempt(holder)                     → evento no, skip silenzioso
  skip se lastSweptCycle[holder] == currentCycle          → idempotenza (doppio sweep innocuo)
  skip se holder == custodyTreasury o holder == address(0)
  [D3] se isBlocked(holder) o isFrozen(holder): policy da decidere (skip con evento vs prelievo comunque)
  fee = balanceOf(holder) * custodyFeeBps / 10000         → calcolata al momento: mai saldo insufficiente
  lastSweptCycle[holder] = currentCycle                   → marcato ANCHE se fee == 0 (V5)
  se fee > 0: _collectCustodyFee(holder, custodyTreasury, fee)   → bypass pausa e transfer fee (V1/V2)
  evento CustodyFeeCollected(holder, fee, currentCycle)   → emesso anche con fee 0? proposto: sì solo se fee > 0
```

- Nessun revert per singolo holder: il batch continua sempre (skip, non revert).
- Nessuna logica anti-elusione nel transfer: la finestra di coerenza è garantita dalla procedura `pause() → tutti i batch → unpause()` (lo sweep funziona in pausa per costruzione, V1).
- `startNewCycle()` è volutamente separato e manuale; nessun enforcement on-chain della data (20 marzo = riferimento operativo).
- Lista holder enumerata off-chain (indexer eventi `Transfer`) — invariato rispetto alla spec.
- Gas: ~50-70k per holder → batch consigliati da ~100-200 holder su Polygon.

### 2.5 Ruoli

- **[D2]** Rename `FEE_ADMIN_ROLE` → `FEE_MANAGER_ROLE` (un solo ruolo per transfer fee + custody fee + sweep + cicli), **oppure** due ruoli: `FEE_MANAGER_ROLE` (parametri) + `CUSTODY_OPERATOR_ROLE` (solo `sweepCustodyFee` + `startNewCycle`, assegnabile a un bot operativo con privilegi minimi). Raccomandazione: **due ruoli** — lo sweep è ricorrente e automatizzabile, la chiave del bot non deve poter cambiare treasury o bps.
- L'operatore dello sweep ha bisogno anche di `PAUSER_ROLE` per la procedura completa (o la pausa la gestisce un altro ruolo umano: preferibile).
- `initialize` assegnerà i nuovi ruoli al `defaultAdmin_` come per gli altri (poi ridistribuiti post-deploy).

### 2.6 Test richiesti (piano)

Foundry (unit + fuzz + invariant) e specchio Hardhat dove sensato:

1. **Rami sweep**: exempt / già sweepato nel ciclo / holder == treasury / fee == 0 (marcato) / preleva correttamente / [D3] frozen/blocked
2. **Doppio sweep stesso ciclo**: secondo sweep = no-op totale (balance invariati)
3. **Sweep in pausa**: funziona; transfer normali revertano contemporaneamente
4. **Ciclo nuovo**: dopo `startNewCycle()` lo sweep preleva di nuovo
5. **Setter**: validazioni (cap 200, treasury != 0), eventi, access control (ruolo giusto e sbagliato)
6. **Esenzioni**: add/remove/isExempt/getExemptList coerenti (EnumerableSet), eventi
7. **Fuzz**: `custodyFeeBps ∈ [0,200]` × balance arbitrari → fee mai > balance, mai revert per saldo
8. **Invariant**: somma balance == totalSupply dopo qualunque sequenza sweep/transfer/mint/burn (estendere `TokenHandler.sol` con sweep); idempotenza per ciclo come invariante
9. **Upgrade-safety**: validazione OZ Upgrades del nuovo layout (nuovo namespace, append-only), upgrade V1→nuova versione con stato preservato
10. **Interazioni**: sweep + transfer fee attiva (no doppia fee), sweep su holder con permit/allowance pendenti (nessun effetto)

---

## Parte 3 — Audit organizzazione / naming / ruoli

### 3.1 Critici — da sistemare PRIMA del coding della spec (bloccano o condizionano il design)

**A1 — Storage ERC-7201 non conforme allo standard.** Tutte le estensioni calcolano lo slot come `keccak256(abi.encode(uint256(keccak256(id)) - 1))` **senza il mask finale `& ~bytes32(uint256(0xff))`** richiesto da ERC-7201. Le annotazioni `@custom:storage-location erc7201:...` sono quindi **scorrette**: un tool che si fida dell'annotazione calcola uno slot diverso da quello usato dal codice. Non è un bug di sicurezza (lo slot resta pseudo-casuale), ma: (a) non è lo standard dichiarato, (b) inganna i validatori di upgrade. **Correggere lo slot cambia la posizione dello storage → si può fare SOLO ora che mainnet non è deployato** (richiede redeploy fresco su Amoy, non upgrade). Da fare in questo branch, prima o insieme alla spec. Inoltre: le costanti `STORAGE_LOCATION` dichiarate non sono mai usate (i getter ricalcolano l'hash inline) — unificare.

**A2 — `_spendAllowance` override rompe le infinite allowance.** `Token._spendAllowance` reimplementa la logica OZ ma senza il check `currentAllowance == type(uint256).max`: le approvazioni "infinite" (pattern standard usato da DEX/protocolli) vengono decrementate a ogni `transferFrom`, con SSTORE extra e un evento `Approval` spurio a ogni trasferimento. Diverge dal comportamento ERC-20 atteso dagli integratori. Fix: delegare a `super._spendAllowance` (OZ) e risolvere il conflitto di override senza reimplementare.

**A3 — Incoerenza fee tra percorsi di trasferimento [D4].** `transfer`/`transferFrom` applicano la fee; `transferAndCall`, `transferFromAndCall`, `transferWithAuthorization`, `receiveWithAuthorization` no (by design nel codice, ma `roles.md` documenta il contrario). Con transfer fee attiva è un'elusione banale. Decidere: fee uniforme su tutti i percorsi (raccomandato) o bypass documentato ovunque.

### 3.2 Pulizia produzione — riduzione superficie e bytecode

**A4 — Strato monitoring/debug da rimuovere.** ~150 righe e 9 eventi che duplicano informazioni già derivabili dagli eventi standard (`Transfer`, `Paused`, `RoleGranted`, ...) e gonfiano bytecode e gas di ogni operazione privilegiata: `OperationLogged` + `_emitOperation` + `_generateOperationId`, tutti gli eventi `*OperationDebug`, `ErrorReport` + `_emitError` (mai chiamata), `HealthCheck`/`emitHealthCheck`/`healthCheck()` (con 3 STATICCALL `this.` inutili), `getSystemStatus`, `isAdmin`, `debugRoles`, `_blockTimestamp()` (wrapper superfluo). Un indexer off-chain (già previsto per gli holder) copre il monitoring meglio e gratis. Raccomandazione: eliminare tutto lo strato; in alternativa minima, eliminare almeno il dead code confermato (`_emitError`, `_emitTransfer` e relativi virtual, già noti in TODO_TESTS.md).

**A5 — `TokenV2`/`TokenV3` sono fixture di test** ma vivono in `contracts/` e finiscono nei report di coverage/analisi. Spostarli in `contracts/mocks/` (o `test/`), escludendoli dalle metriche.

**A6 — `version()` = `"1.7.0-refactor"`**: suffisso di lavorazione. Adottare semver pulito; con le modifiche di questo branch si va a **`2.0.0`** (breaking: rename API fee).

### 3.3 Naming — incoerenze da sanare (siamo pre-mainnet: ora o mai più)

**A7 — Terminologia block/restricted frammentata.** Contratto `ERC20RestrictedUpgradeable`, ruolo `BLOCKER_ROLE`, funzioni extension `blockUser`/`resetUser`, wrapper Token `blockAddress`/`unblock`, eventi `Blocked`/`Unblocked`, errore `AccountBlocked`. Quattro famiglie di nomi per una feature. Proposta: contratto `ERC20BlocklistUpgradeable`, funzioni `blockAccount(address)`/`unblockAccount(address)` (uniche, senza wrapper duplicati), resto invariato. `resetUser` in particolare non comunica nulla.

**A8 — Overload `freeze` ambigui.** `freeze(address)` = congela tutto; `freeze(address, uint256)` **imposta** (non incrementa) l'importo congelato — il nome suggerisce un'azione additiva; `reduceFrozen` decrementa ma non esiste l'inverso; `isFrozen` = `frozen > 0` (ambiguo con freeze parziale: un account con 1 wei congelato risulta "frozen" ma può trasferire il resto? No: `_runSecurityChecks` blocca TUTTO se `isFrozen` → un freeze parziale blocca l'intero account, rendendo `availableBalanceOf` di fatto decorativo!). **Questo è anche un finding funzionale**: o il freeze parziale limita solo l'importo congelato (usando `availableBalanceOf` nel check), o il freeze è solo binario e il concetto di importo va rimosso. Da chiarire **[D6]**. Naming proposto dopo la decisione: `setFrozenAmount` / `freezeAll` / `unfreeze` (+ eventuale check su available) oppure semplicemente `freeze`/`unfreeze` binari.

**A9 — `ERC20_1363Upgradeable`**: nome non CapWords (flag Slither), commento stale "*Implementation not yet debugged, requires testing*" (falso: 23+8 test passanti). **OZ 5.6.1 include `ERC1363Upgradeable` ufficiale e audited**: valutare la sostituzione della implementazione custom [D7]; in alternativa rename in `ERC20PayableUpgradeable` o simile + rimozione commento stale.

**A10 — `ERC20RecoverableUpgradeable`**: usa `call` raw con `abi.encodeWithSignature` per ERC-20 e ERC-721; sostituire con `SafeERC20.safeTransfer` e `IERC721(nft).safeTransferFrom` tipizzato (stessa semantica, meno superficie d'errore, pattern standard). Nota: `recoverERC20(address(this), ...)` può drenare token IGT detenuti dal contratto stesso — comportamento probabilmente voluto (recupero invii per errore) ma da documentare esplicitamente.

**A11 — Parametri con underscore misto**: `initialize` usa trailing underscore (`name_`), TokenV2/V3 leading (`_newVariable`) — uniformare al trailing (convenzione OZ).

### 3.4 Ruoli e governance

**A12 — Nessuna protezione sul DEFAULT_ADMIN.** `AccessControlUpgradeable` puro: grant/revoke immediati, nessun two-step, nessun delay. Se la chiave admin è compromessa, l'attaccante controlla tutto (incluso `UPGRADER_ROLE` → codice arbitrario via upgrade). Pre-mainnet: valutare `AccessControlDefaultAdminRulesUpgradeable` (two-step + delay sul trasferimento admin) e, indipendentemente dal codice, admin+upgrader su **multisig** (Safe) con eventuale timelock. Decisione di governance più che di codice, ma va presa prima del deploy.

**A13 — Grant asimmetrici in `initialize`**: assegna a `defaultAdmin_` solo UPGRADER, FEE_ADMIN, RECOVERER (+ admin); MINTER/BURNER/PAUSER/FREEZER/BLOCKER arrivano post-deploy via script. Non è un bug (least privilege) ma l'asimmetria non è documentata da nessuna parte — o si documenta la logica, o si uniforma (nessun ruolo operativo nell'init, tutti via script).

**A14 — Matrice ruoli target** (dopo spec + rename):

| Ruolo | Scopo | Note |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | grant/revoke ruoli | multisig, valutare AdminRules (A12) |
| `UPGRADER_ROLE` | upgrade UUPS | multisig |
| `MINTER_ROLE` / `BURNER_ROLE` | supply | invariati |
| `PAUSER_ROLE` | pause/unpause | usato nella procedura sweep |
| `FREEZER_ROLE` | freeze | API da rivedere (A8/D6) |
| `BLOCKER_ROLE` | blocklist | rename funzioni (A7) |
| `FEE_MANAGER_ROLE` | parametri transfer+custody fee | rename da FEE_ADMIN_ROLE [D2] |
| `CUSTODY_OPERATOR_ROLE` | sweep + startNewCycle | NUOVO, opzionale [D2] — per bot operativo |
| `RECOVERER_ROLE` | recovery | invariato |

---

## Decisioni aperte (da chiudere prima del coding)

| # | Domanda | Opzioni | Raccomandazione |
|---|---|---|---|
| **D1** | Transfer fee: dedotta dall'importo (attuale) o a carico del sender (spec)? | (a) dedotta — già implementata e testata; (b) surcharge sender — destinatario riceve importo pieno, sender paga `value + fee` | **(a)** salvo esigenza di business: il surcharge rompe l'aspettativa `balanceOf(sender) -= value` e richiede riscrittura completa di `_update` e dei 16 test fee |
| **D2** | Un ruolo fee o due? | (a) solo `FEE_MANAGER_ROLE`; (b) + `CUSTODY_OPERATOR_ROLE` per sweep/cicli | **(b)** — chiave bot con privilegi minimi |
| **D3** | Sweep su holder frozen/blocked? | (a) skip + evento `CustodySweepSkipped(holder, reason)`; (b) preleva comunque (bypass check) | **(a)** — un account congelato/bloccato è tale per motivi legali/security: meglio non muovere fondi e lasciare traccia; il ciclo NON viene marcato → recuperabile dopo unfreeze nello stesso ciclo |
| **D4** | Fee su ERC-1363/EIP-3009? | (a) uniforme su tutti i percorsi; (b) bypass attuale, documentato | **(a)** — elimina l'elusione e l'incoerenza doc/codice |
| **D5** | Cap transfer fee | (a) 100 bp; (b) mantenere 999 bp | **(a)** — segnale di trust per exchange/integratori; la spec parla di 1 bp operativo |
| **D6** | Semantica freeze parziale (A8): oggi qualsiasi importo frozen > 0 blocca TUTTO l'account | (a) freeze binario (rimuovere importi); (b) freeze parziale reale (check su `availableBalanceOf`) | dipende dal requisito compliance: se serve solo "congela account" → **(a)**, più semplice e onesto |
| **D7** | ERC-1363: implementazione custom o OZ ufficiale? | (a) migrare a `ERC1363Upgradeable` OZ; (b) tenere custom rinominata | **(a)** — codice audited, meno superficie; da verificare compatibilità con il bypass-fee scelto in D4 |
| **D8** | Ampiezza pulizia monitoring (A4) | (a) rimozione completa strato debug; (b) solo dead code | **(a)** — pre-mainnet è l'ultimo momento utile |

---

## Sequenza di lavoro proposta (dopo chiusura decisioni)

1. **Fix strutturali** (A1 slot ERC-7201, A2 `_spendAllowance`) + pulizia (A4/A5/A6, D8) — commit separati, test verdi a ogni passo
2. **Refactor naming** (A7, A8/D6, A9/D7, A11) + aggiornamento test e doc (AGENTS.md, roles.md, README, seguendo `aggiornamento_documenti.md`)
3. **Refactor transfer fee** (esenzioni enumerabili, rename API, D1/D4/D5)
4. **Nuova estensione custody fee** + implementazione in Token + piano test §2.6
5. **Validazione upgrade-safety** OZ + `forge coverage` ≥ target + redeploy fresco su Amoy
