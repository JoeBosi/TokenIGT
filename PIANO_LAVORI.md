# Piano lavori — TokenIGT

> Aggiornato: 2026-07-07 · Branch `2026706ClaudeCode` · Token v2.3.0
> Documento di stato + pianificazione. Da rileggere all'inizio della prossima sessione.

---

## 1. Dove siamo (stato al 2026-07-07)

### ✅ Fatto e verde
- **Contratti v2.1.0** completi: custody fee a cicli, transfer fee a doppia semantica,
  freeze/blocklist, recovery (`recoverNative`), UUPS, storage ERC-7201 conforme.
- **454 test** (262 Foundry + 192 Hardhat) tutti verdi; `Token.sol` 100% lines/branches.
- **CI verde** (ultima run PR e push: success). La CI ora installa le dipendenze npm,
  gira Foundry + Hardhat, ha un guard anti-file-duplicati.
- **Deploy Amoy v2.1.0**: proxy `0x2b307FabB36e54Fbd0257cE597D7bE277df84922`,
  implementation verificata su Polygonscan; ruoli distribuiti; smoke test on-chain ok.
- **Simulazione custody** collaudata in locale (profili stress + business):
  prelievo medio €10/utente/ciclo, gas ~35k/18k per holder, riconciliazione al wei.
- **Runbook** (`RUNBOOK_SWEEP.md`) con ordine vincolante **pausa → snapshot → sweep
  → verifica → unpause** + **indexer** collaudato end-to-end (`scripts/indexer/`).
- **Peg formalizzato** (`PEG_ORO.md`): 1 IGT = 2 g oro; detenzione media €2.000/utente.
- **Problema duplicati file RISOLTO**: causa = Google Drive che sincronizzava
  `~/Developer` (disinstallato); difese permanenti attive (.gitignore + pre-commit
  hook + guard CI). Script di backup snapshot pronto (`scripts/backup/backup_to_drive.sh`,
  rsync incrementale --delete) — da configurare quando l'utente vorrà.
- **PR #1 aperta** verso master: https://github.com/JoeBosi/TokenIGT/pull/1

### ⏸️ In pausa / rimandato per scelta
- **Prova di SCALA sweep su Amoy** (batch grandi, throughput): rimandata alle specifiche aggiuntive. La prova funzionale base è FATTA (AMOY_TEST_REPORT.md).
- **Backup su Drive**: script pronto, configurazione rimandata.

---

## 2. Prossimi lavori (da fare nelle prossime sessioni)

### A. Sistema di monitoraggio on-chain ⭐ (richiesta esplicita utente)
Alert se "succede qualcosa di strano" dal contratto. **Specifiche dettagliate → §3.**

### B. Prova generale sweep su Amoy — ✅ PRIMA PROVA FATTA (2026-07-08)
Deploy fresco v2.3.0 + integrazione on-chain + caveaux (sweep 6 holder,
riconciliazione al wei) tutti verdi — vedi `AMOY_TEST_REPORT.md`. Resta il
collaudo di SCALA (batch grandi ~300-700, throughput multi-tx/blocco, tempi di
pausa reali su molti holder) con le specifiche aggiuntive dell'utente.

### C. Chiusura pre-mainnet (bloccanti per il go-live)
- **Verifica ON-CHAIN di ENTRAMBI i contratti** (richiesta utente): implementation
  E proxy verificati su Polygonscan. Oggi verifichiamo solo l'implementation; il
  proxy (`ERC1967Proxy`) va verificato e **marcato come proxy** sull'explorer, così
  mostra "Read/Write as Proxy" con l'ABI dell'implementation. Da fare a ogni deploy
  (Amoy e mainnet). L'ABI PUBBLICA è corretta e desiderata (vedi nota sotto), NON un
  rischio di sicurezza.
- **Governance su multisig** (Safe) per DEFAULT_ADMIN + UPGRADER; valutare
  `AccessControlDefaultAdminRulesUpgradeable` + timelock.
- **Audit di sicurezza esterno** professionale.
- **Mutation testing** (skill `mutation-testing` / `mewt`) sull'intera suite.
- Peg nei NatSpec del contratto (al prossimo redeploy).

> **Nota sicurezza — ABI/codice pubblici sono la scelta GIUSTA.** La sicurezza di
> uno smart contract NON dipende dal nascondere ABI o sorgente ("security through
> obscurity" non funziona on-chain): il **bytecode è comunque pubblico** e da esso
> si ricavano selettori e ABI con strumenti standard; ogni transazione espone i
> selettori delle funzioni chiamate. La sicurezza viene da **access control +
> logica auditata**, non dall'occultamento. Verificare crea **fiducia** e abilita
> le integrazioni (wallet, DEX, explorer, indexer): per un token con sottostante
> reale, NON verificare è un segnale di sospetto e blocca l'adozione. Gli unici
> segreti restano **off-chain**: chiavi private e `.env`.

### D. Merge PR #1 in master (dopo la review dell'utente).

---

## 3. SPECIFICHE — Sistema di monitoraggio on-chain

### 3.1 Risposta alla domanda: "serve che tutto abbia un emit?"

**No, non serve un emit per ogni cosa** — e sarebbe pure controproducente
(gonfia gas e bytecode: è proprio ciò che abbiamo rimosso nella v2, decisione D8).
Il principio corretto:

- **Ciò che CAMBIA STATO deve emettere un evento** → e il nostro contratto lo fa
  già quasi ovunque (vedi §3.2). Gli eventi sono la fonte primaria per il monitoraggio.
- **Le funzioni `view` NON emettono** (giustamente: non cambiano nulla) → si
  monitorano **leggendole periodicamente** (polling) e confrontandole con soglie.
- Esistono **alternative/complementi** agli eventi (§3.3) per ciò che gli eventi
  non catturano (es. tentativi falliti, letture di stato, pattern tra più tx).

### 3.2 Copertura eventi attuale (v2.3.0)

**Già coperto** (26 tipi di evento tra standard OZ e dominio):
`Transfer` (incl. mint/burn con from/to=0), `Approval`, `Paused`/`Unpaused`,
`RoleGranted`/`RoleRevoked`, `Upgraded`, `Initialized`, `TransferFeeUpdated`,
`FeeCollectorUpdated`, `TransferFeeExemptionChanged`, `CustodyFeeUpdated`,
`CustodyTreasuryUpdated`, `CustodyFeeExemptionChanged`, `CycleStarted`,
`CustodyFeeCollected`, `Frozen`/`Unfrozen`, `Blocked`/`Unblocked`,
`AuthorizationUsed`/`AuthorizationCanceled`.

**GAP CHIUSO in codice (v2.3.0)** — aggiunto l'evento
`AssetRecovered(AssetKind kind, address asset, address to, uint256 amountOrTokenId, address executor)`
emesso da `recoverERC20`/`recoverNative`/`recoverERC721` (kind 0/1/2). Copre i
movimenti di fondi da parte del RECOVERER. **Manca solo il redeploy su Amoy** per
avere l'evento anche on-chain (il proxy attuale è ancora v2.1.0 senza l'evento).

### 3.3 Alternative/complementi agli eventi

| Tecnica | Cosa cattura | Quando serve |
|---|---|---|
| **Eventi** (log indicizzati) | tutto ciò che cambia stato | base del monitoraggio |
| **Polling di view** (multicall periodica) | valori di stato: `totalSupply`, `paused`, `transferFeeBps`, `custodyTreasury`, `currentCycle`, saldi treasury/collector | soglie e invarianti ("supply non deve superare X", "fee non deve cambiare senza preavviso") |
| **Trace / `debug_traceTransaction`** | chiamate interne e **revert** (i tentativi FALLITI non emettono eventi!) | rilevare attacchi tentati, revert anomali |
| **Mempool watching** | tx in arrivo prima della conferma | front-running, tx sospette verso funzioni admin |
| **Servizi gestiti** (OpenZeppelin Monitor, Tenderly Alerts, Forta) | alert configurabili su eventi + funzioni + soglie | soluzione pronta senza infra propria |

### 3.4 Regole di allerta proposte (bozza — da raffinare con l'utente)

**Critiche (alert immediato):**
- `RoleGranted`/`RoleRevoked` su DEFAULT_ADMIN o UPGRADER
- `Upgraded` (qualsiasi upgrade dell'implementation)
- `Paused` fuori da una finestra di sweep pianificata
- `FeeCollectorUpdated` / `CustodyTreasuryUpdated` (cambio destinatario fondi)
- movimento da/verso treasury o collector fuori dai cicli attesi
- (con il nuovo evento) `AssetRecovered` di qualsiasi importo

**Anomalie (alert di revisione):**
- `TransferFeeUpdated`/`CustodyFeeUpdated` verso valori vicino al cap
- `CycleStarted` non seguito dal completamento sweep entro la finestra
- picco di `Frozen`/`Blocked` in breve tempo
- `Transfer` di taglia anomala (> soglia sul supply)
- riconciliazione custodia: Σ `CustodyFeeCollected` ≠ delta treasury atteso

**Invarianti (polling periodico):**
- `totalSupply` coerente con mint/burn attesi
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
Opzioni realizzative: (a) servizio Node.js custom su questo repo; (b) OpenZeppelin
Monitor (open-source, self-hosted); (c) Tenderly/Forta (SaaS). Da scegliere in
base a budget e autonomia desiderata.

### 3.6 Attività per implementarlo (prossima volta)
1. Decidere l'architettura (custom vs servizio gestito) e il canale di alert.
2. ✅ `AssetRecovered` aggiunto al contratto (v2.3.0) — resta il **redeploy Amoy** per averlo on-chain.
3. Definire le soglie numeriche concrete con l'utente (cosa è "strano" per lui).
4. Prototipo listener + poller su Amoy sul contratto già deployato.
5. Runbook di risposta agli alert (chi fa cosa quando scatta).

---

## 4. Note operative permanenti
- **Mai** cartelle di codice dentro client di sync bidirezionale (Google Drive/
  OneDrive/Dropbox): creano copie di conflitto `nome (1)`. Backup = git push +
  Time Machine / script snapshot rsync.
- Difese anti-duplicati attive: `.gitignore`, pre-commit hook (`git config
  core.hooksPath .githooks` dopo il clone), guard CI.
- Ordine sweep **vincolante**: pausa → snapshot → sweep → verifica → unpause.
- Peg **vincolante**: 1 IGT = 2 g oro; detenzione media €2.000/utente.
