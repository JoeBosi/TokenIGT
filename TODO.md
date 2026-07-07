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
- [x] **Runbook sweep** (`RUNBOOK_SWEEP.md`) — ordine vincolante PAUSA→SNAPSHOT→
      SWEEP→VERIFICA→UNPAUSE, gas budget, funding POL, gate, ripresa, emergenze
- [x] **Peg oro formalizzato**: 1 IGT = 2 g (`PEG_ORO.md`); detenzione media €2.000/utente
- [x] **Indexer holder** (`scripts/indexer/sweep_indexer.ts`) — snapshot da eventi
      Transfer con verifica completezza + gate post-sweep; collaudato end-to-end
      in locale (riconciliazione esatta al wei, gate negativo/positivo)
- [x] Badge CI + snippet integrazione nel README
- [ ] **Prova generale su Amoy** — RIMANDATA su indicazione utente (arriverà con
      specifiche aggiuntive); includerà collaudo throughput multi-tx/multi-operatore
- [ ] Merge del branch in `master` dopo review dell'utente (PR pronta)

## Pre-mainnet (bloccanti per il go-live)
- [ ] Governance: DEFAULT_ADMIN + UPGRADER su multisig (Safe); valutare
      `AccessControlDefaultAdminRulesUpgradeable` e timelock (AUDIT §raccomandazioni)
- [ ] Audit di sicurezza esterno professionale
- [ ] Badges CI/coverage nel README + snippet di integrazione
- [ ] Indexer holder per lo sweep (enumerazione da eventi Transfer) in produzione
