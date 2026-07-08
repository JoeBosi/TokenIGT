# Changelog

All notable changes to the IGE Token project.

## [2.3.0] - 2026-07-07 — branch 2026706ClaudeCode

### Added
- **Eventi di config iniziale** dagli initializer (chiude Gap 1 di AUDIT_EVENTI.md):
  `__ERC20TransferFee_init` emette `TransferFeeUpdated(0, fee)` +
  `FeeCollectorUpdated(0x0, collector)`; `__ERC20CustodyFee_init` emette
  `CustodyFeeUpdated(0, fee)` + `CustodyTreasuryUpdated(0x0, treasury)`.
  Il log off-chain è ora auto-contenuto (storia config ricostruibile dai soli
  eventi) — utile per il sistema di monitoraggio.
- Test `test_init_emitsInitialConfigEvents` → **454 test** (262 Foundry + 192 Hardhat).
- `AUDIT_EVENTI.md`: audit della copertura eventi (verdetto + gap).

### Changed
- `version()` → `"2.3.0"`. Runtime bytecode 19.118 B (margine EIP-170 +5.458 B).
- **Storage audit (`AUDIT_STORAGE.md`)** + risoluzione osservazioni: i mock
  `TokenV2`/`TokenV3` riscritti con storage ERC-7201 namespaced (prima usavano
  variabili plain sequenziali — sicuro ma incoerente col pattern); rimossi da
  `scripts/upgrade/` i 5 script one-off v1 (già in `scripts/archive/`).
  Nessun impatto sul bytecode di `Token` (i mock non sono deployati).

> Nota: deploy Amoy attivo ancora v2.1.0; questi eventi saranno on-chain al redeploy.

## [2.2.0] - 2026-07-07 — branch 2026706ClaudeCode

### Added
- **Evento `AssetRecovered`** in `ERC20RecoverableUpgradeable`, emesso da
  `recoverERC20` (kind 0), `recoverNative` (kind 1, asset=0x0) e `recoverERC721`
  (kind 2): `AssetRecovered(AssetKind indexed kind, address indexed asset,
  address indexed to, uint256 amountOrTokenId, address executor)`. Chiude il gap
  eventi per il futuro sistema di monitoraggio on-chain (movimenti di fondi da
  parte del RECOVERER prima non erano tracciabili on-chain per il nativo).
- 6 test dedicati (3 Foundry + 3 Hardhat) → **453 test totali** (261 + 192).

### Changed
- `version()` → `"2.2.0"`. Runtime bytecode 18.897 B (margine EIP-170 +5.679 B).

> Nota: il deploy Amoy attivo è ancora v2.1.0 (proxy invariato); l'evento sarà
> on-chain al prossimo redeploy/upgrade.

## [2.1.0] - 2026-07-07 — branch 2026706ClaudeCode

> BREAKING (rename ABI): deploy fresco su Amoy.

### Changed
- **`recoverETH` → `recoverNative`** e **`TransferFailed` → `NativeTransferFailed`**:
  la funzione recupera la valuta nativa della chain (POL su Polygon), non ETH —
  il vecchio nome era una convenzione ereditata da Ethereum, semanticamente
  imprecisa per un token destinato a Polygon. NatSpec aggiornati
  ("native currency (POL on Polygon)"). Censimento completo: nessun altro nome
  Ethereum-centrico da correggere (ethers/parseEther = API di libreria,
  "Etherscan API V2" = nome reale del servizio usato da Polygonscan)
- Mock di test riallineati: TokenV2 `2.2.0-test`, TokenV3 `2.3.0-test`

### Added (2026-07-06, post-2.0.0)
- Policy collector (decisione utente): un collector blocked/frozen incassa
  comunque le fee — la gamba fee bypassa i security check per non paralizzare
  il token; fissata in NatSpec, AGENTS.md §8.1 e 3 test guardiani `test_policy_*`
- 14 test di chiusura lacune: treasury frozen/blocked su sweep, batch vuoto,
  profilo gas sweep (30.481 gas/holder), reentrancy avversariale ERC-1363,
  replay cross-chain EIP-712, flusso gasless permit+transferFrom, holder=0,
  getRoleAdmin, lockout ultimo admin (+regola AGENTS §16.11), upgrade non-UUPS
- Totale test: 447 (258 Foundry + 189 Hardhat)

## [2.0.0] - 2026-07-06 — branch 2026706ClaudeCode

> BREAKING: richiede deploy fresco (nuovi namespace storage e nuova `initialize`).
> Decisioni di design D1–D8 documentate in `SPEC_FEE_CUSTODIA.md`.

### Added
- **Fee di custodia on-chain** (`ERC20CustodyFeeUpgradeable`): prelievo a cicli
  con `sweepCustodyFee(holders)` idempotente per ciclo, fee calcolata sul balance
  al momento dell'esecuzione, cap 200 bp, treasury dedicata, esenzioni enumerabili,
  eventi `CycleStarted`/`CustodyFeeCollected`. Lo sweep bypassa pause, transfer fee,
  blocklist e freeze (D3) — procedura anti-elusione `pause → batch → unpause`
- **Doppia semantica transfer fee** (D4): netta su `transfer`/`transferFrom`
  (destinatario riceve il netto), lorda su ERC-1363/EIP-3009 (destinatario riceve
  esattamente il valore, mittente paga valore + fee; allowance sul lordo)
- View di preview: `previewNet`, `previewGross`, `maxNetTransferable`
- Esenzioni transfer fee enumerabili (`getTransferFeeExemptList`)
- Suite di test dedicate: custody, fee semantics, storage layout ERC-7201
  (verifica on-chain via `vm.load`), matrice fee=0 (433 test totali)

### Changed
- `FEE_ADMIN_ROLE` → `FEE_MANAGER_ROLE` (unico ruolo per entrambe le fee, D2)
- Cap transfer fee: 999 → **100 bp** (D5); API rinominata
  (`fee()`→`transferFeeBps()`, `setFee`→`setTransferFeeBps`,
  `addFeeFree`→`addTransferFeeExempt`, …)
- **Freeze binario** (D6): `freeze(account)`/`unfreeze(account)`; rimossi importi
  parziali (`freeze(addr,amt)`, `freezeAll`, `reduceFrozen`, `frozenOf`,
  `availableBalanceOf`)
- `ERC20RestrictedUpgradeable` → `ERC20BlocklistUpgradeable`
  (`blockUser`/`resetUser`/`blockAddress`/`unblock` → `blockAccount`/`unblockAccount`)
- Freeze/block/exemption idempotenti: eventi solo al cambio di stato
- ERC-1363: interfacce ufficiali OZ; estensione rinominata `ERC1363PayableUpgradeable`
- Recovery con SafeERC20 e `IERC721.safeTransferFrom` tipizzata
- `TokenV2`/`TokenV3` spostati in `contracts/mocks/` (fixture di test)
- Output Foundry separato in `out/` (i build-info condivisi corrompevano Hardhat)

### Fixed
- **Storage ERC-7201 conforme allo standard**: aggiunto il mask `& ~0xff` mancante
  a tutti gli slot namespaced (richiede deploy fresco; test anti-regressione)
- **Infinite allowance**: `_spendAllowance` custom rimosso — ripristinata la
  semantica OZ (le approvazioni `type(uint256).max` non vengono più decrementate
  né emettono `Approval` spurio a ogni `transferFrom`)

### Removed
- Intero strato monitoring/debug on-chain (D8): `healthCheck`, `emitHealthCheck`,
  `getSystemStatus`, `isAdmin`, `debugRoles`, eventi `OperationLogged`/
  `*OperationDebug`/`HealthCheck`/`ErrorReport`, dead code `_emitTransfer`/
  `_emitError`. Osservabilità off-chain documentata in `MONITORING.md`
  (−4 KB di bytecode: runtime 18,7 KB, margine EIP-170 +5,8 KB)

## [1.6.3-security-fixes] - 2025-05-18

### Security (Critical)
- **CRITICAL FIX**: EIP-3009 and ERC-1363 now respect PAUSE/BLOCK/FREEZE restrictions
  - Added `_updateWithoutFee()` helper function for secure transfers without fees
  - Previously, authorized transfers could bypass all security checks
  - Now all transfers (even gasless/fee-less) must pass security validation

### Added (Observability)
- `FrozenAmountChanged` event in `ERC20FreezableUpgradeable`
  - Emitted in: `freeze()`, `freezeAll()`, `unfreeze()`, `reduceFrozen()`
  - Tracks previous and new frozen amounts
- `FeeUpdated` event in `ERC20FeeUpgradeable` (tracks previous/new fee)
- `FeeCollectorUpdated` event (tracks previous/new collector)
- `FeeFreeStatusChanged` event (tracks whitelist changes)
- `AuthorizationCanceled` event for EIP-3009 cancelAuthorization

### Fixed
- **recoverERC721**: Using `safeTransferFrom` instead of decoding bool from `transferFrom`
- **AddressBlocked error**: Removed duplicate error, using only `AccountBlocked`
- **Dead code**: Removed unused `_beforeTokenTransfer` hooks from extensions

### Changed
- Version consolidated to `1.6.3-security-fixes`
- All 9 security/observability points addressed

### Deployment
- **Amoy Proxy:** `0x55F7DaBE49cc7947D6ac12014Af40305176581eB`
- **Implementation:** `0xeD7741db36Cf22e9D339A48e767313f33EFAb360`
- **Status:** All 162 local tests + 9/9 Amoy tests passing (100%)
- **Upgrade:** V1 → V2 tested and working

## [1.6.2-cleanup-final] - 2025-05-18

**⚠️ DEPRECATED:** This version has security issues (EIP-3009/ERC-1363 bypass PAUSE/BLOCK/FREEZE). Use v1.6.3.

### Added
- Comprehensive monitoring system with 9 debug events
- Health check functions (`healthCheck()`, `getSystemStatus()`, `emitHealthCheck()`)
- Role debug utilities (`debugRoles()`, `isAdmin()`)
- Operation tracking with unique operation IDs

### Fixed
- **Critical Fee Bug**: Fixed collector losing tokens when sender is also collector
- **EIP-3009 Fee Issue**: Bypass fee logic for authorized transfers
- **Mint/Burn Test Issues**: Added missing `await tx.wait()` in tests
- **Freeze Function Ambiguity**: Use explicit function signature `freeze(address,uint256)`

### Changed
- Renamed `block()` to `blockAddress()` to avoid shadowing
- Updated version string to `1.6.2-cleanup-final`
- Removed dead code (unused hooks, redundant functions)
- Consolidated version indicator functions

### Deployment
- **Amoy Proxy:** `0x0A06Bad41D08c4634a05a45b8709A32552B1A0ab`
- **Implementation:** `0xaf5c904Aab2dd9A30BF5a76b9913cBafdF218BFf`
- **Status:** All 9/9 tests passing (100%)

## [1.6.1-fee-bug-fixed] - 2025-05-18

### Fixed
- Fee calculation when collector is sender
- Added check: only transfer fee if collector != from

## [1.6.0-monitoring-enabled] - 2025-05-18

### Added
- Initial monitoring system implementation
- Debug events for all core operations
- Error reporting events

## [1.5.0] - 2025-05-17

### Fixed
- Final fee bug fix with comprehensive testing

## [1.4.0] - 2025-05-17

### Fixed
- Fee system logic correction in `_update()`

## [1.0.0-1.3.0] - 2025-05-17

### Initial Development
- Base ERC-20 implementation
- UUPS upgradeability setup
- Role-based access control
- Fee mechanism implementation
- Freeze/Block functionality
- EIP-3009 integration
- ERC-1363 support

---

## Version Format

`MAJOR.MINOR.PATCH-description`

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes
- **description**: Short change summary

## Security

### Fixed Issues
| Issue | Version | Severity | Description |
|-------|---------|----------|-------------|
| Fee loss | 1.6.2 | High | Collector lost tokens when also sender |
| Duplicate events | 1.6.2 | Medium | Fee events emitted twice |

### Audited Features
- ✅ UUPS upgrade pattern (OpenZeppelin validated)
- ✅ ERC-7201 namespaced storage
- ✅ Role-based access control
- ✅ Fee cap at 9.99% (999 bps)
- ✅ Reentrancy protection via OpenZeppelin
