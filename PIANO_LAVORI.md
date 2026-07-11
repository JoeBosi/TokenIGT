# Piano lavori — TokenIGT

> Aggiornato: 2026-07-08 · Branch `2026706ClaudeCode` · Token v2.3.0
> Documento di stato + pianificazione. Da rileggere all'inizio della prossima sessione.

---

## 0. ⚠️ GATE — Code-freeze prima di mutation testing / audit esterno

**Riesame pre-redeploy del 2026-07-08** (workflow di review a 4 lenti: script,
env/doc, completezza pianificazione, sicurezza v2.4.0) ha trovato **1 problema
critico già risolto** e **1 rischio di design ancora aperto**, più una serie di
incoerenze doc minori (tutte corrette in questa stessa passata — vedi §1).

### 0.1 — RISOLTO: script di upgrade puntavano al mock di test
`upgrade_local/amoy/polygon.ts` chiamavano `getContractFactory("TokenV2")`, che
risolve `contracts/mocks/TokenV2.sol` — un fixture di test con `setNewVariable`
pubblica **senza access control** e un `initializeV2` front-runnabile. Un upgrade
mainnet reale verso quel bytecode sarebbe stato un disastro irreversibile per il
proxy. **Fix applicato**: gli script ora puntano a `Token` di produzione, rifiutano
nomi `Mock`/`TokenV2`/`TokenV3` salvo conferma esplicita solo su testnet, validano
lo storage layout (`validateUpgrade`), controllano il chainId e richiedono conferma
interattiva su mainnet. Collaudati a runtime end-to-end su nodo Hardhat persistente.

### 0.2 — DA DECIDERE: `FEE_MANAGER_ROLE` concentra troppo potere
`startNewCycle()` non ha alcun vincolo di intervallo minimo on-chain (il ciclo
"20 marzo" è solo convenzione off-chain). Lo stesso `FEE_MANAGER_ROLE` che deve
restare su una **chiave calda** (firma centinaia di tx per lo sweep) può anche:
aprire cicli a piacere, alzare `custodyFeeBps`/`transferFeeBps` fino al cap,
reindirizzare `feeCollector`/`custodyTreasury` verso sé stesso. Lo sweep bypassa
pause/freeze/blocklist by design (D3): **`pause()` NON è un rimedio se questa
chiave è compromessa** — servirebbe `revokeRole` dall'admin (multisig, più lento).
→ **Decisione richiesta all'utente**: vedi domande in fondo al documento.

### 0.3 — Consolidamento modifiche al contratto (v2.4.0, un solo redeploy)
Prima di mutation testing e audit esterno, congelare TUTTE le modifiche al
sorgente in un'unica versione (altrimenti mutation/gas-baseline vanno rifatti, e
se le modifiche arrivassero "al redeploy" DOPO l'audit, il bytecode auditato
differirebbe da quello deployato). Elenco consolidato — **in attesa delle
decisioni dell'utente** prima di implementare:

| # | Modifica | Stato | Decisione |
|---|---|---|---|
| a | `ContractURIsUpgradeable` (`websiteURI`, `reserveInfoURI`) | **Spec pronta** (§E6, interfaccia esatta) | Solo conferma per procedere |
| b | NatSpec del peg (1 IGT = 2g, da PEG_ORO.md) | Banale, zero rischio | Procedo appena sbloccato |
| c | `version()` → `"2.4.0"` | Banale | — |
| d | Split `FEE_MANAGER_ROLE` (es. `SWEEPER_ROLE` operativo + `FEE_ADMIN_ROLE` di governance su multisig) | Progettato, non implementato | **Serve la tua decisione (§0.2)** |
| e | `minCycleInterval` on-chain per `startNewCycle` | Progettato, non implementato | **Serve la tua decisione (§0.2)** |
| f | `AccessControlDefaultAdminRulesUpgradeable` (+ eventuale timelock) | Da valutare | **Serve la tua decisione** |
| g | `contractURI()` ERC-7572 (opzionale) | Da valutare | **Serve la tua decisione** |

---

## 1. Dove siamo (stato al 2026-07-08)

### ✅ Fatto e verde
- **Contratti v2.3.0** completi: custody fee a cicli, transfer fee a doppia semantica,
  freeze/blocklist, recovery (`recoverNative` + evento `AssetRecovered`), UUPS,
  storage ERC-7201 conforme (2 audit dedicati: `AUDIT_EVENTI.md`, `AUDIT_STORAGE.md`).
- **454 test** (262 Foundry + 192 Hardhat) tutti verdi; `Token.sol` 100% lines/branches.
- **CI rinforzata**: Slither (`--fail-medium`, job dedicato) + gas snapshot regression
  (tolleranza 3%) oltre a Foundry/Hardhat/fmt/build-sizes/guard anti-duplicati.
- **Deploy Amoy v2.3.0 ATTIVO** (proxy `0x479DE4c471a88c0AFdf24e9E5462555BBab03BcC`,
  implementation verificata) — sostituisce la v2.1.0, ormai storica/deprecata.
  Include già `AssetRecovered` e gli eventi di config iniziale.
- **Test on-chain completi**: integrazione (fee/freeze/block/pause/recovery) +
  **caveaux** (sweep con riconciliazione al wei) — `AMOY_TEST_REPORT.md`.
- **Script deploy/upgrade/ruoli auditati e corretti** (§0.1); nuovo
  `scripts/roles/finalize_governance.ts` per l'handover verso multisig, collaudato
  end-to-end (grant → verifica → renounce, guard anti-lockout su `revoke_roles.ts`).
- **Runbook**: `RUNBOOK_SWEEP.md` (custodia, ordine vincolante pausa→snapshot→sweep
  →verifica→unpause) e `RUNBOOK_INCIDENT.md` (emergenze: pausa, chiave compromessa,
  collector/treasury compromessi, upgrade d'emergenza, comunicazione).
- **Peg formalizzato** (`PEG_ORO.md`): 1 IGT = 2 g oro; detenzione media €2.000/utente.
- **Documentazione riallineata** (2026-07-08): CLAUDE.md (FEE_MANAGER, cap corretti),
  DEPLOYMENT.md (indirizzi v2.3.0, RPC publicnode, procedura verify a 2 step),
  .env.example (RPC mainnet, nota collector≠treasury, GOVERNANCE_ADMIN), roles.md,
  RUNBOOK_SWEEP.md, aggiornamento_documenti.md.
- **Problema duplicati file RISOLTO**: causa = Google Drive che sincronizzava
  `~/Developer` (disinstallato); difese permanenti attive (.gitignore + pre-commit
  hook + guard CI).
- **PR #1 aperta** verso master: https://github.com/JoeBosi/TokenIGT/pull/1

### ⏸️ In pausa / rimandato per scelta
- **Prova di SCALA sweep su Amoy** (batch grandi, throughput): rimandata alle
  specifiche aggiuntive dell'utente. La prova funzionale base è FATTA.
- **Backup su Drive**: script pronto (`scripts/backup/backup_to_drive.sh`), non configurato.
- **v2.4.0** (§0.3): in attesa delle decisioni di design/governance.

---

## 2. Prossimi lavori

### A. Sistema di monitoraggio on-chain ⭐ (richiesta esplicita utente)
Alert se "succede qualcosa di strano" dal contratto. Specifiche → §3.
Da estendere con gli eventi `WebsiteURIUpdated`/`ReserveInfoURIUpdated` (v2.4.0,
allarme di priorità massima: sono il puntatore di fiducia del proof-of-reserve) e
con l'invariante `totalSupply ≤ grammi_attestati / 2` (vedi E6, procedura mint↔attestazione).

### B. Prova di scala sweep su Amoy
Batch 300-700, multi-tx/blocco, eventualmente multi-operatore. Da eseguire
**prima** del code-freeze (§0.3): se emergesse la necessità di più operatori
paralleli, rinforzerebbe la decisione di split del ruolo (§0.2/d).

### C. Chiusura pre-mainnet (bloccanti per il go-live)
- **ABI di ENTRAMBI leggibili ON-CHAIN**: implementato in `verify.ts` (verifica
  implementation + marca il proxy via API Etherscan-V2/Polygonscan). Da rieseguire
  a ogni deploy.
- **Governance su multisig** (Safe) per DEFAULT_ADMIN + UPGRADER — vedi §0.2/f e
  il nuovo `GOVERNANCE.md` (template da compilare con i dati reali del Safe).
- **Audit di sicurezza esterno** professionale — DOPO il code-freeze v2.4.0.
- **Mutation testing** sull'intera suite — DOPO il code-freeze v2.4.0 (altrimenti
  va rifatto).
- **Redeploy pulito** (E3, aggiornato) con la coreografia di handover collaudata.

> **Nota sicurezza — ABI/codice pubblici sono la scelta GIUSTA.** La sicurezza di
> uno smart contract NON dipende dal nascondere ABI o sorgente: il bytecode è
> comunque pubblico. La sicurezza viene da **access control + logica auditata**.
> Verificare crea fiducia e abilita le integrazioni; per un token con sottostante
> reale, NON verificare è un segnale di sospetto. Gli unici segreti restano
> **off-chain**: chiavi private e `.env`.

### D. Merge PR #1 in master (dopo la review dell'utente)

### E. Altri punti (dettaglio granulare)

> Gli aspetti regolatori (MiCA/legali) sono **esclusi** — non competono al
> livello di programmazione.

**E1 — Slither in CI** ✅ FATTO (job dedicato, `--fail-medium`)

**E2 — Gas snapshot regression** ✅ FATTO (`.gas-snapshot`, tolleranza 3%, esclusi fuzz/invariant)

**E3 — Redeploy PULITO pre-mainnet** (aggiornato dopo la review)
- **E3-pre**: congelare il sorgente v2.4.0 (§0.3) — NatSpec peg, URI, eventuale
  split ruoli/DefaultAdminRules, bump versione. Fare PRIMA di E3a.
- E3a: valori DEFINITIVI di **tutti** i parametri di `initialize` (non solo
  fee/collector/treasury/admin): `name`/`symbol` (**irreversibili**: entrano nel
  dominio EIP-712 di Permit/EIP-3009), `initialSupply`, `initialHolder`, più gli
  URI se v2.4.0 li aggiunge. Da versionare in un file di config unico usato sia
  da Amoy sia da mainnet.
- E3b: distribuzione dei ruoli operativi agli INDIRIZZI REALI — scriptata
  (`scripts/roles/finalize_governance.ts`, ✅ pronto e collaudato).
- E3c: handover della governance al multisig + `renounceRole` del deployer —
  stessa funzione di `finalize_governance.ts` (grant → verifica → renounce, mai
  un istante senza admin). ✅ pronto e collaudato.
- E3d: verifica on-chain di ENTRAMBI (proxy marcato + implementation) — `verify.ts`
  aggiornato, ✅ pronto.
- E3e: smoke test on-chain + salvataggio indirizzi/deployBlock in `deployments/`
  (già implementato nei deploy script aggiornati) + **aggiornare la config del
  futuro monitoraggio** (nuovo proxy/implementation attesa/soglie).
- **Nuovo**: `GOVERNANCE.md` — mappa ruolo→indirizzo→tipo di chiave→detentore per
  la produzione (Safe: soglia, firmatari; quali ruoli sul Safe vs EOA calde). Da
  scrivere con i dati reali dell'utente (template pronto, vedi §E3-doc sotto).
- **Nuovo**: procedura mint↔attestazione oro per il day-1 mainnet — "si minta solo
  a fronte di grammi attestati", prima attestazione pubblicata su `reserveInfoURI`
  PRIMA del mint mainnet. Da scrivere in `PEG_ORO.md` o `RUNBOOK_MINT.md`.
- **Nuovo**: `RUNBOOK_UPGRADE.md` — procedura di upgrade ORDINARIO (non emergenza,
  quello è E4d): differential-review, validateUpgrade, aggiornamento del guardiano
  storage, esecuzione via Safe, verifica on-chain di entrambe le ABI.

**E4 — Runbook di incident response** ✅ FATTO (`RUNBOOK_INCIDENT.md`, E4a-e)

**E5 — Bug bounty** (processo) — pre/post-mainnet, in coda all'audit esterno.

**E6 — Proof of reserves dell'oro**
- E6a: attestazioni periodiche del custode / audit del caveau (processo).
- **E6b — spec pronta**: `ContractURIsUpgradeable` (nuova estensione dedicata,
  namespace ERC-7201 `advanced.token.contracturis.storage`, slot
  `0x2f61fe546e652f7829573e78b47106428dbe11840b9f360ee3179ad8b6e33700`):
  ```solidity
  struct ContractURIsStorage { string websiteURI; string reserveInfoURI; }
  event WebsiteURIUpdated(string previousURI, string newURI);       // non-indexed
  event ReserveInfoURIUpdated(string previousURI, string newURI);   // non-indexed
  function setWebsiteURI(string calldata) public onlyRole(DEFAULT_ADMIN_ROLE);
  function setReserveInfoURI(string calldata) public onlyRole(DEFAULT_ADMIN_ROLE);
  ```
  Setter su **DEFAULT_ADMIN_ROLE** (non un ruolo operativo): `reserveInfoURI` è il
  puntatore di fiducia del token — se il setter fosse su una chiave operativa
  compromessa, un attaccante potrebbe reindirizzare a un sito di phishing con
  attestazioni false. Nessun parametro in `initialize`, nessun `reinitializer`:
  default vuoto + set post-deploy da script (coerente col pattern esistente).
  Bytecode: +1,2/2 KB stimati, margine EIP-170 ampio (oggi +5,45 KB). Impatti test:
  access control su entrambe le suite, estensione `TokenStorageLayoutTest`
  (stringhe corte ≤31 byte e lunghe), test di upgrade 2.3.0→2.4.0.
- E6c: stesso link anche OFF-CHAIN sul profilo token Polygonscan (zero codice).
- E6d: `websiteURI` copre anche la landing della SOCIETÀ (stesso campo/pattern di E6b).
- E6e: (dopo, prova vera — contratto SEPARATO, non tocca il token) `ProofOfReserve`
  con grams+auditor+documentHash+documentURI(IPFS)+evento, ruolo `ATTESTOR_ROLE`.
- E6f: oracolo delle riserve — **escluso per ora**, si parte in manuale.

**E7 — Metadati post-lancio** (branding/off-chain):
E7a logo+info Polygonscan · E7b token list · E7c aggregatori · E7d wallet.

---

## 3. SPECIFICHE — Sistema di monitoraggio on-chain

### 3.1 "Serve che tutto abbia un emit?"
**No.** Ciò che cambia stato già emette (v2.3.0: 27 tipi di evento, incluso
`AssetRecovered` e la config iniziale — `AUDIT_EVENTI.md`). Le view si monitorano
via polling; i tentativi falliti/revert via trace; alternative: OpenZeppelin
Monitor, Tenderly, Forta.

### 3.2 Copertura eventi attuale (v2.3.0)
Completa — vedi `AUDIT_EVENTI.md` per la matrice funzione→evento. Da estendere in
v2.4.0 con `WebsiteURIUpdated`/`ReserveInfoURIUpdated`.

### 3.3 Alternative/complementi agli eventi

| Tecnica | Cosa cattura | Quando serve |
|---|---|---|
| **Eventi** (log indicizzati) | tutto ciò che cambia stato | base del monitoraggio |
| **Polling di view** (multicall periodica) | `totalSupply`, `paused`, `transferFeeBps`, `custodyTreasury`, `currentCycle`, saldi treasury/collector | soglie e invarianti |
| **Trace / `debug_traceTransaction`** | chiamate interne e **revert** (i tentativi FALLITI non emettono eventi!) | rilevare attacchi tentati |
| **Mempool watching** | tx in arrivo prima della conferma | front-running, tx sospette |
| **Servizi gestiti** (OpenZeppelin Monitor, Tenderly, Forta) | alert configurabili | soluzione pronta |

### 3.4 Regole di allerta proposte (bozza — da raffinare con l'utente)

**Critiche (alert immediato):**
- `RoleGranted`/`RoleRevoked` su DEFAULT_ADMIN, UPGRADER **o il ruolo che gestisce lo sweep** (vedi §0.2)
- `Upgraded` (qualsiasi upgrade dell'implementation)
- `Paused` fuori da una finestra di sweep pianificata
- `FeeCollectorUpdated` / `CustodyTreasuryUpdated`
- `AssetRecovered` di qualsiasi importo
- (v2.4.0) `WebsiteURIUpdated` / `ReserveInfoURIUpdated` — priorità massima
- movimento da/verso treasury o collector fuori dai cicli attesi

**Anomalie (alert di revisione):**
- `TransferFeeUpdated`/`CustodyFeeUpdated` verso valori vicino al cap
- `CycleStarted` non seguito dal completamento sweep entro la finestra (o troppo
  ravvicinato al precedente — vedi §0.2)
- picco di `Frozen`/`Blocked` in breve tempo
- `Transfer` di taglia anomala
- riconciliazione custodia: Σ `CustodyFeeCollected` ≠ delta treasury atteso

**Invarianti (polling periodico):**
- `totalSupply` coerente con mint/burn attesi
- (v2.4.0/E6) `totalSupply ≤ grammi_attestati / 2`
- `custodyTreasury` e `feeCollector` == indirizzi noti
- `transferFeeBps ≤ 100`, `custodyFeeBps ≤ 200`
- proxy implementation == indirizzo verificato atteso

### 3.5 Architettura proposta
```
Polygon RPC ──▶ Listener eventi (ethers/viem WebSocket o polling getLogs)
             ├─▶ Poller di stato (multicall ogni N blocchi)
             └─▶ Motore regole (soglie/invarianti) ──▶ Alert (Telegram/email/PagerDuty)
                                                     └─▶ Log/DB per audit
```
Opzioni: (a) servizio Node.js custom; (b) OpenZeppelin Monitor (self-hosted);
(c) Tenderly/Forta (SaaS).

### 3.6 Attività per implementarlo
1. Decidere l'architettura e il canale di alert.
2. Definire le soglie numeriche concrete con l'utente.
3. Prototipo listener + poller — da fare **dopo** il redeploy pulito (E3), sul
   proxy e l'implementation definitivi (non su quello di test attuale).
4. Runbook di risposta agli alert.

---

## 4. Note operative permanenti
- **Mai** cartelle di codice dentro client di sync bidirezionale (Google Drive/
  OneDrive/Dropbox): creano copie di conflitto `nome (1)`. Backup = git push +
  Time Machine / script snapshot rsync.
- Difese anti-duplicati attive: `.gitignore`, pre-commit hook (`git config
  core.hooksPath .githooks` dopo il clone), guard CI.
- Ordine sweep **vincolante**: pausa → snapshot → sweep → verifica → unpause.
- Peg **vincolante**: 1 IGT = 2 g oro; detenzione media €2.000/utente.
- **Mai** upgrade script che puntino a contratti in `contracts/mocks/` (§0.1).

---

## 5. Domande aperte per l'utente (blocco per il code-freeze v2.4.0)

1. **Split del ruolo di sweep** (§0.2/d): vuoi separare un `SWEEPER_ROLE`
   operativo (solo `startNewCycle`+`sweepCustodyFee`, su chiave calda) da un
   `FEE_ADMIN_ROLE` di governance (setter di bps/collector/treasury/esenzioni,
   su multisig)? Oggi è tutto unificato in `FEE_MANAGER_ROLE`.
2. **`minCycleInterval`** (§0.2/e): vuoi un vincolo ON-CHAIN sulla frequenza
   minima tra un `startNewCycle()` e il successivo (es. ~300 giorni), o la
   convenzione resta solo procedurale (off-chain, come oggi)?
3. **`AccessControlDefaultAdminRulesUpgradeable`** (+ eventuale timelock): la
   adottiamo per il trasferimento dell'admin in due passi con delay, o teniamo
   la protezione puramente procedurale ("mai un solo admin", AGENTS §16.11)?
4. **`contractURI()` ERC-7572** (opzionale): interessa, come contenitore
   standard riconosciuto da explorer/marketplace, oltre a `websiteURI`/`reserveInfoURI`?
5. Confermi che posso procedere a implementare **E6b** (`ContractURIsUpgradeable`,
   spec sopra) subito, indipendentemente dalle risposte 1-4?
