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
| `DEFAULT_ADMIN_ROLE` | Safe (sopra) | Multisig | Governance — vedi PIANO_LAVORI §0.2/f |
| `UPGRADER_ROLE` | Safe (sopra) | Multisig | Upgrade solo con quorum |
| `FEE_MANAGER_ROLE` (o split, PIANO_LAVORI §0.2/d) | `<...>` | `<Safe / EOA calda>` | Se calda: firma centinaia di tx per lo sweep — vedi RUNBOOK_SWEEP §0 (funding POL) |
| `RECOVERER_ROLE` | `<...>` | `<...>` | Recovery di fondi inviati per errore |
| `PAUSER_ROLE` | `<...>` | **EOA calda** | Deve reagire in minuti — RUNBOOK_INCIDENT §0 |
| `MINTER_ROLE` | `<...>` | `<...>` | Vedi procedura mint↔attestazione (PEG_ORO.md) |
| `BURNER_ROLE` | `<...>` | `<...>` | |
| `FREEZER_ROLE` | `<...>` | `<...>` | |
| `BLOCKER_ROLE` | `<...>` | `<...>` | |

## 3. Custodia delle chiavi

| Tipo | Meccanismo | Chi ha accesso |
|---|---|---|
| Multisig (Safe) | `<hardware wallet dei firmatari / Safe{Wallet} app>` | `<elenco>` |
| EOA calde (PAUSER, sweep) | `<keystore cifrato / HSM / hardware wallet>` | `<responsabile>` |

## 4. Coreografia di handover (post-deploy)

Eseguita da `scripts/roles/finalize_governance.ts` (collaudata end-to-end in
locale — vedi commit "fix(scripts)" del 2026-07-08):

1. Grant dei ruoli operativi agli indirizzi reali (tabella §2).
2. Grant di `DEFAULT_ADMIN_ROLE`/`UPGRADER_ROLE`/`FEE_MANAGER_ROLE`/`RECOVERER_ROLE`
   al Safe (`GOVERNANCE_ADMIN` in `.env`).
3. **Verifica** (`hasRole(DEFAULT_ADMIN_ROLE, Safe) == true`) prima di procedere.
4. `renounceRole` del deployer su tutti i ruoli di governance residui.
5. Stato finale stampato e verificato manualmente contro questo documento.

## 5. Riferimenti
- Ruoli e metodi: `roles.md`
- Regola anti-lockout: mai `renounceRole`/`revokeRole` che lasci zero admin
  (AGENTS.md §16.11; guard automatico in `scripts/roles/revoke_roles.ts`)
- Emergenze: `RUNBOOK_INCIDENT.md`
