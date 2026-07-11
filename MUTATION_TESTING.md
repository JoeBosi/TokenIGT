# Mutation Testing — Token v2.4.0 (campagna completa)

> Data: 2026-07-11/12 · Tool: **mewt 4.0.0** (Trail of Bits) · Runner: `forge test --fail-fast`
> Skill: `.claude/skills/mutation-testing/` · Config: `mewt.toml` · DB: `mewt.sqlite` (gitignored)

## Cos'è e perché

Il mutation testing introduce piccole modifiche ("mutanti") nel sorgente — es. un `require`
rimosso, `a > b` → `a >= b`, uno statement commentato — e verifica che **almeno un test
fallisca** per ciascuna. Un mutante *catturato* significa che la suite copre quella logica;
un mutante *sopravvissuto* indica logica non verificata dai test, anche a coverage di riga
100%. È la misura di qualità della suite più severa dopo la coverage, e la eseguiamo noi
(nessun ente esterno).

## Setup

- **Target**: solo i contratti di produzione — `Token.sol` + `extensions/**` (esclusi mock,
  interfacce, node_modules).
- **Runner**: `forge test --fail-fast` (esce al primo test che fallisce → i mutanti catturati
  sono rilevati in pochi secondi; il verdetto caught/uncaught dipende solo dall'exit code).
- **Mutanti generati**: **917**.

## Risultato della campagna completa

| Esito | Conteggio |
|---|---:|
| Catturati (`TestFail`) | 855 |
| Sopravvissuti (`Uncaught`) | 56 |
| Skipped (mutante meno severo su riga già scoperta) | 6 |
| **Totale** | **917** |

I **56 sopravvissuti** sono stati analizzati uno per uno (workflow a 6 agenti, uno per
contratto, ciascuno con verifica empirica via probe forge). Esito:

- **44 mutanti EQUIVALENTI** — la mutazione NON cambia comportamento osservabile, quindi
  nessun test può ucciderli (non sono buchi). Categorie:
  * **confronti su `address`** (uint160 UNSIGNED): `x == address(0)` ≡ `x <= address(0)`;
    `x != address(0)` ≡ `x > address(0)` (≈20 casi, es. tutti i guard `!= address(0)` di
    collector/treasury/recipient e i check `== address(0)` di mint/burn).
  * **`__X_init()` con initializer vuoto** (Pausable/Freezable/Blocklist/EIP3009/ERC1363/
    Recoverable/ContractURIs/ERC165): rimuoverli non scrive stato → nessun effetto (8 casi).
  * **`x > 0` ≡ `x != 0`** su uint (feeAmount, initialSupply, code.length…) (≈5 casi).
  * **swap di argomenti `(from, to)`** dentro OR simmetrici (`isBlocked(from)||isBlocked(to)`,
    esenzioni) → commutativo (5 casi).
  * **`_setRoleAdmin` override** mai chiamato (esiste solo per il diamond inheritance) →
    codice irraggiungibile (2 casi).
  * **shortcut con fall-through identico**: `if (bps==0) return 0;` rimosso, ma `(value*0)/10000`
    dà comunque 0; idem previewGross/maxNetTransferable (4 casi).
  * **loop monotono** `i < len` ≡ `i != len` (1 caso); invariante `lastSweptCycle ≤ cycle`
    rende `== cycle` ≡ `>= cycle` (1 caso); loop di arrotondamento `<=` ≡ `==` (provato per
    forza bruta su tutti bps×balance) (1 caso).

- **12 BUCHI REALI** — la mutazione cambiava un comportamento osservabile non testato.
  **Tutti chiusi** con 12 nuovi test Foundry (verificati con `mewt test --ids`: da `Uncaught`
  a `TestFail`):

| Mutante | Contratto | Comportamento non testato | Nuovo test |
|---|---|---|---|
| #263 | Token | `initialSupply==0` con holder≠0 non deve mintare (nessun evento Transfer a init) | `test_MUT_init_zeroSupplyNonZeroHolder_noMintEvent` |
| #295 | Token `_update` | fee leg deve scattare anche con collector numericamente > mittente | `test_MUT_netPath_collectorGreaterThanSender_feeLegFires` |
| #305 | Token `_grossTransfer` | idem sul percorso lordo (ERC-1363/EIP-3009) | `test_MUT_grossPath_collectorGreaterThanSender_feeLegFires` |
| #443 | ERC1363 | selettore di ritorno callback **basso** e sbagliato deve revertare | `test_transferAndCall_lowWrongSelectorReverts` |
| #448 | ERC1363 | idem sul percorso approve | `test_approveAndCall_lowWrongSelectorReverts` |
| #457 | ERC1363 | `supportsInterface` di un id **basso** sconosciuto deve dare false | `test_supportsInterface_lowUnknownReturnsFalse` |
| #567 | CustodyFee | un holder già spazzato non deve **interrompere** il batch (`continue`, non `break`) | `test_sweep_alreadySweptHolderDoesNotStopBatch` |
| #732 | EIP3009 | `receiveWithAuthorization`: caller con address < recipient deve revertare | `test_receiveWithAuthorization_callerBelowRecipientReverts` |
| #737 | EIP3009 | `cancelAuthorization`: firmatario recuperato > authorizer deve revertare | `test_cancelAuthorization_recoveredAboveAuthorizerReverts` |
| #742 | EIP3009 | `transferWithAuthorization`: firmatario recuperato > from deve revertare | `test_transferWithAuthorization_recoveredAboveFromReverts` |
| #748 | EIP3009 | boundary `block.timestamp == validAfter` è VALIDO | `test_transferWithAuthorization_validAtExactValidAfterBoundary` |
| #751 | EIP3009 | `block.timestamp` strettamente oltre `validBefore` deve revertare (scaduto) | `test_transferWithAuthorization_strictlyPastValidBeforeReverts` |

## Verdetto

**Nessun bug di contratto.** Tutti i 12 buchi erano lacune della *suite* (regioni di input non
esercitate: indirizzi con ordinamento numerico particolare, selettori bassi, boundary temporali
esatti, ordine degli elementi in un batch). I più rilevanti per la sicurezza — validazione firme
EIP-3009 (`!= → <` sui recovered address) e finestre temporali (`validAfter`/`validBefore`
boundary) — sono ora blindati.

**Mutation score effettivo: 100% dei mutanti non-equivalenti** (867/867 uccisi; 44 equivalenti
documentati; 6 skipped). Suite: 546 test (327 Foundry + 219 Hardhat).

## Riprodurre

```bash
export PATH="$HOME/.local/bin:$HOME/.foundry/bin:$PATH"
mewt run                       # campagna completa (~2h; salta i mutanti già testati)
mewt status                    # avanzamento e catch rate per severità
sqlite3 mewt.sqlite "SELECT o.mutant_id,m.line_offset,m.old_text,m.new_text \
  FROM outcomes o JOIN mutants m ON m.id=o.mutant_id WHERE o.status='Uncaught';"
mewt test --ids <ID>           # ri-testa un mutante dopo aver aggiunto un test
```
