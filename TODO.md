# TODO — Task Pendenti

## Branch 2026706ClaudeCode (v2.0.0)

### ✅ Completati (2026-07-06)
- [x] Spec fee custodia + fee scambio con decisioni D1–D8 chiuse (`SPEC_FEE_CUSTODIA.md`)
- [x] Contratti v2.0.0: custody fee, transfer fee a doppia semantica, freeze binario,
      blocklist, slot ERC-7201 conformi, rimozione monitoring, SafeERC20, fix
      infinite-allowance
- [x] 244 test Foundry + 189 test Hardhat, tutti verdi (433 totali)
- [x] Coverage: Token 100%/100%; estensioni 100% branches
- [x] Audit interno (`AUDIT_INTERNO_V2.md`): Slither pulito, checklist 19 punti
- [x] Script deploy/ruoli aggiornati; script one-off archiviati
- [x] Documenti riarmonizzati (AGENTS, README, roles, MONITORING, API, CHANGELOG)

### ⬜ Da fare
- [x] Deploy fresco su Amoy (v2.1.0) + verify + grant ruoli + smoke test on-chain
- [x] Simulazione locale del pagamento custodia (`SIMULAZIONE_CUSTODY_FEE.md`) —
      tutte le verifiche 🟢; batch operativo = 300 (tx gas cap EIP-7825)
- [ ] **Runbook sweep** (`RUNBOOK_SWEEP.md`): checklist pause→batch→unpause, gas
      budget (ciclo 1 ≈ 2× i successivi), funding POL operatore, riconciliazione
      come gate per l'unpause, piano ripresa dopo interruzione
- [ ] **Formalizzare il peg oro** (1 IGT = ? g) in un documento ufficiale
- [ ] **Indexer holder** da eventi Transfer con verifica di completezza
- [ ] **Prova generale su Amoy**: seed holder + sweep reale multi-batch (dopo il locale)
- [ ] Throughput per >100k holder: più tx/blocco, valutare più operatori FEE_MANAGER
- [ ] Merge del branch in `master` dopo review dell'utente

## Pre-mainnet (bloccanti per il go-live)
- [ ] Governance: DEFAULT_ADMIN + UPGRADER su multisig (Safe); valutare
      `AccessControlDefaultAdminRulesUpgradeable` e timelock (AUDIT §raccomandazioni)
- [ ] Audit di sicurezza esterno professionale
- [ ] Badges CI/coverage nel README + snippet di integrazione
- [ ] Indexer holder per lo sweep (enumerazione da eventi Transfer) in produzione
