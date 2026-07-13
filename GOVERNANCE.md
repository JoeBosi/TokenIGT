# GOVERNANCE.md — Mappa ruoli → indirizzi (TEMPLATE)

> ⚠️ **Da compilare con i dati reali prima del redeploy pulito (E3).** Questo
> documento serve all'audit esterno per valutare il trust model del sistema.
> Finché i campi sono `<...>`, il documento non è pronto per il redeploy.

## 1. Multisig (Safe)

| Campo | Valore |
|---|---|
| Rete | Polygon (137) |
| Indirizzo Safe | `<...>` |
| Soglia (M-of-N) | `<...>` es. 2-of-3, 3-of-5 |
| Firmatari | `<elenco indirizzi + identità/ruolo di ciascuno>` |
| Policy di rotazione firmatari | `<...>` (chi decide, con che quorum) |

## 2. Mappa ruolo → indirizzo → tipo di chiave

| Ruolo | Indirizzo (produzione) | Tipo chiave | Note |
|---|---|---|---|
| `DEFAULT_ADMIN_ROLE` | Safe (sopra) | Multisig | Governance — transfer a due fasi con delay (§4), vedi PIANO_LAVORI §0.2/f |
| `UPGRADER_ROLE` | Safe (sopra) | Multisig | Upgrade solo con quorum |
| `FEE_ADMIN_ROLE` | Safe (sopra) | Multisig | Governance: parametri fee/collector/treasury/esenzioni (v2.4.0, split da FEE_MANAGER — vedi PIANO_LAVORI §0.2/d) |
| `SWEEPER_ROLE` | `<...>` | **EOA calda** | Operativo: `startNewCycle`/`sweepCustodyFee`, firma centinaia di tx per batch — vedi RUNBOOK_SWEEP §0 (funding POL) |
| `RECOVERER_ROLE` | `<...>` | `<...>` | Recovery di fondi inviati per errore |
| `PAUSER_ROLE` | `<...>` | **EOA calda** | Deve reagire in minuti — RUNBOOK_INCIDENT §0 |
| `MINTER_ROLE` | `<...>` | `<...>` | Vedi procedura mint↔attestazione (PEG_ORO.md) |
| `BURNER_ROLE` | `<...>` | `<...>` | |
| `FREEZER_ROLE` | `<...>` | `<...>` | |
| `BLOCKER_ROLE` | `<...>` | `<...>` | |

**Delay di governance (`adminTransferDelay_`, parametro `initialize`)**: `<...>`
secondi (default proposto: 3 giorni = 259200; vedi `ADMIN_TRANSFER_DELAY_SECONDS`
in `.env.example`). Determina quanto tempo intercorre tra `beginDefaultAdminTransfer`
e la possibilità di `acceptDefaultAdminTransfer`/`renounceRole` — vedi §4.

## 3. Custodia delle chiavi

| Tipo | Meccanismo | Chi ha accesso |
|---|---|---|
| Multisig (Safe) | `<hardware wallet dei firmatari / Safe{Wallet} app>` | `<elenco>` |
| EOA calde (PAUSER, sweep) | `<keystore cifrato / HSM / hardware wallet>` | `<responsabile>` |

## 4. Coreografia di handover (post-deploy) — v2.4.0, DUE FASI

Con `AccessControlDefaultAdminRulesUpgradeable`, `grantRole`/`revokeRole` su
`DEFAULT_ADMIN_ROLE` **revertono sempre**, incondizionatamente: l'unico percorso è
un transfer schedulato con delay obbligatorio. L'handover richiede quindi due
script eseguiti in momenti separati (collaudato end-to-end in locale).

**FASE 1 — `scripts/roles/finalize_governance.ts`** (eseguito dal deployer,
subito dopo il deploy):

1. Grant dei ruoli operativi agli indirizzi reali (tabella §2), incluso `SWEEPER_ROLE`.
2. Grant di `UPGRADER_ROLE`/`FEE_ADMIN_ROLE`/`RECOVERER_ROLE` al Safe (ruoli
   ordinari, non gated dal delay) — **verifica** che il Safe li abbia ricevuti,
   poi il deployer vi rinuncia (`renounceRole`).
3. `beginDefaultAdminTransfer(Safe)` — schedula il transfer di `DEFAULT_ADMIN_ROLE`
   con il delay configurato a deploy (`adminTransferDelay_`, §2). Il deployer
   **resta** `DEFAULT_ADMIN_ROLE` fino alla FASE 2: non c'è mai un istante senza
   alcun admin.
4. Stato finale stampato e verificato manualmente contro questo documento.

**FASE 2 — `scripts/roles/accept_governance.ts`** (eseguito dal Safe/nuovo admin,
DOPO che il delay è trascorso):

5. Il Safe chiama `acceptDefaultAdminTransfer()`: `DEFAULT_ADMIN_ROLE` passa
   atomicamente dal deployer al Safe (revoca del vecchio + grant del nuovo in
   un'unica transazione).
6. Lo script verifica `hasRole(DEFAULT_ADMIN_ROLE, Safe) == true` e
   `hasRole(DEFAULT_ADMIN_ROLE, deployer) == false` prima di dichiarare successo.

Se il delay non è ancora trascorso, o il chiamante non è l'admin pendente,
`acceptDefaultAdminTransfer()` reverte esplicitamente (rispettivamente
`AccessControlEnforcedDefaultAdminDelay` / `AccessControlInvalidDefaultAdmin`) —
lo script intercetta questi casi con un messaggio guida prima di inviare la tx.

## 5. Riferimenti
- Ruoli e metodi: `roles.md`
- Delay di governance e transfer a due fasi: `RUNBOOK_UPGRADE.md`
- Regola anti-lockout: `revokeRole(DEFAULT_ADMIN_ROLE, ...)` reverte sempre
  (protezione strutturale, non più un guard applicativo — vedi AGENTS.md §16.11
  e `scripts/roles/revoke_roles.ts`)
- Emergenze: `RUNBOOK_INCIDENT.md`
