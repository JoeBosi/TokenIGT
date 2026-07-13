# TODO — Token IGT

> Aggiornato: 2026-07-11 · Branch `2026706ClaudeCode` · Token **v2.4.0** (deployata su Amoy)
> Stato completo e cronologia in `PIANO_LAVORI.md`. Questo file = lista operativa
> in **ordine cronologico** verso il mainnet, con distinzione tra cosa possiamo
> fare **NOI** (nessun ente esterno) e cosa richiede un **ENTE ESTERNO**.

---

## ⬜ Da fare — in ordine cronologico

### 1. ~~Campagna di mutation testing~~ — ✅ FATTO (2026-07-12)
Campagna mewt completa (917 mutanti, 855 catturati / 56 sopravvissuti / 6 skipped).
I 56 sopravvissuti analizzati: 44 equivalenti (documentati), 12 buchi reali della
suite chiusi con nuovi test → mutation score 100% sui non-equivalenti. Dettaglio
in `MUTATION_TESTING.md`.

### 2. Compilare `GOVERNANCE.md` con i dati reali — 🟢 NOI (serve decisione utente)
12 campi `<...>` da riempire: indirizzo del Safe, soglia M-of-N, firmatari, tipo
di chiave per ruolo, delay di governance. È il documento che l'audit esterno userà
per valutare il trust model. Richiede le tue decisioni, non un ente esterno.

### 3. Creare il multisig (Safe) + handover della governance — 🟢 NOI
Creare il Safe su Polygon, poi eseguire l'handover a due fasi con gli script già
pronti e collaudati (`finalize_governance.ts` → attesa delay → `accept_governance.ts`).
Il contratto è già predisposto (`AccessControlDefaultAdminRules`). **Nessun ente esterno.**

### 4. Sistema di monitoraggio on-chain — 🟢 NOI
Alert su eventi critici (RoleGranted/Upgraded/Paused/FeeCollectorUpdated/
ReserveInfoURIUpdated…) + invarianti via polling. Specifiche pronte in
`PIANO_LAVORI.md §3`. Da costruire (Node listener o OZ Monitor/Tenderly).
**Nessun ente esterno** (salvo eventuale SaaS di alerting, opzionale).

### 5. Audit di sicurezza esterno — 🔴 ENTE ESTERNO (bloccante go-live)
Audit professionale da una società specializzata. Da fare a code-freeze v2.4.0
raggiunto (adesso). È l'unico passo che richiede necessariamente un ente terzo.

### 6. Redeploy PULITO pre-mainnet — 🟢 NOI (dopo l'audit)
Con i valori DEFINITIVI di *tutti* i parametri di `initialize` (name/symbol sono
**irreversibili**: entrano nel dominio EIP-712 di Permit/EIP-3009), gli URI, e la
coreografia di handover. Su Amoy prima, poi mainnet.

### 7. Deploy su Polygon mainnet — 🟢 NOI (conferma esplicita utente)
Solo a fine di tutto quanto sopra.

### 8. Metadati post-lancio — 🟢 NOI
Logo/info su Polygonscan, token list, aggregatori, wallet.

---

## 🟢 Altri lavori self-doable (non bloccanti, quando serve)

- **Proof of reserve — parte on-chain**: pubblicare le attestazioni su
  `reserveInfoURI` (pagina landing), poi eventuale contratto `ProofOfReserve`
  separato (`ATTESTOR_ROLE`). La parte *contratto/pagina* è NOI; le *attestazioni
  del custode* dell'oro richiedono il custode/auditor (ente esterno).
- **Prova di scala sweep più grande** (batch 300-700, multi-operatore): la base
  (100 holder) è FATTA; estendere è NOI, quando serve.
- **Bug bounty**: setup del processo è NOI; la piattaforma/pool è opzionale.
- **Backup automatico**: script pronto (`scripts/backup/backup_to_drive.sh`), da
  configurare.

## 🔴 Dipendenze da enti esterni (fuori dal nostro controllo diretto)

- **Audit di sicurezza esterno** (punto 5) — bloccante.
- **Attestazioni del custode dell'oro** — necessarie per il proof of reserve reale
  e per la disciplina mint↔grammi (day-1 mainnet). Le fornisce il custode/auditor.

---

## ⚠️ Problemi noti / da tenere d'occhio

1. **`GOVERNANCE.md` ancora template** (12 campi `<...>`): finché non è compilato,
   il documento non è pronto per l'audit né per il redeploy pulito. → punto 2.
2. **Mutation testing COMPLETO**: nessun bug di contratto trovato. I 12 buchi erano
   lacune della suite (regioni di input non esercitate), tutti chiusi; 44 mutanti
   equivalenti documentati. Non è più un problema aperto (MUTATION_TESTING.md).
3. **Deploy Amoy = deploy di TEST**: config modificata durante i test (collector/
   treasury su `0x…FEE1/FEE2`, ruoli al deployer, cicli avanzati). Il mainnet
   riparte pulito da `initialize`. Non è un bug, ma va ricordato.
4. **Repo fuori da servizi di sync** (iCloud/Drive): difese anti-duplicati attive
   (.gitignore + hook + guard CI). Non spostare il repo dentro cartelle sincronizzate.

---

## ✅ Fatto (sintesi — dettaglio in PIANO_LAVORI.md, CHANGELOG.md, AMOY_TEST_REPORT.md, MUTATION_TESTING.md)

- **v2.0.0 → v2.4.0**: custody fee a cicli, transfer fee a doppia semantica,
  freeze/blocklist, recovery, storage ERC-7201, split ruoli `FEE_ADMIN`/`SWEEPER`,
  `ContractURIsUpgradeable`, governance a due fasi (`AccessControlDefaultAdminRules`).
- **546 test verdi** (327 Foundry + 219 Hardhat); Token.sol 100% lines/branches.
- **CI** verde: Foundry + Hardhat + `forge fmt` + `forge build --sizes` (skip mock
  TokenV3 per EIP-170) + Slither (`--fail-medium`) + gas snapshot regression.
- **Deploy Amoy v2.4.0** verificato + test on-chain (integrazione, caveaux, scala
  100 holder) tutti verdi.
- **Review avversariale a 4 agenti** + **mutation testing** (mewt): buchi trovati e chiusi.
- **Runbook** (sweep/incident/upgrade), **peg oro** (1 IGT = 2 g), **indexer holder**,
  badge CI + snippet README.
