# Mutation Testing — Token v2.4.0

> Data: 2026-07-11 · Tool: **mewt 4.0.0** (Trail of Bits) · Runner: `forge test --fail-fast`
> Skill di riferimento: `.claude/skills/mutation-testing/` · Config: `mewt.toml`

## Cos'è e perché

Il mutation testing introduce piccole modifiche ("mutanti") nel codice sorgente
— es. `require(x)` → rimosso, `a > b` → `a >= b`, uno statement commentato — e
verifica che **almeno un test fallisca** per ciascuna. Un mutante *catturato*
(`TestFail`) significa che la suite copre quella logica; un mutante
*sopravvissuto* (`Uncaught`) indica logica NON verificata dai test, anche se la
coverage di riga è al 100%. È la misura di qualità della suite più severa dopo
la coverage, e non richiede enti esterni: la eseguiamo noi.

## Setup

- **Target**: solo i contratti di produzione — `contracts/Token.sol` +
  `contracts/extensions/**` (esclusi mock, interfacce, `node_modules`).
- **Runner**: `forge test --fail-fast`. La suite Foundry (deterministica, ~17s)
  copre tutta la logica dei contratti; `--fail-fast` esce al primo test che
  fallisce, così un mutante catturato è rilevato in pochi secondi. mewt decide
  `caught`/`uncaught` solo dall'exit code, quindi `--fail-fast` non altera il
  verdetto, solo la velocità.
- **Mutanti generati**: **917** (58 high + 94 medium + 186 low sul solo
  Token.sol, più le estensioni; `FeeRoles.sol` = 0, sole costanti).

## Risultati (run parziale, 2026-07-11)

Campagna avviata sui 917 mutanti. Al campione dei primi **64 mutanti testati**
(prevalentemente high-severity, i più significativi):

| Esito | Conteggio |
|---|---:|
| Catturati (`TestFail`) | 61 |
| Sopravvissuti (`Uncaught`) | 3 |
| Catch rate (high-severity) | ~95% |

### I 3 mutanti sopravvissuti — analisi e azione

| # | Riga | Mutazione | Diagnosi | Azione |
|---|---|---|---|---|
| 59 | `Token.sol:76` | `_disableInitializers();` rimosso dal costruttore | **Buco reale**: nessun test Foundry verificava che l'implementation non sia inizializzabile direttamente (best practice UUPS — un'implementation "aperta" può essere inizializzata e abusata). Hardhat non lo copriva. | ✅ Aggiunto `test_implementation_cannotBeInitialized` (TokenMiscTest) → mutante ora **catturato** |
| 61 | `Token.sol:114` | `__ERC20_init(name_, symbol_);` rimosso | **Buco reale** nella suite *Foundry*: nessun test forge asseriva `name()`/`symbol()` (li copriva solo Hardhat, ma il mutation testing gira su forge). | ✅ Aggiunto `test_metadata_nameSymbolDecimals` (TokenMiscTest) → mutante ora **catturato** |
| 54 | `Token.sol:404` | corpo di `_setRoleAdmin` → `require(false)` | **Mutante equivalente**: l'override `_setRoleAdmin` esiste solo per risolvere il diamond inheritance (dichiarato sia da `AccessControlUpgradeable` sia da `AccessControlDefaultAdminRulesUpgradeable`); il contratto non chiama MAI `_setRoleAdmin` (non riconfiguriamo mai gli admin dei ruoli), quindi il corpo è irraggiungibile. Non uccidibile senza un test artificiale su codice morto. | 📝 Accettato e documentato (non è un buco di test) |

I due buchi reali erano entrambi coperti dalla suite **Hardhat** ma non da
quella **Foundry**: il mutation testing su `forge test` li ha esposti, e i due
nuovi test Foundry li chiudono (verificato con `mewt test --ids 59,61` → entrambi
`TestFail`). **Nessun buco di sicurezza sostanziale**: le 2 lacune erano
proprietà (metadata, implementation locked) già coperte altrove, ora blindate
anche in Foundry.

## Stato e come completare

La campagna completa sui 917 mutanti è un lavoro lungo (~1-2h) ma **ripristinabile**
(mewt salta i mutanti già testati) e **interamente self-doable** (nessun ente
esterno). Per riprenderla/completarla:

```bash
export PATH="$HOME/.local/bin:$HOME/.foundry/bin:$PATH"
mewt run                       # riprende dai mutanti non ancora testati
mewt status                    # avanzamento e catch rate per severità
# analizzare i sopravvissuti:
sqlite3 mewt.sqlite "SELECT o.mutant_id, m.line_offset, m.old_text, m.new_text \
  FROM outcomes o JOIN mutants m ON m.id=o.mutant_id WHERE o.status='Uncaught';"
mewt print mutant --id <ID>    # diff del singolo mutante
mewt test --ids <ID>           # ri-testa dopo aver aggiunto un test
```

> `mewt.sqlite` è gitignored (DB di campagna transiente). `mewt.toml` è versionato
> (config riproducibile).
