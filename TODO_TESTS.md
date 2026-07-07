# TODO_TESTS.md — Stato test

> Aggiornato: 2026-07-06 | Branch: `2026706ClaudeCode` | Versione contratti: 2.0.0

## Risultati correnti

### Hardhat (`pnpm test`) — 189 test ✅ / 0 ❌ (~6s)

18 spec migrate alla API v2 + 2 nuove: `token.custody.spec.ts` (custody fee:
sweep, cicli, pausa, frozen/blocked, fee=0, access control) e
`token.feesemantics.spec.ts` (doppia semantica netto/lordo, preview, EIP-3009
lordo, matrice fee=0, infinite allowance).

### Foundry (`forge test`) — 258 test ✅ / 0 ❌ (~18s)

| Suite | Contenuto |
|---|---|
| `Token.t.sol` | unit + fuzz + 7 invariant (incluso somma-balance == totalSupply con sweep) |
| `TokenEIP3009Test` | firma/nonce/scadenze + settlement lordo |
| `TokenERC1363Test` | callback + semantica lorda + allowance lorda |
| `TokenRecoverableTest` | SafeERC20/ERC721 + self-token via percorso standard |
| `TokenMiscTest` | fee branches, freeze/block idempotenti, upgrade V2 |
| `TokenCoverageGapsTest` | validazioni initialize (tutti i revert) + path _update |
| `TokenCustodyFeeTest` 🆕 | tutti i rami dello sweep + setter + fuzz |
| `TokenFeeSemanticsTest` 🆕 | doppia semantica, preview fuzz (minimalità), matrice fee=0 |
| `TokenStorageLayoutTest` 🆕 | conformità ERC-7201 verificata on-chain con vm.load |

### Totale: **454 ✅ / 0 ❌**

## Coverage (`forge coverage`, core contracts)

| Contratto | Lines | Branches |
|---|---|---|
| `Token.sol` | **100%** | **100%** |
| tutte le estensioni | ≥93,6% | **100%** |

Il residuo sulle estensioni è costituito dalle funzioni `__X_init_unchained()`
vuote (convenzione OZ per gli initializer, non richiamate by design).

## Task residui

- [ ] Smoke test on-chain post-deploy Amoy (script `verify` + letture view)
- [ ] (opzionale) mutation testing con la skill `mutation-testing` quando i
      workflow multi-agente saranno di nuovo disponibili
