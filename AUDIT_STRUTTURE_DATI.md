# Audit — liste, mapping e strutture dati del contratto IGT

> Data: 2026-07-12 · Metodo: workflow a 7 agenti (una struttura per agente) +
> verifica avversariale su ogni presunto bug (uno skeptic tenta di confutarlo) +
> ri-verifica manuale del finding critico. Scope: tutte le strutture
> indirizzo-chiave e di config in `contracts/`.
>
> **✅ STATO — RISOLTO in v2.5.0 (2026-07-13).** Tutti i problemi confermati
> (§1: A1-A5) sono stati corretti con i relativi test (561 test verdi). Le
> migliorie a costo basso sono state applicate SOLO nella misura compatibile con
> l'EIP-170 (Token.sol a 24.082 B, margine 494): `isRestricted`,
> `getTransferFeeExemptCount`/`getCustodyFeeExemptCount`, `unchecked ++i`, setter
> ContractURIs `external`. Le restanti migliorie §4 (mutatori/view batch, preview
> esenzione-aware, `previewCustodyFee`, getter `…ExemptAt`) sono state **rinviate
> per non sforare l'EIP-170** — non sono bug. Dettaglio in CHANGELOG.md [2.5.0].

## Verdetto sintetico

La struttura dati è **nel complesso solida e coerente**. Access control corretto su
tutti i mutatori, idempotenza dove attesa, invarianti chiave rispettate
(`lastSweptCycle ≤ currentCycle` strutturale, conservazione dei saldi, storage
ERC-7201 senza collisioni, cast `uint16` protetti dai cap). **1 problema di
correttezza serio confermato** (EIP-3009), il resto sono nit minori o migliorie.

---

## 1. Problemi confermati (in ordine di severità)

### 🔴 A1 — EIP-3009: `receiveWithAuthorization` usa il typehash sbagliato
`contracts/extensions/ERC20EIP3009Upgradeable.sol` L30-32, L103, L164.

`receiveWithAuthorization` e `transferWithAuthorization` chiamano lo **stesso**
`_validateAuthorization`, che usa un **unico** `TYPE_HASH =
keccak256("TransferWithAuthorization(...)")`. Lo standard EIP-3009 richiede per il
percorso *receive* il typehash **distinto** `ReceiveWithAuthorization(...)`. Qui non
esiste. Due conseguenze reali:

1. **Interoperabilità rotta (certa):** un wallet/SDK conforme a EIP-3009 firma il
   receive con `ReceiveWithAuthorization` → digest diverso → `ECDSA.recover` ≠ `from`
   → revert `InvalidSignature`. Le firme *receive* standard sono inutilizzabili
   contro questo contratto.
2. **Protezione anti-front-running vanificata:** poiché il digest è identico a quello
   di *transfer*, una firma pensata SOLO per `receiveWithAuthorization` (protetta da
   `to == msg.sender`, quindi eseguibile solo dal destinatario) può essere eseguita da
   **chiunque** via `transferWithAuthorization` (che quel check non ce l'ha). L'attaccante
   fa front-run, esegue il transfer, brucia il nonce; il successivo
   `receiveWithAuthorization` del destinatario reverta `AuthorizationAlreadyUsed`.

**Importante — NON è furto di fondi:** i parametri (`from,to,value`) sono firmati,
quindi il trasferimento va comunque a `to` per il valore giusto. Il danno è
(a) rottura di conformità/interop e (b) **DoS/griefing sul pattern di "pull atomico"**
usato dagli integratori (un contratto che chiama `receiveWithAuthorization` nella
propria logica può essere fatto fallire da chi pre-esegue il transfer).

**Perché i test non l'hanno preso:** la suite firma il receive con
`TRANSFER_WITH_AUTHORIZATION_TYPEHASH` (`TokenEIP3009Test.t.sol` L397-398, ecc.), cioè
è stata scritta *contro* l'implementazione non conforme. Va aggiunto un test che firma
con `ReceiveWithAuthorization` e uno che dimostra il replay cross-path.

**Fix:** introdurre `RECEIVE_WITH_AUTHORIZATION_TYPEHASH` e parametrizzare
`_validateAuthorization` sul typehash (Transfer dal percorso transfer, Receive dal
percorso receive). Nessun impatto sullo storage layout ERC-7201. Cambia lo schema di
firma → i client vanno coordinati. **Da fare prima del mainnet** (oggi siamo solo su
Amoy di test: nessuna esposizione live).

### 🟡 A2 — Evento `ContractURIUpdated` non conforme a ERC-7572
`contracts/extensions/ContractURIsUpgradeable.sol` L42, L97. *(verdetto: confermato
tecnicamente, severità declassata a bassa/informativa)*

L'evento è `ContractURIUpdated(string previousURI, string newURI)`; lo standard
ERC-7572 definisce `event ContractURIUpdated()` **senza parametri**. Il `topic0` è
quindi diverso e un indexer ERC-7572 (es. marketplace) non riceve la notifica di
refresh dei metadati. **Basso impatto:** il getter `contractURI()` è pienamente
conforme, il contratto non dichiara formalmente `IERC7572`, la firma parametrica è
documentata (API.md/AGENTS.md §15) e utile al monitoraggio interno; per un ERC-20 su
Polygon la platea di indexer che ascoltano quel topic è ristretta. **Fix a costo
nullo:** emettere ANCHE l'evento canonico parameterless accanto a quello ricco.

### ⚪ A3 — `initialize`: mint iniziale saltato in silenzio se supply>0 ma holder==0
`contracts/Token.sol` L133. *(nit, alta confidenza)*

`if (initialSupply_ > 0 && initialHolder_ != address(0)) _mint(...)`: con
`initialSupply_>0` e `initialHolder_==address(0)` (errore di config/script) non si
minta e non si reverta → token con `totalSupply()==0` senza segnale. **Fix fail-fast:**
revert se `initialSupply_>0 && initialHolder_==address(0)`. Solo init, nessun impatto
storage, si applica ai deploy freschi futuri.

### ⚪ A4 — Eventi spuri `Frozen(0)` / `Blocked(0)`
`ERC20FreezableUpgradeable.sol` L48-66, `ERC20BlocklistUpgradeable.sol` L48-66. *(nit)*

Manca la guardia zero-address: `freeze(address(0))`/`blockAccount(address(0))`
scrivono stato inutile ed emettono un evento che nessun transfer leggerà mai
(`_runSecurityChecks` esce prima su address(0)). Solo igiene dei log. **Fix:**
`require(account != address(0))` in entrambe le coppie di mutatori.

### ⚪ A5 — `_transferFrom1363`: over-charge di allowance se `from == feeCollector`
`contracts/Token.sol` L272 vs L246-248. *(nit, edge strettissimo)*

L'allowance è consumata per il LORDO (`value+fee`), ma se `from==feeCollector` la gamba
fee è saltata (la fee resta al mittente) e da `from` escono solo `value` token: lo
spender vede l'allowance calare di `value+fee` a fronte di `value` mossi. Richiede che
il mittente sia proprio il collector e che un terzo abbia allowance da lui. Innocuo in
pratica; correggibile calcolando l'allowance sul lordo effettivamente pagato.

---

## 2. Segnalazioni analizzate e SCARTATE (falsi positivi, verificate)

- **Custody: nessun evento quando `fee==0`** (holder marcato swept senza
  `CustodyFeeCollected`). **NON è un bug:** scelta di design documentata (SPEC §2.4,
  AUDIT_EVENTI Gap 2). Il monitoraggio ricostruisce i processati dal *getter*
  `lastSweptCycle` e dalla calldata, non da quell'evento; emetterlo a 0 sporcherebbe la
  riconciliazione contabile. Coperto dai test.
- **Custody: `custodyFeeBps` non "congelato" a inizio ciclo** (batch diversi con
  aliquote diverse se FEE_ADMIN cambia bps a metà sweep). **NON è un bug:** lettura live
  documentata (SPEC), stessa logica per treasury e balance; raggiungibile solo con
  misuse del multisig FEE_ADMIN a metà procedura, contro il runbook; contenuto dal cap
  (≤2%) e dallo split di ruolo. Al più un hardening opzionale (snapshot per ciclo).

---

## 3. Completezza dei metodi per struttura

| Struttura | add | del | query singola | LISTA on-chain | COUNT/paginazione |
|---|:---:|:---:|:---:|:---:|:---:|
| Ruoli (AccessControl) | grant | revoke | hasRole | ✗ (eventi) | ✗ |
| Congelati (frozen) | freeze | unfreeze | isFrozen | ✗ (eventi) | ✗ |
| Bloccati (blocked) | block | unblock | isBlocked | ✗ (eventi) | ✗ |
| Esenti transfer fee | add | remove | is… | ✓ getList (unbounded) | ✗ **manca count** |
| Esenti custody fee | add | remove | is… | ✓ getList (unbounded) | ✗ **manca count** |
| authorizationState (3009) | (firma) | — | authorizationState | ✗ (per design) | ✗ |
| ContractURIs (3 stringhe) | set… | — | …URI() | — | ✗ (no getter aggregato) |

Pattern corretto: enumerabile solo per i set piccoli/limitati (esenzioni),
mapping+eventi per i set potenzialmente grandi (frozen/blocked/ruoli). Vedi §4 per le
migliorie di completezza.

---

## 4. Migliorie (non-bug) — vantaggio e costo

**Alto valore, costo basso (solo view, nessun cambio storage):**
- `…ExemptCount()` + `…ExemptAt(i)` sui due EnumerableSet esenzioni → paginazione e
  dimensione on-chain senza scaricare l'array unbounded (che a set grande sfora il
  gas-cap di `eth_call`). *Solo view.*
- `previewNet(from,to,…)`/`previewGross(from,to,…)` esenzione-aware e
  `previewCustodyFee(holder)` → integratori/holder stimano correttamente fee reali
  (oggi le preview ignorano le esenzioni). *Solo view.*
- `isRestricted(address)` = `blocked || frozen` → una sola chiamata autorevole per
  gli exchange invece di replicare `_runSecurityChecks`. *Solo view.*

**Ergonomia operativa (nuove funzioni, no storage):**
- `freezeBatch/unfreezeBatch` e `blockAccounts/unblockAccounts` con bound sulla
  lunghezza → risposta rapida a incidenti su molti account in una tx.
- Getter aggregato `getContractURIs()` → 1 RPC invece di 3.

**Gas / stile (micro, no storage):**
- `unchecked { ++i }` nel loop di `sweepCustodyFee` → risparmio su batch grandi.
- Setter ContractURIs `external` invece di `public`; `SafeCast.toUint16` sui bps
  (difesa in profondità, cast già sicuri per i cap).

**Osservabilità (richiede coordinamento off-chain):**
- Operatore `indexed` negli eventi `Frozen/Blocked` → audit trail di *chi* ha agito.
- Emettere l'evento canonico ERC-7572 (vedi A2).

**Struttura (valutare, non urgente):**
- Enumerable per frozen/blocked (lista+count on-chain): utile per compliance, ma
  aumenta gas per op e va aggiunto come **campo NUOVO accanto al mapping** (append-only,
  upgrade-safe) — non sostituendo il mapping. Da decidere in base al reale bisogno.
- Base astratta comune per Freezable/Blocklist (oggi byte-identici a meno dei nomi):
  DRY, ma aumenta la complessità dell'ereditarietà. Beneficio marginale.

---

## 5. Nota sul contesto

Il contratto è deployato **solo su Amoy di test**: nessuna esposizione su fondi reali.
Tutti i fix sopra (incluso A1) rientrano naturalmente nel **redeploy pulito
pre-mainnet** già pianificato (TODO.md punto 6), e vanno comunque nella lista di cose
da sistemare **prima dell'audit esterno**, così l'auditor parte da un codice già ripulito.
