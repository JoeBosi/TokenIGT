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
- [ ] **Deploy fresco su Amoy** (non upgrade — nuovi namespace storage) + verify +
      grant ruoli + smoke test on-chain
- [ ] Regola operativa sweep: runbook `pause → batch → unpause` con indexer holder
- [ ] Merge del branch in `master` dopo review dell'utente

## Pre-mainnet (bloccanti per il go-live)
- [ ] Governance: DEFAULT_ADMIN + UPGRADER su multisig (Safe); valutare
      `AccessControlDefaultAdminRulesUpgradeable` e timelock (AUDIT §raccomandazioni)
- [ ] Audit di sicurezza esterno professionale
- [ ] Badges CI/coverage nel README + snippet di integrazione
- [ ] Indexer holder per lo sweep (enumerazione da eventi Transfer) in produzione
