# Audit copertura eventi — Token v2.2.0

> Data: 2026-07-07 · Scopo: verificare che ogni operazione che cambia stato emetta
> un evento adeguato al monitoraggio on-chain. Metodo: enumerazione di TUTTE le
> funzioni state-changing (proprie + ereditate OZ) e mappatura all'evento emesso.

## Verdetto

**Sì, sei a posto per il monitoraggio.** Ogni **movimento di fondi** e ogni **azione
privilegiata** emette un evento. Restano **2 gap MINORI** (nessun fondo in gioco),
entrambi **già mitigati** dall'approccio del piano di monitoraggio (polling di stato).

## Matrice completa (funzione → evento)

### Movimenti di valore
| Funzione | Evento | OK |
|---|---|---|
| `transfer` / `transferFrom` | `Transfer` (netto) + `Transfer` (fee al collector) | ✅ |
| `transferAndCall` / `transferFromAndCall` | `Transfer` (lordo) + `Transfer` (fee) | ✅ |
| `transferWithAuthorization` / `receiveWithAuthorization` | `AuthorizationUsed` + `Transfer` | ✅ |
| `approveAndCall` | `Approval` | ✅ |
| `approve` / `permit` | `Approval` | ✅ |
| `mint` | `Transfer(0x0 → to)` | ✅ |
| `burn` | `Transfer(from → 0x0)` | ✅ |
| `sweepCustodyFee` | `CustodyFeeCollected(holder, fee, cycle)` per prelievo | ✅ (⚠️ vedi Gap 2) |
| `recoverERC20` / `recoverNative` / `recoverERC721` | `AssetRecovered(kind, asset, to, amount, executor)` | ✅ (aggiunto v2.2.0) |

### Azioni privilegiate / configurazione
| Funzione | Evento | OK |
|---|---|---|
| `pause` / `unpause` | `Paused` / `Unpaused` (OZ) | ✅ |
| `freeze` / `unfreeze` | `Frozen` / `Unfrozen` (solo al cambio) | ✅ |
| `blockAccount` / `unblockAccount` | `Blocked` / `Unblocked` (solo al cambio) | ✅ |
| `setTransferFeeBps` | `TransferFeeUpdated(old, new)` | ✅ |
| `setFeeCollector` | `FeeCollectorUpdated(old, new)` | ✅ |
| `add/removeTransferFeeExempt` | `TransferFeeExemptionChanged` (solo al cambio) | ✅ |
| `setCustodyFeeBps` | `CustodyFeeUpdated(old, new)` | ✅ |
| `setCustodyTreasury` | `CustodyTreasuryUpdated(old, new)` | ✅ |
| `add/removeCustodyFeeExempt` | `CustodyFeeExemptionChanged` (solo al cambio) | ✅ |
| `startNewCycle` | `CycleStarted(cycle, ts)` | ✅ |
| `cancelAuthorization` | `AuthorizationCanceled` | ✅ |
| `grantRole` / `revokeRole` / `renounceRole` | `RoleGranted` / `RoleRevoked` (OZ) | ✅ |
| `upgradeToAndCall` | `Upgraded(impl)` (OZ ERC-1967) | ✅ |
| `initialize` | `Initialized` + `RoleGranted`×4 + `CycleStarted(1)` + `Transfer` | ✅ (⚠️ vedi Gap 1) |

## Gap identificati (MINORI)

### Gap 1 — la configurazione INIZIALE non emette gli eventi `*Updated`
`initialize` imposta `transferFeeBps`, `feeCollector`, `custodyFeeBps`,
`custodyTreasury` **senza** emettere `TransferFeeUpdated`/`FeeCollectorUpdated`/
`CustodyFeeUpdated`/`CustodyTreasuryUpdated` (emette solo `CycleStarted(1)`).
- **Conseguenza**: un monitor che ricostruisce la storia **solo dai log** non
  conosce i valori di partenza — deve leggere lo stato una volta al deploy (o gli
  argomenti della tx di deploy).
- **Impatto**: BASSO. Già mitigato: il piano di monitoraggio (§3.4 invarianti)
  legge comunque `feeCollector`/`custodyTreasury`/`*Bps` via polling.
- **Raccomandazione**: emettere i 4 eventi anche dagli initializer, così il log è
  **auto-contenuto** (storia completa ricostruibile senza leggere lo stato). Costo:
  ~poche centinaia di gas una tantum al deploy. È buona pratica per un contratto il
  cui scopo dichiarato è essere monitorato. **Da fare prima del prossimo redeploy**
  (gratis: Amoy è ancora v2.1.0, il redeploy è comunque pendente).

### Gap 2 — sweep di un holder "dust" (fee = 0) non emette nulla
In `sweepCustodyFee`, se `fee == 0` (saldo < 200 wei-token per arrotondamento),
`lastSweptCycle[holder]` viene scritto ma **nessun evento** è emesso.
- **Conseguenza**: un monitor che conta "chi è stato processato nel ciclo" solo da
  `CustodyFeeCollected` non vede i dust holder (processati ma con prelievo 0).
- **Impatto**: MOLTO BASSO. Nessun fondo si muove. Già gestito: il nostro indexer
  (`verifySweepComplete`) verifica `lastSweptCycle` via **lettura di stato**, non
  dagli eventi — quindi conta correttamente i dust.
- **Raccomandazione**: **accettato così**. Emettere un evento per prelievi a zero
  gonfierebbe i log senza valore informativo. Documentato qui.

## Note (non gap)
- **mint/burn** non hanno un evento dedicato (es. `Minted`/`Burned`): usano il
  `Transfer` da/verso `0x0`, che è lo standard ERC-20 e pienamente monitorabile.
  (In v1 esistevano `MintOperationDebug`/`BurnOperationDebug`, rimossi come bloat —
  scelta corretta, decisione D8.)
- **`receive()`** (ingresso di POL nativo nel contratto) non emette log: è una
  limitazione dell'EVM (i trasferimenti nativi in ingresso non generano log). Si
  monitora via saldo/internal-tx, non via eventi — coperto dal polling del piano.

## Conclusione
La copertura eventi è **completa su tutto ciò che conta** (fondi + privilegi).
Gap 1 vale la pena chiuderlo prima del redeploy per avere un log auto-contenuto;
Gap 2 è accettato. Nessun gap bloccante per il sistema di monitoraggio.
