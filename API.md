# API Reference — Token v2.5.0

Ruoli richiesti e matrice completa in [roles.md](./roles.md).
Semantica delle fee in dettaglio in [SPEC_FEE_CUSTODIA.md](./SPEC_FEE_CUSTODIA.md).

## Contract Addresses

### Amoy Testnet
- **v2.4.0 (attivo)**: proxy `0x8B4aFEd36CbD8418E2e4bc34E71b20433Ecb7515` · implementation verificata `0x4409cC3D3fdFC26800223A26e931CbAD333DBD05`
- (v2.3.0 storico: proxy `0x479DE4c471a88c0AFdf24e9E5462555BBab03BcC`; v2.1.0:
  proxy `0x2b307FabB36e54Fbd0257cE597D7bE277df84922`; v1.6.3: proxy
  `0x0A06Bad41D08c4634a05a45b8709A32552B1A0ab` — tutti DEPRECATI, vedi
  DEPLOYMENT.md per il dettaglio storico completo)

## Initialize (proxy UUPS)

```solidity
initialize(
    string  name_,             // es. "IGE Token"
    string  symbol_,           // es. "IGT"
    uint256 initialSupply_,    // wei; 0 = nessun mint iniziale
    address initialHolder_,
    uint256 transferFeeBps_,   // 0-100 (0 = spenta) — FeeExceedsMaximum
    address feeCollector_,     // != 0 — InvalidFeeCollector
    uint256 custodyFeeBps_,    // 0-200 (0 = spenta) — CustodyFeeExceedsMaximum
    address custodyTreasury_,  // != 0 — InvalidCustodyTreasury
    address defaultAdmin_,     // != 0 — InvalidAdmin
    uint48  adminTransferDelay_ // delay per beginDefaultAdminTransfer (v2.4.0)
)
```

> v2.5.0: se `initialSupply_ > 0` allora `initialHolder_` deve essere ≠ 0,
> altrimenti reverta `InvalidInitialHolder` (prima inizializzava a supply 0 in silenzio).

Grant automatici al `defaultAdmin_`: DEFAULT_ADMIN, UPGRADER, FEE_ADMIN, RECOVERER.
`SWEEPER_ROLE` NON è tra questi (va concesso post-deploy). Emette
`CycleStarted(1, timestamp)`.

## ERC-20 + supply

| Funzione | Note |
|---|---|
| `transfer(to, v)` / `transferFrom(from, to, v)` | fee **dedotta**: destinatario riceve `v - fee(v)`; allowance consumata per `v`; infinite allowance mai decrementata |
| `approve` / `allowance` / `balanceOf` / `totalSupply` / `name` / `symbol` / `decimals` | standard |
| `mint(to, v)` | MINTER_ROLE |
| `burn(from, v)` | BURNER_ROLE |
| `version()` | `"2.5.0"` |

## Transfer fee (fee di scambio)

| Funzione | Ruolo | Note |
|---|---|---|
| `transferFeeBps()` → uint256 | view | 0–100 |
| `setTransferFeeBps(uint256)` | FEE_ADMIN | cap `MAX_TRANSFER_FEE_BPS = 100`; evento `TransferFeeUpdated(old, new)` |
| `feeCollector()` / `setFeeCollector(address)` | view / FEE_ADMIN | ≠0; evento `FeeCollectorUpdated` |
| `isTransferFeeExempt(address)` / `getTransferFeeExemptList()` | view | esente se mittente O destinatario nel set |
| `addTransferFeeExempt(a)` / `removeTransferFeeExempt(a)` | FEE_ADMIN | idempotenti; evento `TransferFeeExemptionChanged(account, exempt)` solo al cambio |
| `getTransferFeeExemptCount()` | view | numero di esenti (O(1), v2.5.0) — evita di scaricare la lista unbounded |
| `previewNet(gross)` | view | netto consegnato da `transfer(gross)` (parti non-esenti) |
| `previewGross(net)` | view | minimo lordo per consegnare ≥ net via `transfer` |
| `maxNetTransferable(sender)` | view | max `v` con `v + fee(v) ≤ balance` (percorso lordo); balance se esente/fee 0; 0 se frozen/blocked |

## Custody fee (fee di custodia)

Parametri di governance (`FEE_ADMIN_ROLE`) separati dalle operazioni di ciclo/sweep
(`SWEEPER_ROLE`, split v2.4.0 — principio del minimo privilegio, vedi roles.md):

| Funzione | Ruolo | Note |
|---|---|---|
| `custodyFeeBps()` / `setCustodyFeeBps(uint256)` | view / FEE_ADMIN | cap `MAX_CUSTODY_FEE_BPS = 200`; evento `CustodyFeeUpdated` |
| `custodyTreasury()` / `setCustodyTreasury(address)` | view / FEE_ADMIN | ≠0; evento `CustodyTreasuryUpdated` |
| `currentCycle()` | view | parte da 1 |
| `startNewCycle()` | SWEEPER | evento `CycleStarted(cycle, timestamp)` |
| `lastSweptCycle(holder)` | view | 0 = mai sweepato |
| `isCustodyFeeExempt(a)` / `getCustodyFeeExemptList()` / `getCustodyFeeExemptCount()` | view | count O(1) aggiunto in v2.5.0 |
| `addCustodyFeeExempt(a)` / `removeCustodyFeeExempt(a)` | FEE_ADMIN | idempotenti; evento `CustodyFeeExemptionChanged` |
| `sweepCustodyFee(address[] holders)` | SWEEPER | fee = `balance × bps / 10000` al momento; skip exempt/già sweepato/treasury/zero; **bypassa pause, transfer fee, blocklist, freeze**; evento `CustodyFeeCollected(holder, fee, cycle)` per ogni prelievo |

## Restrizioni

| Funzione | Ruolo | Note |
|---|---|---|
| `freeze(a)` / `unfreeze(a)` / `isFrozen(a)` | FREEZER / view | binario, idempotente; eventi `Frozen`/`Unfrozen` al cambio; `a==0` reverta `InvalidFreezeAccount` (v2.5.0) |
| `blockAccount(a)` / `unblockAccount(a)` / `isBlocked(a)` | BLOCKER / view | idempotente; eventi `Blocked`/`Unblocked` al cambio; `a==0` reverta `InvalidBlockAccount` (v2.5.0) |
| `isRestricted(a)` | view | `isBlocked(a) || isFrozen(a)` — check unico per gli integratori (v2.5.0) |
| `pause()` / `unpause()` / `paused()` | PAUSER / view | blocca tutti i trasferimenti TRANNE lo sweep custodia |

Ordine revert su transfer: `AccountBlocked` → `AccountFrozen` → `EnforcedPause`.
Mint/burn esenti da block/freeze/fee (non dalla pausa).

## Firme off-chain

| Funzione | Note |
|---|---|
| `permit(owner, spender, value, deadline, v, r, s)` | EIP-2612 |
| `nonces(owner)` / `DOMAIN_SEPARATOR()` / `eip712Domain()` | EIP-2612/5267 |
| `transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, v, r, s)` | EIP-3009 — **lordo**: `to` riceve `value` esatti, `from` paga `value + fee`. Typehash `TransferWithAuthorization` |
| `receiveWithAuthorization(...)` | come sopra, `to == msg.sender` obbligatorio (altrimenti `CallerNotPayee`). **Typehash DISTINTO `ReceiveWithAuthorization`** (v2.5.0): una firma receive NON è eseguibile via transfer (anti-front-running) |
| `cancelAuthorization(authorizer, nonce, v, r, s)` | invalida un nonce |
| `authorizationState(authorizer, nonce)` | view |

## ERC-1363

| Funzione | Note |
|---|---|
| `transferAndCall(to, value[, data])` | **lordo**; callback `onTransferReceived` su contratti |
| `transferFromAndCall(from, to, value[, data])` | **lordo**; l'allowance deve coprire il lordo EFFETTIVAMENTE pagato: `value + fee`, oppure solo `value` se `from` è il fee collector (fee saltata, v2.5.0) |
| `approveAndCall(spender, value[, data])` | approve + callback `onApprovalReceived` |
| `supportsInterface(bytes4)` | IERC1363, IAccessControl, IERC165 |

## Recovery (RECOVERER_ROLE)

| Funzione | Note |
|---|---|
| `recoverERC20(token, to, amount)` | SafeERC20; con `token == address(this)` passa dal percorso standard (fee+pausa); emette `AssetRecovered` |
| `recoverNative(to, amount)` | revert `NativeTransferFailed` se la call fallisce; emette `AssetRecovered` (asset=0x0) |
| `recoverERC721(nft, to, tokenId)` | `IERC721.safeTransferFrom`; emette `AssetRecovered` |

Evento: `AssetRecovered(AssetKind indexed kind, address indexed asset, address indexed to, uint256 amountOrTokenId, address executor)` — `kind`: 0=ERC20, 1=Native, 2=ERC721. Hook primario per il monitoraggio dei movimenti di fondi da parte del RECOVERER.

## Upgrade (UPGRADER_ROLE)

| Funzione | Note |
|---|---|
| `upgradeToAndCall(newImplementation, data)` | UUPS; `_authorizeUpgrade` gated dal ruolo |

## ContractURIs (v2.4.0) — pointer informativi, DEFAULT_ADMIN_ROLE

| Funzione | Note |
|---|---|
| `websiteURI()` / `setWebsiteURI(string)` | landing page ufficiale dell'emittente; evento `WebsiteURIUpdated(prev, new)` |
| `reserveInfoURI()` / `setReserveInfoURI(string)` | pagina attestazioni proof-of-reserve (PEG_ORO.md) — pointer, non prova; evento `ReserveInfoURIUpdated(prev, new)` |
| `contractURI()` / `setContractURI(string)` | metadata a livello contratto (ERC-7572); emette `ContractURIUpdated(prev, new)` **e** l'evento canonico parameter-less `ContractURIUpdated()` (v2.5.0) per il refresh degli explorer conformi |

Tutti i setter richiedono `DEFAULT_ADMIN_ROLE`, non `FEE_ADMIN`/`SWEEPER` —
`reserveInfoURI` è l'ancora di fiducia del token.

## Governance handover (v2.4.0, AccessControlDefaultAdminRules)

Il transfer di `DEFAULT_ADMIN_ROLE` è a due fasi con delay obbligatorio —
`grantRole`/`revokeRole` su `DEFAULT_ADMIN_ROLE` **revertono sempre**:

| Funzione | Ruolo | Note |
|---|---|---|
| `beginDefaultAdminTransfer(address newAdmin)` | DEFAULT_ADMIN | schedula il transfer; evento `DefaultAdminTransferScheduled(newAdmin, schedule)` |
| `acceptDefaultAdminTransfer()` | admin pendente | completa l'handover dopo il delay; reverta con `AccessControlInvalidDefaultAdmin`/`AccessControlEnforcedDefaultAdminDelay` se il chiamante o il timing sono sbagliati |
| `cancelDefaultAdminTransfer()` | DEFAULT_ADMIN | annulla il transfer schedulato; evento `DefaultAdminTransferCanceled()` |
| `changeDefaultAdminDelay(uint48)` / `rollbackDefaultAdminDelay()` | DEFAULT_ADMIN | ricalibra il delay stesso (con la propria finestra di sicurezza) |
| `owner()` / `defaultAdmin()` / `pendingDefaultAdmin()` / `defaultAdminDelay()` / `pendingDefaultAdminDelay()` | view | stato corrente/pendente |

Vedi GOVERNANCE.md per la coreografia operativa completa
(`scripts/roles/finalize_governance.ts` + `scripts/roles/accept_governance.ts`).
