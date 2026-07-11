# RUNBOOK — Incident response (IGT)

> Procedura di emergenza · v1.0 (2026-07-08) · Token IGT v2.x UUPS su Polygon
> Complementa `RUNBOOK_SWEEP.md` (operazioni ordinarie di custodia).
> **Regola d'oro: contieni prima (pause/revoke), indaga dopo.**

## Ruoli e chi agisce

| Ruolo | Potere in emergenza | Chi lo detiene (mainnet) |
|---|---|---|
| `PAUSER_ROLE` | `pause()` / `unpause()` | wallet operativo caldo (reazione rapida) |
| `DEFAULT_ADMIN_ROLE` | `grantRole` / `revokeRole` | **multisig** (Safe) |
| `UPGRADER_ROLE` | `upgradeToAndCall` (hotfix) | **multisig** (Safe) |
| `FEE_MANAGER_ROLE` | `setFeeCollector` / `setCustodyTreasury` | multisig o wallet dedicato |

> Su mainnet i ruoli critici (ADMIN/UPGRADER) sono su multisig → in emergenza
> serve il quorum: tenere pronti i firmatari. Il PAUSER può stare su un wallet
> singolo caldo proprio per garantire reazione immediata.

## E4a — Emergenza generica → PAUSA IMMEDIATA

Alla PRIMA anomalia dubbia (comportamento inatteso, alert critico, exploit sospetto):

```bash
# wallet PAUSER
cast send $PROXY "pause()" --rpc-url $RPC --private-key $PAUSER_KEY
```
- La pausa blocca TUTTI i trasferimenti (ERC-20/1363/3009). Mint/burn e sweep di
  custodia restano possibili — tienilo presente.
- Verifica: `cast call $PROXY "paused()(bool)"` → `true`.
- **Costo del falso allarme è basso** (riapri con `unpause`): in caso di dubbio, pausa.
- Comunica internamente l'avvenuta pausa (vedi E4e) e apri l'indagine.

## E4b — Chiave o ruolo compromesso

Se una chiave privata di un ruolo è (sospetta) compromessa:

1. Se è il PAUSER o un ruolo operativo → **pause()** subito (E4a) per congelare.
2. **Revoca** il ruolo dall'indirizzo compromesso (da ADMIN/multisig):
   ```bash
   cast send $PROXY "revokeRole(bytes32,address)" $ROLE $COMPROMISED --private-key $ADMIN_KEY
   ```
3. **Concedi** il ruolo a un nuovo indirizzo sicuro (nuova chiave, HW wallet):
   ```bash
   cast send $PROXY "grantRole(bytes32,address)" $ROLE $NEW_SAFE_ADDR --private-key $ADMIN_KEY
   ```
4. Se compromesso è un firmatario del **multisig**: sostituiscilo nella policy del
   Safe (fuori dal token) e ri-verifica la soglia.
5. Se compromesso è **DEFAULT_ADMIN** stesso → è lo scenario peggiore: l'attaccante
   può ridistribuire ruoli. Mitigazione: ADMIN su multisig (nessuna singola chiave
   basta). Se accadesse comunque, pause + upgrade d'emergenza (E4d) per neutralizzare.
6. Ruoli utili da conoscere: `keccak256("MINTER_ROLE")`, `..._ROLE` — oppure leggili
   con `cast call $PROXY "MINTER_ROLE()(bytes32)"` ecc.

## E4c — Collector o Treasury compromessi

Se l'indirizzo che INCASSA le fee (`feeCollector`) o la custodia (`custodyTreasury`)
è compromesso o errato:

```bash
# FEE_MANAGER
cast send $PROXY "setFeeCollector(address)" $NEW_COLLECTOR --private-key $FEE_MANAGER_KEY
cast send $PROXY "setCustodyTreasury(address)" $NEW_TREASURY --private-key $FEE_MANAGER_KEY
```
- **NON serve bloccare il token**: il rimedio è ripuntare il destinatario. I fondi
  già accumulati sull'indirizzo compromesso sono persi/da recuperare fuori dal token.
- Ricorda la policy: un collector/treasury bloccato riceve COMUNQUE le fee (per
  design, per non paralizzare il token) → il blocco NON è un rimedio, `set*` sì.

## E4d — Upgrade d'emergenza (hotfix di un bug nel contratto)

Solo se il bug è nella LOGICA del contratto e non basta pause/parametri:

1. **pause()** (E4a) per congelare mentre si prepara il fix.
2. Sviluppa la nuova implementation con il fix; **validare lo storage layout**
   (`upgrades.validateUpgrade`) — vietato spostare slot (vedi AUDIT_STORAGE.md §4).
3. Test completo in locale + su fork Amoy della patch.
4. `upgradeToAndCall` dalla multisig (UPGRADER_ROLE):
   ```bash
   pnpm hardhat run scripts/upgrade/upgrade_polygon.ts --network polygon
   ```
5. Verifica la nuova implementation su Polygonscan (proxy + impl) e `version()`.
6. **unpause()** solo dopo aver confermato che il fix è attivo e corretto.

## E4e — Comunicazione durante l'incidente

- **Interna** (subito): avvisa il team/firmatari multisig; apri un canale dedicato.
- **Esterna** (appena contenuto): comunicazione chiara su cosa è successo, cosa è
  stato fatto (pausa/fix), impatto sugli utenti, tempi di ripristino. Canali:
  sito/landing (vedi `websiteURI`), social ufficiali, eventuali exchange/partner.
- **Post-mortem** (dopo): cosa è andato storto, root cause, azioni correttive,
  aggiornamento di questo runbook e dei test/monitoraggio per prevenire il ripetersi.

## Checklist rapida (da tenere a portata)

- [ ] Anomalia → `pause()` (E4a)
- [ ] Chiave/ruolo compromesso → `revokeRole` + `grantRole` a nuovo indirizzo (E4b)
- [ ] Collector/treasury compromessi → `setFeeCollector` / `setCustodyTreasury` (E4c)
- [ ] Bug di logica → upgrade validato dalla multisig (E4d)
- [ ] Comunicazione interna → esterna → post-mortem (E4e)
- [ ] `unpause()` solo a incidente risolto e verificato

> Prerequisito operativo: il wallet PAUSER deve avere sempre POL per il gas; i
> firmatari del multisig devono essere raggiungibili. Testare questa procedura
> almeno una volta su Amoy prima del mainnet.
