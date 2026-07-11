# RUNBOOK — Upgrade ordinario (non emergenza)

> v1.0 (2026-07-08) · Per un upgrade PIANIFICATO dell'implementation UUPS.
> Per un hotfix d'emergenza vedi `RUNBOOK_INCIDENT.md` §E4d (stessa meccanica,
> ma compressa nei tempi e senza tutti i passi di revisione qui sotto).

## Quando si applica
Ogni volta che si vuole cambiare la logica del contratto (nuova feature, fix non
urgente, aggiunta di storage) tramite `upgradeToAndCall` (UUPS), con `UPGRADER_ROLE`
su multisig e tempo per una revisione completa.

## Checklist

### 1. Sviluppo e revisione del diff
- [ ] Modifiche implementate seguendo le regole di `AUDIT_STORAGE.md` §4
      (append-only sui namespace ERC-7201 esistenti, o nuovo namespace annotato
      `@custom:storage-location`; mai riordinare/rimuovere campi).
- [ ] Skill `differential-review` (Trail of Bits) eseguita sul diff completo
      dell'implementation, prima di procedere.
- [ ] `version()` incrementata.
- [ ] Se si aggiunge un namespace: `TokenStorageLayoutTest.t.sol` esteso con la
      verifica `vm.load` del nuovo slot (guardiano anti-regressione).

### 2. Test
- [ ] Suite completa verde (`forge test` + `pnpm test`).
- [ ] Test di upgrade dedicati: deploy della versione corrente → upgrade verso
      la nuova → assert che lo stato preesistente sia intatto (pattern già in
      `test/upgrade/*.spec.ts`).
- [ ] `forge coverage` sulle nuove funzioni ≥ target di progetto (95% lines /
      90% branches).
- [ ] Gas snapshot aggiornato se il gas di funzioni esistenti cambia
      (`forge snapshot --no-match-test "(testFuzz|invariant)"`).

### 3. Validazione OZ Upgrades
- [ ] `upgrades.validateUpgrade(proxyAddress, NewFactory, { kind: "uups" })`
      eseguito e verde — è il gate automatico contro layout incompatibili.
      Gli script `scripts/upgrade/upgrade_*.ts` lo eseguono già prima di ogni upgrade.

### 4. Esecuzione (via Safe multisig)
- [ ] Proposta di transazione creata sul Safe (chiamata a `upgradeToAndCall`
      tramite lo script appropriato, o direttamente dall'interfaccia Safe).
- [ ] Raccolta delle firme fino al quorum (vedi `GOVERNANCE.md`).
- [ ] Esecuzione della transazione.

### 5. Verifica post-upgrade
- [ ] Nuova implementation verificata su Polygonscan (`scripts/deploy/verify.ts`).
- [ ] Proxy ri-verificato come proxy (l'associazione proxy↔implementation deve
      aggiornarsi sull'explorer).
- [ ] `version()` letta on-chain corrisponde all'atteso.
- [ ] Smoke test delle funzioni principali (transfer, sweep se pertinente).
- [ ] `deployments/<rete>/implementation.json` e `upgrade-history.json`
      aggiornati (fatto automaticamente dagli script upgrade correnti).

### 6. Aggiornamento del monitoraggio
- [ ] Config del sistema di monitoraggio (quando esisterà, PIANO_LAVORI §3)
      aggiornata con il nuovo indirizzo di implementation atteso — un
      `Upgraded` verso un'implementation NON attesa è un alert critico.
- [ ] Documentazione aggiornata secondo `aggiornamento_documenti.md` (sezione
      "Modifica Storage Layout / Upgrade Pattern").

## Regola d'oro
Nessun passo di questa checklist è saltabile per un upgrade su Polygon mainnet.
Su Amoy si può abbreviare (nessun multisig necessario) ma SEMPRE con
`validateUpgrade` verde prima di procedere.
