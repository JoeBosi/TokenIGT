# API Reference — Token v2.0.0

Ruoli richiesti e matrice completa in [roles.md](./roles.md).
Semantica delle fee in dettaglio in [SPEC_FEE_CUSTODIA.md](./SPEC_FEE_CUSTODIA.md).

## Contract Addresses

### Amoy Testnet
- Deploy v2.0.0 in corso — vedi `deployments/amoy/deploy-info.json` dopo il deploy.
- (v1.6.3 storico: proxy `0x0A06Bad41D08c4634a05a45b8709A32552B1A0ab` — DEPRECATO,
  API incompatibile con la v2)

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
    address defaultAdmin_      // != 0 — InvalidAdmin
)
```

Grant automatici al `defaultAdmin_`: DEFAULT_ADMIN, UPGRADER, FEE_MANAGER, RECOVERER.
Emette `CycleStarted(1, timestamp)`.

## ERC-20 + supply

| Funzione | Note |
|---|---|
| `transfer(to, v)` / `transferFrom(from, to, v)` | fee **dedotta**: destinatario riceve `v - fee(v)`; allowance consumata per `v`; infinite allowance mai decrementata |
| `approve` / `allowance` / `balanceOf` / `totalSupply` / `name` / `symbol` / `decimals` | standard |
| `mint(to, v)` | MINTER_ROLE |
| `burn(from, v)` | BURNER_ROLE |
| `version()` | `"2.0.0"` |

## Transfer fee (fee di scambio)

| Funzione | Ruolo | Note |
|---|---|---|
| `transferFeeBps()` → uint256 | view | 0–100 |
| `setTransferFeeBps(uint256)` | FEE_MANAGER | cap `MAX_TRANSFER_FEE_BPS = 100`; evento `TransferFeeUpdated(old, new)` |
| `feeCollector()` / `setFeeCollector(address)` | view / FEE_MANAGER | ≠0; evento `FeeCollectorUpdated` |
| `isTransferFeeExempt(address)` / `getTransferFeeExemptList()` | view | esente se mittente O destinatario nel set |
| `addTransferFeeExempt(a)` / `removeTransferFeeExempt(a)` | FEE_MANAGER | idempotenti; evento `TransferFeeExemptionChanged(account, exempt)` solo al cambio |
| `previewNet(gross)` | view | netto consegnato da `transfer(gross)` (parti non-esenti) |
| `previewGross(net)` | view | minimo lordo per consegnare ≥ net via `transfer` |
| `maxNetTransferable(sender)` | view | max `v` con `v + fee(v) ≤ balance` (percorso lordo); balance se esente/fee 0; 0 se frozen/blocked |

## Custody fee (fee di custodia)

| Funzione | Ruolo | Note |
|---|---|---|
| `custodyFeeBps()` / `setCustodyFeeBps(uint256)` | view / FEE_MANAGER | cap `MAX_CUSTODY_FEE_BPS = 200`; evento `CustodyFeeUpdated` |
| `custodyTreasury()` / `setCustodyTreasury(address)` | view / FEE_MANAGER | ≠0; evento `CustodyTreasuryUpdated` |
| `currentCycle()` | view | parte da 1 |
| `startNewCycle()` | FEE_MANAGER | evento `CycleStarted(cycle, timestamp)` |
| `lastSweptCycle(holder)` | view | 0 = mai sweepato |
| `isCustodyFeeExempt(a)` / `getCustodyFeeExemptList()` | view | |
| `addCustodyFeeExempt(a)` / `removeCustodyFeeExempt(a)` | FEE_MANAGER | idempotenti; evento `CustodyFeeExemptionChanged` |
| `sweepCustodyFee(address[] holders)` | FEE_MANAGER | fee = `balance × bps / 10000` al momento; skip exempt/già sweepato/treasury/zero; **bypassa pause, transfer fee, blocklist, freeze**; evento `CustodyFeeCollected(holder, fee, cycle)` per ogni prelievo |

## Restrizioni

| Funzione | Ruolo | Note |
|---|---|---|
| `freeze(a)` / `unfreeze(a)` / `isFrozen(a)` | FREEZER / view | binario, idempotente; eventi `Frozen`/`Unfrozen` al cambio |
| `blockAccount(a)` / `unblockAccount(a)` / `isBlocked(a)` | BLOCKER / view | idempotente; eventi `Blocked`/`Unblocked` al cambio |
| `pause()` / `unpause()` / `paused()` | PAUSER / view | blocca tutti i trasferimenti TRANNE lo sweep custodia |

Ordine revert su transfer: `AccountBlocked` → `AccountFrozen` → `EnforcedPause`.
Mint/burn esenti da block/freeze/fee (non dalla pausa).

## Firme off-chain

| Funzione | Note |
|---|---|
| `permit(owner, spender, value, deadline, v, r, s)` | EIP-2612 |
| `nonces(owner)` / `DOMAIN_SEPARATOR()` / `eip712Domain()` | EIP-2612/5267 |
| `transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, v, r, s)` | EIP-3009 — **lordo**: `to` riceve `value` esatti, `from` paga `value + fee` |
| `receiveWithAuthorization(...)` | come sopra, `to == msg.sender` obbligatorio |
| `cancelAuthorization(authorizer, nonce, v, r, s)` | invalida un nonce |
| `authorizationState(authorizer, nonce)` | view |

## ERC-1363

| Funzione | Note |
|---|---|
| `transferAndCall(to, value[, data])` | **lordo**; callback `onTransferReceived` su contratti |
| `transferFromAndCall(from, to, value[, data])` | **lordo**; l'allowance deve coprire `value + fee` e viene consumata per il lordo |
| `approveAndCall(spender, value[, data])` | approve + callback `onApprovalReceived` |
| `supportsInterface(bytes4)` | IERC1363, IAccessControl, IERC165 |

## Recovery (RECOVERER_ROLE)

| Funzione | Note |
|---|---|
| `recoverERC20(token, to, amount)` | SafeERC20; con `token == address(this)` passa dal percorso standard (fee+pausa) |
| `recoverETH(to, amount)` | revert `TransferFailed` se la call fallisce |
| `recoverERC721(nft, to, tokenId)` | `IERC721.safeTransferFrom` |

## Upgrade (UPGRADER_ROLE)

| Funzione | Note |
|---|---|
| `upgradeToAndCall(newImplementation, data)` | UUPS; `_authorizeUpgrade` gated dal ruolo |
