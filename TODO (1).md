# TODO — Task Pendenti

## Testing & Coverage

### ⬜ Hardhat Tests
- [ ] Rigenerare `test-results.json` con output aggiornato (`pnpm test > test-results.json`)

### ⬜ Foundry Tests — Coverage Target 95%+
Aggiungere test per raggiungere line coverage ≥ 95% su `Token.sol`:

- [ ] **EIP-3009**: `transferWithAuthorization`, `receiveWithAuthorization`, `cancelAuthorization`
  - Firme EIP-712 valide
  - Replay protection
  - Scadenza (validBefore/validAfter)
  - Stato autorizzazione
- [ ] **ERC-1363**: `transferAndCall`, `transferFromAndCall`, `approveAndCall`
  - Callback su contratti compliant
  - Revert su contratti non compliant
  - `supportsInterface` per IERC1363
- [ ] **EIP-2612 Permit**: Firme valide, nonces, scadenza, replay protection
- [ ] **Recovery**: `recoverERC20`, `recoverETH`, `recoverERC721`
  - Recupero token/ETH/NFT inviati per errore
- [ ] **Invariant tests**: Stateful fuzzing con `TokenHandler.sol`

## Documentazione

- [ ] Aggiungere badges CI/coverage in README.md
- [ ] Aggiungere esempi di codice (snippets) in README.md

## Refactor Ottimizzazioni

- [ ] Verificare storage layout namespaced per V2/V3
- [ ] Ottimizzare gas in `_update` hook se necessario

---

**Stato attuale (2026-06-02):**
- ✅ 162 Hardhat tests passing (0 failed)
- ✅ 38 Foundry tests passing — 23 unit + 9 fuzz + 6 invariant (0 failed)
- ⬜ Coverage Foundry: 47.64% lines / 31.25% branches (target: 95%+ line, 90%+ branch)
- 📄 Vedi `TODO_TESTS.md` per statistiche dettagliate e task prioritizzati
