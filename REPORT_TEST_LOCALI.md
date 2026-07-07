# Report test eseguiti in locale — Token v2.0.0

> Data run: 2026-07-06 · Branch `2026706ClaudeCode` · Ambiente: **locale**
> (Foundry EVM in-process + rete Hardhat effimera — nessun test su Polygon/Amoy incluso)
>
> **Esito complessivo: 447 test eseguiti, 447 passati, 0 falliti**
> (258 Foundry: unit + fuzz + invariant · 189 Hardhat/TypeScript)
> Aggiornamento 2026-07-06: +14 test di chiusura lacune (vedi §21 — policy collector,
> treasury, reentrancy, cross-chain, gas profile, governance)

**Legenda**
- `[F]` = test Foundry (Solidity) · `[H]` = test Hardhat (TypeScript)
- **Ottenuto** `=` significa: identico all'atteso (tutte le assertion superate)
- Esito: 🟢 OK = passato · 🔴 KO = fallito · ⚪ = non testato (sezione finale)
- I test fuzz eseguono 1000 run con input casuali; gli invariant 1000 run × 100 profondità

### Riepilogo per area

| Area | N. test | Esito |
|---|---:|---|
| Initialize e validazioni deploy | 17 | 🟢 tutti OK |
| ERC-20 core (transfer/approve/metadata) | 34 | 🟢 tutti OK |
| Supply (mint/burn) | 22 | 🟢 tutti OK |
| Transfer fee — configurazione | 30 | 🟢 tutti OK |
| Transfer fee — semantica netta e lorda (+ policy collector) | 45 | 🟢 tutti OK |
| View di preview | 13 | 🟢 tutti OK |
| Matrice fee = 0 | 13 | 🟢 tutti OK |
| Custody fee (+ treasury policy, batch vuoto, gas) | 61 | 🟢 tutti OK |
| Freeze | 21 | 🟢 tutti OK |
| Blocklist | 19 | 🟢 tutti OK |
| Pausable | 15 | 🟢 tutti OK |
| Access control / ruoli (+ getRoleAdmin, lockout admin) | 27 | 🟢 tutti OK |
| EIP-2612 Permit + EIP-5267 (+ flusso gasless completo) | 14 | 🟢 tutti OK |
| EIP-3009 (+ replay cross-chain) | 30 | 🟢 tutti OK |
| ERC-1363 (+ reentrancy avversariale) | 41 | 🟢 tutti OK |
| Recovery | 31 | 🟢 tutti OK |
| Upgrade UUPS (+ implementation non-UUPS) | 16 | 🟢 tutti OK |
| Storage layout ERC-7201 | 6 | 🟢 tutti OK |
| Interazioni cross-feature + edge case | 20 | 🟢 tutti OK |
| Invariant (stateful fuzzing) | 7 | 🟢 tutti OK |
| **Totale** | **447** | **🟢 447 / 🔴 0** |

---

## 1. Initialize e validazioni deploy (16)

| Metodo/attributo | Descrizione test | Risultato atteso | Ottenuto | Esito |
|---|---|---|---|---|
| `initialize` | [F] `test_init_transferFeeAtMax_succeeds` — deploy con fee = 100 (cap) | deploy ok, `transferFeeBps()==100` | = | 🟢 OK |
| `initialize` | [F] `test_init_transferFeeExceedsMax_reverts` — fee = 101 | revert `FeeExceedsMaximum(101,100)` | = | 🟢 OK |
| `initialize` | [F] `testFuzz_init_validTransferFeeRange` — fuzz fee ∈ [0,100] | deploy sempre ok | = | 🟢 OK |
| `initialize` | [F] `testFuzz_init_invalidTransferFeeReverts` — fuzz fee > 100 | revert sempre, errore preciso | = | 🟢 OK |
| `initialize` | [F] `test_init_custodyFeeAtMax_succeeds` — custody = 200 (cap) | deploy ok | = | 🟢 OK |
| `initialize` | [F] `test_init_custodyFeeExceedsMax_reverts` — custody = 201 | revert `CustodyFeeExceedsMaximum(201,200)` | = | 🟢 OK |
| `initialize` | [F] `testFuzz_init_validCustodyFeeRange` — fuzz ∈ [0,200] | deploy sempre ok | = | 🟢 OK |
| `initialize` | [F] `testFuzz_init_invalidCustodyFeeReverts` — fuzz > 200 | revert sempre | = | 🟢 OK |
| `initialize` | [F] `test_init_zeroAdmin_reverts` — admin = 0x0 | revert `InvalidAdmin` | = | 🟢 OK |
| `initialize` | [F] `test_init_zeroFeeCollector_reverts` — collector = 0x0 | revert `InvalidFeeCollector` | = | 🟢 OK |
| `initialize` | [F] `test_init_zeroCustodyTreasury_reverts` — treasury = 0x0 | revert `InvalidCustodyTreasury` | = | 🟢 OK |
| `name`/`symbol` | [H] core: Should set the correct name and symbol | "IGE Token"/"IGT" | = | 🟢 OK |
| `decimals` | [H] core: Should set the correct decimals | 18 | = | 🟢 OK |
| `totalSupply`/`balanceOf` | [H] core: Should mint initial supply to the holder | supply iniziale all'holder | = | 🟢 OK |
| `transferFeeBps` | [H] core: Should set the initial fee | valore da initialize | = | 🟢 OK |
| `feeCollector` | [H] core: Should set the fee collector | indirizzo da initialize | = | 🟢 OK |

## 2. ERC-20 core (34)

| Metodo/attributo | Descrizione test | Risultato atteso | Ottenuto | Esito |
|---|---|---|---|---|
| `transfer` | [H] core: Should transfer tokens between accounts | balance aggiornati (netto con fee) | = | 🟢 OK |
| `transfer` | [H] core: Should fail when sender doesn't have enough tokens | revert `ERC20InsufficientBalance` | = | 🟢 OK |
| `transfer` | [F] `test_transferZeroAmount` — transfer di 0 | nessun revert, supply e balance invariati | = | 🟢 OK |
| `transfer` | [H] edge: Should handle zero amount transfers | come sopra | = | 🟢 OK |
| `transfer` | [H] edge: Should reject transfers to zero address | revert `ERC20InvalidReceiver` | = | 🟢 OK |
| `transfer` | [H] edge: Should handle large transfers | importi grandi trasferiti correttamente | = | 🟢 OK |
| `transfer` (evento) | [H] core: Should emit Transfer event | evento `Transfer(from,to,value)` | = | 🟢 OK |
| `approve` | [H] core: Should update allowances correctly | allowance impostata | = | 🟢 OK |
| `approve` (evento) | [H] core: Should emit Approval event | evento `Approval` | = | 🟢 OK |
| `approve`/`allowance` | [F] `test_allowance` — set e sovrascrittura | 100 → 50 sovrascritta | = | 🟢 OK |
| `approve` | [H] edge: Should handle maximum uint256 approvals | `type(uint256).max` accettato | = | 🟢 OK |
| `transferFrom` | [H] core: Should transferFrom with allowance | trasferisce e scala l'allowance | = | 🟢 OK |
| `transferFrom` | [H] core: Should fail transferFrom without allowance | revert `ERC20InsufficientAllowance` | = | 🟢 OK |
| `transferFrom` | [F] `test_transferFrom` — con fee 1% | destinatario 297 su 300, collector 3, allowance 500→200 | = | 🟢 OK |
| `transferFrom` | [F] `test_infiniteAllowanceNotDecremented` | allowance `max` NON scalata (fix A2) | = | 🟢 OK |
| `balanceOf` | [H] core: Should return zero balance for non-existent account | 0 | = | 🟢 OK |
| `balanceOf` | [H] core: Should return correct balance after multiple transfers | somma corretta | = | 🟢 OK |
| `name` | [H] metadata: Should return the correct name | "IGE Token" | = | 🟢 OK |
| `symbol` | [H] metadata: Should return the correct symbol | "IGT" | = | 🟢 OK |
| `decimals` | [H] metadata: Should return 18 decimals | 18 | = | 🟢 OK |
| `totalSupply` | [H] metadata: Should return initial total supply | supply iniziale | = | 🟢 OK |
| `totalSupply` | [H] metadata: Should update total supply after mint | supply + minted | = | 🟢 OK |
| `totalSupply` | [H] metadata: Should update total supply after burn | supply − burned | = | 🟢 OK |
| `version` | [F] `test_version` + [F] `test_version_returnsV2` (2 test) | "2.0.0" | = | 🟢 OK |
| `transfer`/pipeline | [F] `test_update_zeroFee_normalTransfer` — ramo else senza fee | un solo Transfer, importo esatto | = | 🟢 OK |
| pipeline `_update` | [F] `test_update_mintPath_noFee` — mint non paga fee | nessuna gamba fee su mint | = | 🟢 OK |
| pipeline `_update` | [F] `test_update_burnPath_noFee` — burn non paga fee | nessuna gamba fee su burn | = | 🟢 OK |
| pipeline `_update` | [F] `test_update_mintPath_bypassesFreezeAndBlock` | mint verso frozen/blocked consentito | = | 🟢 OK |
| pipeline `_update` | [F] `test_update_burnPath_bypassesFreezeAndBlock` | burn da frozen/blocked consentito | = | 🟢 OK |
| pipeline `_update` | [F] `test_update_mintPath_pausedReverts` | mint in pausa → `EnforcedPause` | = | 🟢 OK |
| pipeline `_update` | [F] `test_update_burnPath_pausedReverts` | burn in pausa → `EnforcedPause` | = | 🟢 OK |
| pipeline `_update` | [F] `test_update_collectorIsFrom_noSecondTransfer` | collector==mittente: fee resta a lui, 1 solo evento | = | 🟢 OK |
| `transfer` (fuzz) | [F] `testFuzz_transferWithFee` — fuzz importo×fee×balance | mittente −v, destinatario +v−fee, collector +fee, supply invariata | = | 🟢 OK |

## 3. Supply — mint/burn (22)

| Metodo/attributo | Descrizione test | Risultato atteso | Ottenuto | Esito |
|---|---|---|---|---|
| `mint` | [F] `testFuzz_mint` — fuzz destinatario×importo | supply e balance +amount | = | 🟢 OK |
| `mint` | [F] `test_mintToZeroAddressReverts` | revert | = | 🟢 OK |
| `mint` | [H] supply: Should allow minter to mint tokens | mint ok con ruolo | = | 🟢 OK |
| `mint` (evento) | [H] supply: Should emit Transfer event on mint | `Transfer(0x0, to, v)` | = | 🟢 OK |
| `mint` | [H] supply: Should not allow non-minter to mint | revert `AccessControlUnauthorizedAccount` | = | 🟢 OK |
| `mint` | [H] supply: Should allow multiple mints | somma corretta | = | 🟢 OK |
| `burn` | [F] `testFuzz_burn` — fuzz mint+burn | supply e balance −amount | = | 🟢 OK |
| `burn` | [F] `test_burnMoreThanBalanceReverts` | revert `ERC20InsufficientBalance` | = | 🟢 OK |
| `burn` | [F] `test_burnFromSelf` — burn dal proprio account (con ruolo) | balance e supply scalati | = | 🟢 OK |
| `burn` | [H] supply: Should allow burner to burn tokens | burn ok con ruolo | = | 🟢 OK |
| `burn` (evento) | [H] supply: Should emit Transfer event on burn | `Transfer(from, 0x0, v)` | = | 🟢 OK |
| `burn` | [H] supply: Should not allow non-burner to burn | revert access control | = | 🟢 OK |
| `burn` | [H] supply: Should fail when burning more than balance | revert | = | 🟢 OK |
| `burn` | [H] supply: Should burn from owner without consent | BURNER può bruciare da terzi (per design) | = | 🟢 OK |
| `mint`+`burn` | [H] supply: Should handle mint and burn correctly | sequenza coerente | = | 🟢 OK |
| `mint` | [H] roles: Should allow minter to mint | ok | = | 🟢 OK |
| `mint` | [H] roles: Should not allow non-minter to mint | revert | = | 🟢 OK |
| `burn` | [H] roles: Should allow burner to burn | ok | = | 🟢 OK |
| `burn` | [H] roles: Should not allow non-burner to burn | revert | = | 🟢 OK |
| `burn` × freeze | [H] freeze: Should allow burn to override freeze | burn su account frozen consentito | = | 🟢 OK |
| `burn` × block | [H] block: Should NOT block burn from blocked address | burn su blocked consentito | = | 🟢 OK |
| `mint` × block | [H] block: Should NOT block mint to blocked address | mint verso blocked consentito | = | 🟢 OK |

## 4. Transfer fee — configurazione (30)

| Metodo/attributo | Descrizione test | Risultato atteso | Ottenuto | Esito |
|---|---|---|---|---|
| `setTransferFeeBps` | [F] `testFuzz_setTransferFeeBps` — fuzz ∈ [0,100] | valore memorizzato | = | 🟢 OK |
| `setTransferFeeBps` | [F] `testFuzz_setTransferFeeBpsRevertsIfTooHigh` — fuzz > 100 | revert `FeeExceedsMaximum(x,100)` | = | 🟢 OK |
| `setTransferFeeBps` | [F] `test_setTransferFeeBps_success` + evento | `TransferFeeUpdated(old,new)` | = | 🟢 OK |
| `setTransferFeeBps` | [F] `test_setTransferFeeBps_aboveMaxReverts` — 101 | revert con errore preciso | = | 🟢 OK |
| `setTransferFeeBps` | [H] fee: Should allow fee admin to set fee | ok con FEE_MANAGER | = | 🟢 OK |
| `setTransferFeeBps` | [H] fee: Should not allow fee above maximum (999) | revert (cap 100) | = | 🟢 OK |
| `setTransferFeeBps` | [H] fee: Should allow fee at maximum (100) | 100 accettato | = | 🟢 OK |
| `setTransferFeeBps` | [H] fee: Should not allow non-fee admin to set fee | revert access control | = | 🟢 OK |
| `transferFeeBps` | [H] fee: Should have initial fee set correctly | valore init | = | 🟢 OK |
| `MAX_TRANSFER_FEE_BPS` | [F] `test_maxTransferFee` | costante = 100 | = | 🟢 OK |
| `setFeeCollector` | [F] `test_setFeeCollector_success` + evento | `FeeCollectorUpdated(old,new)` | = | 🟢 OK |
| `setFeeCollector` | [F] `test_setFeeCollector_zeroAddressReverts` | revert `InvalidFeeCollector` | = | 🟢 OK |
| `setFeeCollector` | [F] `test_setFeeCollector_nonFeeManagerReverts` | revert access control con ruolo indicato | = | 🟢 OK |
| `setFeeCollector` | [H] fee: Should allow fee admin to set fee collector | ok | = | 🟢 OK |
| `setFeeCollector` | [H] fee: Should not allow zero address as fee collector | revert | = | 🟢 OK |
| `addTransferFeeExempt` | [F] `test_addTransferFeeExempt_idempotent` | evento solo al 1° add, no-op al 2° | = | 🟢 OK |
| `removeTransferFeeExempt` | [F] `test_removeTransferFeeExempt_idempotent` | evento solo se rimuove davvero | = | 🟢 OK |
| `removeTransferFeeExempt` | [F] `test_removeTransferFeeExempt` (suite base) | flag torna false | = | 🟢 OK |
| `getTransferFeeExemptList` | [F] `test_getTransferFeeExemptList_membership` | membership e lunghezza corrette (ordine non garantito) | = | 🟢 OK |
| `addTransferFeeExempt` | [H] fee: Should allow fee admin to add fee-free address | ok | = | 🟢 OK |
| `removeTransferFeeExempt` | [H] fee: Should allow fee admin to remove fee-free address | ok | = | 🟢 OK |
| `addTransferFeeExempt` | [H] fee: Should not allow non-fee admin to add | revert | = | 🟢 OK |
| esenzioni × transfer | [F] `test_transferFeeExemption` — sender esente a fee max | nessuna fee, importo pieno | = | 🟢 OK |
| esenzioni × transfer | [F] `testFuzz_transferFromExempt` — fuzz importo×fee | importo sempre pieno | = | 🟢 OK |
| esenzioni × transfer | [F] `test_fee_senderExempt_noFee` | nessuna fee | = | 🟢 OK |
| esenzioni × transfer | [F] `test_fee_recipientExempt_noFee` + [F] `testFuzz_fee_recipientExempt` (2 test) | nessuna fee se destinatario esente | = | 🟢 OK |
| collector == from | [F] `test_fee_collectorEqualsFrom_noExtraTransfer` | fee resta al mittente, 1 evento | = | 🟢 OK |
| fee = 0 | [F] `test_fee_zeroFee_exactTransfer` | trasferimento esatto, 1 evento | = | 🟢 OK |
| fee su mint | [H] fee: Should not apply fee to mint | nessuna fee | = | 🟢 OK |
| fee su burn | [H] fee: Should not apply fee to burn | nessuna fee | = | 🟢 OK |

## 5. Transfer fee — semantica netta e lorda (42)

| Metodo/attributo | Descrizione test | Risultato atteso | Ottenuto | Esito |
|---|---|---|---|---|
| `transfer` (netto) | [F] `test_transfer_net_balancesAndEvents` | −v / +v−fee / +fee, due eventi `Transfer` esatti | = | 🟢 OK |
| `transfer` (netto) | [H] semantics: mittente −v, destinatario +v−fee, collector +fee | balance ed eventi esatti | = | 🟢 OK |
| `transfer` (netto) | [H] fee: Should apply fee on transfer | fee al collector | = | 🟢 OK |
| `transfer` (netto) | [H] fee: Should not apply fee when fee is zero | importo pieno | = | 🟢 OK |
| `transfer` (netto) | [H] fee: sender fee-free / recipient fee-free (2 test) | importo pieno | = | 🟢 OK |
| `transferFrom` (netto) | [F] `test_transferFrom_net_balancesAndEvents_allowanceConsumedForValue` | allowance scalata di v (non lordo) | = | 🟢 OK |
| `transferFrom` (netto) | [H] semantics: allowance consumata per v | = atteso | = | 🟢 OK |
| `transferFrom` | [F] `test_transferFrom_infiniteAllowanceNotDecremented` | allowance max intatta | = | 🟢 OK |
| `transferFrom` | [H] semantics: infinite allowance mai decrementata | intatta | = | 🟢 OK |
| collector==from (netto) | [F] `test_transfer_collectorIsSender_singleEventFeeStays` | 1 evento, fee trattenuta | = | 🟢 OK |
| esenzioni (netto) | [F] `test_transfer_senderExempt_noFee` / `test_transfer_recipientExempt_noFee` (2) | importo pieno | = | 🟢 OK |
| `transferAndCall` (lordo) | [F] `test_transferAndCall_gross_balancesAndEvents` | destinatario +v ESATTI, mittente −(v+fee), eventi (v) e (fee) | = | 🟢 OK |
| `transferAndCall` (lordo) | [H] semantics: destinatario +v esatti, mittente −(v+fee) | = atteso | = | 🟢 OK |
| `transferAndCall` (lordo) | [F] `test_transferAndCall_grossFee_recipientReceivesExactValue` | +v esatti | = | 🟢 OK |
| `transferAndCall` (lordo) | [F] `test_transferAndCall_grossFee_callbackReceivesValue` | callback riceve v (non v−fee) | = | 🟢 OK |
| `transferAndCall` (lordo) | [F] `testFuzz_transferAndCall_grossFee` — fuzz importi | conservazione esatta sui 3 conti | = | 🟢 OK |
| `transferAndCall` (lordo) | [F] `testFuzz_transferAndCall_exactAmount` — fuzz | destinatario sempre +v esatti | = | 🟢 OK |
| `transferAndCall` saldo | [F] `test_transferAndCall_insufficientBalanceForGrossReverts` | revert `ERC20InsufficientBalance` se saldo < v+fee | = | 🟢 OK |
| `transferAndCall` saldo | [F] `test_transferAndCall_insufficientBalanceForGrossFeeReverts` | revert sulla gamba fee | = | 🟢 OK |
| `transferAndCall` saldo | [H] semantics: gross path revert se saldo non copre v+fee | revert | = | 🟢 OK |
| collector==from (lordo) | [F] `test_transferAndCall_collectorIsSender_singleEventFeeStays` | 1 evento, fee trattenuta | = | 🟢 OK |
| esenzioni (lordo) | [F] `test_transferAndCall_senderExempt_noFee` ×2 suite + [H] ×1 (3 test) | mittente paga solo v | = | 🟢 OK |
| esenzioni (lordo) | [F] `test_transferAndCall_recipientExempt_noFee` ×2 suite (2 test) | nessuna fee | = | 🟢 OK |
| `transferFromAndCall` | [F] `test_transferFromAndCall_gross_balancesAndEvents_allowanceConsumedForGross` | allowance scalata di v+fee | = | 🟢 OK |
| `transferFromAndCall` | [F] `test_transferFromAndCall_insufficientGrossAllowanceReverts` | revert `ERC20InsufficientAllowance` | = | 🟢 OK |
| `transferFromAndCall` | [F] `test_transferFromAndCall_allowanceExactGross_passes` | allowance = v+fee esatta basta | = | 🟢 OK |
| `transferFromAndCall` | [F] `test_transferFromAndCall_allowanceOnlyValueWithFeeReverts` | allowance = v con fee>0 → revert | = | 🟢 OK |
| `transferFromAndCall` | [H] erc1363: Should revert when allowance covers only the value | revert | = | 🟢 OK |
| `transferFromAndCall` | [F] `test_transferFromAndCall_senderExempt_allowanceCoversValueOnly` ×2 suite (2) | esente: basta allowance = v | = | 🟢 OK |
| `transferFromAndCall` | [F] `test_transferFromAndCall_infiniteAllowanceNotDecremented` ×2 suite (2) | allowance max intatta | = | 🟢 OK |
| `transferWithAuthorization` (lordo) | [F] `test_transferWithAuthorization_gross_balancesAndEvents` | +v esatti al destinatario, −(v+fee) al firmatario | = | 🟢 OK |
| `transferWithAuthorization` (lordo) | [H] semantics: destinatario riceve esattamente il value firmato | = atteso | = | 🟢 OK |
| `receiveWithAuthorization` (lordo) | [F] `test_receiveWithAuthorization_gross_balancesAndEvents` | idem con caller = destinatario | = | 🟢 OK |
| `transferWithAuthorization` saldo | [F] `test_transferWithAuthorization_insufficientBalanceForGrossReverts` | revert se saldo = v esatto (manca fee) | = | 🟢 OK |
| esenzioni (3009) | [F] `test_transferWithAuthorization_senderExempt_noFee` / `recipientExempt_noFee` (2) | nessuna fee | = | 🟢 OK |

## 6. View di preview (13)

| Metodo/attributo | Descrizione test | Risultato atteso | Ottenuto | Esito |
|---|---|---|---|---|
| `previewNet` | [F] `testFuzz_previewNet_formula` — fuzz bps×importo | `g − g·bps/10000` sempre | = | 🟢 OK |
| `previewGross` | [F] `testFuzz_previewGross_correctAndMinimal` — fuzz | consegna ≥ net E `previewGross−1` consegna < net (minimalità) | = | 🟢 OK |
| `previewNet`/`previewGross` | [F] `test_preview_concreteValues` — valori noti | numeri esatti calcolati a mano | = | 🟢 OK |
| `previewNet`/`previewGross` | [F] `test_preview_zeroFee_identity` — fee 0 | identità (x→x) | = | 🟢 OK |
| `previewNet`/`previewGross` | [H] semantics: coerenti e inverse | correttezza + minimalità | = | 🟢 OK |
| `maxNetTransferable` | [F] `testFuzz_maxNetTransferable_maximalGrossSpend` — fuzz | `v+fee(v) ≤ bal` E `(v+1)+fee(v+1) > bal` | = | 🟢 OK |
| `maxNetTransferable` | [F] `test_maxNetTransferable_boundaryOnGrossPath` | v spendibile, v+1 reverta | = | 🟢 OK |
| `maxNetTransferable` | [H] semantics: massimo v spendibile sul percorso lordo | v spendibile davvero on-chain | = | 🟢 OK |
| `maxNetTransferable` | [F] `test_maxNetTransferable_exemptReturnsFullBalance` | balance pieno se esente | = | 🟢 OK |
| `maxNetTransferable` | [F] `test_maxNetTransferable_zeroFeeReturnsFullBalance` | balance pieno con fee 0 | = | 🟢 OK |
| `maxNetTransferable` | [F] `test_maxNetTransferable_frozenReturnsZero` | 0 se frozen | = | 🟢 OK |
| `maxNetTransferable` | [F] `test_maxNetTransferable_blockedReturnsZero` | 0 se blocked | = | 🟢 OK |
| `maxNetTransferable` | [H] semantics: = 0 per account frozen o blocked | 0 | = | 🟢 OK |

## 7. Matrice FEE = 0 — requisito esplicito (13)

| Metodo/attributo | Descrizione test | Risultato atteso | Ottenuto | Esito |
|---|---|---|---|---|
| `transfer` | [F] `test_zeroFee_transfer_behavesAsPureERC20` | 1 solo evento Transfer, conservazione esatta | = | 🟢 OK |
| `transferFrom` | [F] `test_zeroFee_transferFrom_behavesAsPureERC20` | idem | = | 🟢 OK |
| `transferAndCall` | [F] `test_zeroFee_transferAndCall_behavesAsPureERC20` | idem | = | 🟢 OK |
| `transferFromAndCall` | [F] `test_zeroFee_transferFromAndCall_behavesAsPureERC20` | idem, allowance = v basta | = | 🟢 OK |
| `transferWithAuthorization` | [F] `test_zeroFee_transferWithAuthorization_behavesAsPureERC20` | idem | = | 🟢 OK |
| `receiveWithAuthorization` | [F] `test_zeroFee_receiveWithAuthorization_behavesAsPureERC20` | idem | = | 🟢 OK |
| tutti i percorsi | [H] semantics: ogni percorso si comporta come un ERC-20 puro | collector mai pagato, preview = identità, sweep 0 = no-op | = | 🟢 OK |
| `transferAndCall` | [F] `test_transferAndCall_feeZero_identicalToPlainERC20` | identico a ERC-20 | = | 🟢 OK |
| `transferWithAuthorization` | [F] `test_transferWithAuthorization_zeroFee_behavesLikePlainERC20` | identico a ERC-20 | = | 🟢 OK |
| `sweepCustodyFee` (bps 0) | [F] `test_sweep_zeroBps_marksCycleWithoutTransfer` | ciclo marcato, zero transfer/eventi | = | 🟢 OK |
| `sweepCustodyFee` (bps 0) | [H] custody: Should mark the cycle but transfer nothing | idem | = | 🟢 OK |
| `previewNet/Gross` (fee 0) | [F] `test_preview_zeroFee_identity` (già in §6, qui per completezza matrice) | identità | = | 🟢 OK |
| `maxNetTransferable` (fee 0) | [F] `test_maxNetTransferable_zeroFeeReturnsFullBalance` (già in §6) | balance pieno | = | 🟢 OK |

*(le ultime 2 righe sono le stesse di §6, contate una sola volta nei totali)*

## 8. Custody fee (57)

| Metodo/attributo | Descrizione test | Risultato atteso | Ottenuto | Esito |
|---|---|---|---|---|
| `initialize` (custody) | [F] `test_initialize_custodyParamsStored` | bps e treasury memorizzati | = | 🟢 OK |
| `initialize` (custody) | [F] `test_initialize_emitsCycleStartedOne` | evento `CycleStarted(1, ts)` | = | 🟢 OK |
| `initialize` (custody) | [F] `test_initialize_custodyFeeAboveCapReverts` / `test_initialize_zeroTreasuryReverts` (2) | revert con errori precisi | = | 🟢 OK |
| `initialize` (custody) | [H] custody: Should initialize custody config and open cycle 1 | bps/treasury/ciclo=1 | = | 🟢 OK |
| `setCustodyFeeBps` | [F] `test_setCustodyFeeBps_updatesAndEmits` | `CustodyFeeUpdated(old,new)` | = | 🟢 OK |
| `setCustodyFeeBps` | [F] `test_setCustodyFeeBps_atCapSucceeds` — 200 | ok | = | 🟢 OK |
| `setCustodyFeeBps` | [F] `test_setCustodyFeeBps_aboveCapReverts` — 201 | revert `CustodyFeeExceedsMaximum` | = | 🟢 OK |
| `setCustodyFeeBps` | [F] `test_setCustodyFeeBps_withoutRoleReverts` | revert access control | = | 🟢 OK |
| `setCustodyFeeBps` | [H] custody: Should enforce the 200 bps cap | revert a 201, ok a 200 | = | 🟢 OK |
| `MAX_CUSTODY_FEE_BPS` | [F] `test_maxCustodyFee` | costante = 200 | = | 🟢 OK |
| `setCustodyTreasury` | [F] `test_setCustodyTreasury_updatesAndEmits` | `CustodyTreasuryUpdated(old,new)` | = | 🟢 OK |
| `setCustodyTreasury` | [F] `test_setCustodyTreasury_zeroAddressReverts` | revert `InvalidCustodyTreasury` | = | 🟢 OK |
| `setCustodyTreasury` | [F] `test_setCustodyTreasury_withoutRoleReverts` | revert access control | = | 🟢 OK |
| `setCustodyTreasury` | [H] custody: Should reject the zero address as treasury | revert | = | 🟢 OK |
| eventi config | [H] custody: Should emit events on config changes | entrambi gli eventi con args | = | 🟢 OK |
| `addCustodyFeeExempt` | [F] `test_addCustodyFeeExempt_addsAndEmits` | evento `CustodyFeeExemptionChanged(a,true)` | = | 🟢 OK |
| `addCustodyFeeExempt` | [F] `test_addCustodyFeeExempt_repeatedNoEvent` | idempotente, no evento | = | 🟢 OK |
| `addCustodyFeeExempt` | [F] `test_addCustodyFeeExempt_withoutRoleReverts` | revert | = | 🟢 OK |
| `removeCustodyFeeExempt` | [F] `test_removeCustodyFeeExempt_removesAndEmits` | evento `(a,false)` | = | 🟢 OK |
| `removeCustodyFeeExempt` | [F] `test_removeCustodyFeeExempt_nonMemberNoEvent` | no-op silenzioso | = | 🟢 OK |
| `removeCustodyFeeExempt` | [F] `test_removeCustodyFeeExempt_withoutRoleReverts` | revert | = | 🟢 OK |
| `getCustodyFeeExemptList` | [F] `test_getCustodyFeeExemptList_membership` | membership corretta (non ordine) | = | 🟢 OK |
| esenzioni | [H] custody: Should manage the exemption list with events and enumeration | add/remove/idempotenza/lista | = | 🟢 OK |
| `startNewCycle` | [F] `test_startNewCycle_incrementsAndEmits` | ciclo+1, `CycleStarted` | = | 🟢 OK |
| `startNewCycle` | [F] `test_startNewCycle_allowsResweep` | dopo il nuovo ciclo si ripreleva | = | 🟢 OK |
| `startNewCycle` | [F] `test_startNewCycle_withoutRoleReverts` | revert | = | 🟢 OK |
| `startNewCycle` | [H] custody: Should collect again after startNewCycle | ri-prelievo al ciclo 2 | = | 🟢 OK |
| `lastSweptCycle` | [F] `test_lastSweptCycle_viewLifecycle` | 0 → ciclo corrente dopo sweep | = | 🟢 OK |
| `sweepCustodyFee` | [F] `test_sweep_collectsFee_updatesBalances` | holder −fee, treasury +fee | = | 🟢 OK |
| `sweepCustodyFee` | [F] `test_sweep_emitsTransferAndCustodyFeeCollected` | eventi `Transfer` + `CustodyFeeCollected(h,fee,c)` | = | 🟢 OK |
| `sweepCustodyFee` | [H] custody: Should collect the custody fee and emit CustodyFeeCollected | balance + eventi esatti | = | 🟢 OK |
| `sweepCustodyFee` | [F] `test_sweep_feeComputedAtExecutionTime` | fee sul balance corrente, non storico | = | 🟢 OK |
| `sweepCustodyFee` | [H] custody: Should never take more than the balance | fee = frazione del balance, mai insufficienza | = | 🟢 OK |
| `sweepCustodyFee` | [F] `test_sweep_skipsAlreadySweptInCycle` | doppio sweep = no-op | = | 🟢 OK |
| `sweepCustodyFee` | [H] custody: Should be idempotent within the same cycle | no-op totale | = | 🟢 OK |
| `sweepCustodyFee` | [F] `test_sweep_skipsExemptHolder` | esente saltato, NON marcato | = | 🟢 OK |
| `sweepCustodyFee` | [F] `test_sweep_skipsTreasury` | treasury mai auto-prelevata | = | 🟢 OK |
| `sweepCustodyFee` | [F] `test_sweep_skipsZeroAddress` | address(0) saltato senza revert | = | 🟢 OK |
| `sweepCustodyFee` | [H] custody: Should skip exempt holders, the treasury and duplicates | skip corretti nel batch misto | = | 🟢 OK |
| `sweepCustodyFee` | [F] `test_sweep_mixedBatch_collectsOnlyEligible` | batch misto: preleva solo dagli eleggibili | = | 🟢 OK |
| `sweepCustodyFee` | [F] `test_sweep_multipleHolders_batch` | N holder in un batch | = | 🟢 OK |
| `sweepCustodyFee` | [F] `test_sweep_worksWhilePaused` | funziona in pausa (transfer normali no) | = | 🟢 OK |
| `sweepCustodyFee` | [H] custody: Should work while the token is paused | idem | = | 🟢 OK |
| `sweepCustodyFee` | [F] `test_sweep_worksOnFrozenHolder` (D3) | preleva da frozen | = | 🟢 OK |
| `sweepCustodyFee` | [F] `test_sweep_worksOnBlockedHolder` (D3) | preleva da blocked | = | 🟢 OK |
| `sweepCustodyFee` | [H] custody: Should collect from frozen and blocked holders (D3) | idem | = | 🟢 OK |
| `sweepCustodyFee` | [F] `test_sweep_doesNotApplyTransferFee` | treasury riceve la custody fee INTERA | = | 🟢 OK |
| `sweepCustodyFee` | [H] custody: Should not apply the transfer fee on custody collection | idem, con transfer fee al massimo | = | 🟢 OK |
| `sweepCustodyFee` | [F] `test_sweep_dustBalance_feeZeroButMarked` | dust: fee 0 ma ciclo marcato | = | 🟢 OK |
| `sweepCustodyFee` | [F] `test_sweep_afterExemptionRemoved_collectsInSameCycle` | tolta l'esenzione, si preleva nello stesso ciclo | = | 🟢 OK |
| `sweepCustodyFee` | [F] `test_sweepCustodyFee_withoutRoleReverts` | revert access control | = | 🟢 OK |
| access control custody | [H] custody: Should require FEE_MANAGER_ROLE for every write function | 6 funzioni × revert | = | 🟢 OK |
| `sweepCustodyFee` (fuzz) | [F] `testFuzz_sweep_feeNeverExceedsBalance` — fuzz bps×balance | fee mai > balance, mai revert | = | 🟢 OK |
| `sweepCustodyFee` (fuzz) | [F] `testFuzz_sweep_duplicateHolderChargedOnce` | duplicati nel batch → 1 solo prelievo | = | 🟢 OK |
| `sweepCustodyFee` (fuzz) | [F] `testFuzz_sweep_mixedBatchNeverReverts` — batch casuali | mai revert per singolo holder | = | 🟢 OK |

## 9. Freeze (21)

| Metodo/attributo | Descrizione test | Risultato atteso | Ottenuto | Esito |
|---|---|---|---|---|
| `freeze` | [F] `test_freeze_blocksTransfers` | evento `Frozen` + transfer → `AccountFrozen` | = | 🟢 OK |
| `freeze` | [F] `testFuzz_freezeBlocksTransfer` — fuzz balance | account frozen non invia mai | = | 🟢 OK |
| `freeze` | [F] `testFuzz_freeze_blocksAnyTransfer` — fuzz importi | qualsiasi transfer reverta | = | 🟢 OK |
| `freeze` | [F] `test_freeze_idempotent_noEventWhenAlreadyFrozen` | 2° freeze: no evento, stato invariato | = | 🟢 OK |
| `freeze` | [F] `test_freeze_nonFreezerReverts` | revert access control | = | 🟢 OK |
| `freeze` | [H] freeze: Should allow freezer to freeze address | ok | = | 🟢 OK |
| `freeze` (evento) | [H] freeze: Should emit Frozen event | `Frozen(account)` | = | 🟢 OK |
| `freeze` | [H] freeze: Should not allow non-freezer to freeze | revert | = | 🟢 OK |
| `unfreeze` | [F] `test_unfreeze_allowsTransferAgain` | evento `Unfrozen` + transfer ok | = | 🟢 OK |
| `unfreeze` | [F] `test_unfreeze_idempotent_noEventWhenNotFrozen` | no-op silenzioso | = | 🟢 OK |
| `unfreeze` | [F] `test_unfreeze_nonFreezerReverts` | revert | = | 🟢 OK |
| `unfreeze` | [F] `test_unfreezeRestoresTransfer` + `testFuzz_unfreezeRestoresTransfer` (2) | dopo unfreeze si trasferisce | = | 🟢 OK |
| `unfreeze` | [H] freeze: Should allow freezer to unfreeze address | ok | = | 🟢 OK |
| `unfreeze` (evento) | [H] freeze: Should emit Unfrozen event | `Unfrozen(account)` | = | 🟢 OK |
| `unfreeze` | [H] freeze: Should not allow non-freezer to unfreeze | revert | = | 🟢 OK |
| `isFrozen`/`freeze`/`unfreeze` | [F] `test_freezeAndUnfreeze` — ciclo completo | flag true→false | = | 🟢 OK |
| freeze mittente | [H] freeze: Should block transfers from frozen address | revert `AccountFrozen` | = | 🟢 OK |
| freeze destinatario | [H] freeze: Should block transfers to frozen address | revert `AccountFrozen` | = | 🟢 OK |
| freeze × mint | [H] freeze: Should allow mint to frozen address | mint consentito | = | 🟢 OK |
| freeze × ruoli | [H] roles: allow/not allow freezer (2 test) | grant funziona, senza ruolo revert | = | 🟢 OK |

## 10. Blocklist (19)

| Metodo/attributo | Descrizione test | Risultato atteso | Ottenuto | Esito |
|---|---|---|---|---|
| `blockAccount` | [F] `test_blockAccount_blocksAccount` | evento `Blocked` + transfer → `AccountBlocked` | = | 🟢 OK |
| `blockAccount` | [F] `test_blockAccount_idempotent_noEventWhenAlreadyBlocked` | no-op al 2° block | = | 🟢 OK |
| `blockAccount` | [F] `test_blockAccount_nonBlockerReverts` | revert access control | = | 🟢 OK |
| `blockAccount` | [H] block: Should allow blocker to block address | ok | = | 🟢 OK |
| `blockAccount` (evento) | [H] block: Should emit Blocked event | `Blocked(account)` | = | 🟢 OK |
| `blockAccount` | [H] block: Should not allow non-blocker to block | revert | = | 🟢 OK |
| `unblockAccount` | [F] `test_unblockAccount_allowsTransferAgain` | evento `Unblocked` + transfer ok | = | 🟢 OK |
| `unblockAccount` | [F] `test_unblockAccount_idempotent_noEventWhenNotBlocked` | no-op silenzioso | = | 🟢 OK |
| `unblockAccount` | [H] block: Should allow blocker to unblock address | ok | = | 🟢 OK |
| `unblockAccount` (evento) | [H] block: Should emit Unblocked event | `Unblocked(account)` | = | 🟢 OK |
| `unblockAccount` | [H] block: Should not allow non-blocker to unblock | revert | = | 🟢 OK |
| `unblockAccount` | [F] `test_unblockRestoresTransfer` + `testFuzz_unblockRestoresTransfer` (2) | dopo unblock si trasferisce | = | 🟢 OK |
| block mittente | [H] block: Should block transfers from blocked address | revert `AccountBlocked` | = | 🟢 OK |
| block destinatario | [H] block: Should block transfers to blocked address | revert `AccountBlocked` | = | 🟢 OK |
| block entrambi | [F] `test_transferBetweenBlockedReverts` | revert | = | 🟢 OK |
| block × 1363 | [F] `test_transferAndCall_blockedSenderReverts` | revert su percorso lordo | = | 🟢 OK |
| block × 3009 | [F] `test_transferWithAuthorization_blockedFromReverts` | revert su firma valida di account blocked | = | 🟢 OK |
| block × ruoli | [H] roles: allow/not allow blocker (2 test) | grant ok, senza ruolo revert | = | 🟢 OK |

## 11. Pausable (15)

| Metodo/attributo | Descrizione test | Risultato atteso | Ottenuto | Esito |
|---|---|---|---|---|
| `pause` | [H] pause: Should allow pauser to pause | `paused()==true` | = | 🟢 OK |
| `pause` (evento) | [H] pause: Should emit Paused event | `Paused(account)` | = | 🟢 OK |
| `pause` × transfer | [H] pause: Should block transfers when paused | revert `EnforcedPause` | = | 🟢 OK |
| `pause` × transferFrom | [H] pause: Should block transferFrom when paused | revert | = | 🟢 OK |
| `pause` × approve | [H] pause: Should NOT block approve when paused | approve consentito | = | 🟢 OK |
| `pause` × mint | [H] pause: Should block mint when paused | revert | = | 🟢 OK |
| `pause` × burn | [H] pause: Should block burn when paused | revert | = | 🟢 OK |
| `unpause` | [H] pause: Should allow pauser to unpause | `paused()==false` | = | 🟢 OK |
| `unpause` (evento) | [H] pause: Should emit Unpaused event | `Unpaused(account)` | = | 🟢 OK |
| `unpause` × transfer | [H] pause: Should allow transfers after unpause | transfer ok | = | 🟢 OK |
| ciclo completo | [F] `test_pauseUnpauseCycle` | pausa→revert→unpause→ok | = | 🟢 OK |
| `pause` × transfer | [F] `test_transferWhenPausedReverts` | revert `EnforcedPause` | = | 🟢 OK |
| pause × 1363 | [F] `test_transferAndCall_pausedReverts` | percorso lordo bloccato dalla pausa | = | 🟢 OK |
| pause × 3009 | [F] `test_transferWithAuthorization_pausedReverts` | firme non aggirano la pausa | = | 🟢 OK |
| pause × ruoli | [H] roles: allow/not allow pauser (2 test) | senza ruolo revert | = | 🟢 OK |

## 12. Access control / ruoli (25)

| Metodo/attributo | Descrizione test | Risultato atteso | Ottenuto | Esito |
|---|---|---|---|---|
| costanti `*_ROLE` | [H] roles: Should have correct role hashes | keccak256 dei nomi | = | 🟢 OK |
| `DEFAULT_ADMIN_ROLE` | [H] roles: Should grant DEFAULT_ADMIN_ROLE to deployer | admin dall'init | = | 🟢 OK |
| `grantRole` | [H] roles: Should allow admin to grant roles | grant ok + evento | = | 🟢 OK |
| `revokeRole` | [H] roles: Should allow admin to revoke roles | revoke ok | = | 🟢 OK |
| `renounceRole` | [H] roles: Should allow admin to renounce role | rinuncia dal proprio account | = | 🟢 OK |
| `renounceRole` | [F] `test_renounceRole` | `hasRole` diventa false | = | 🟢 OK |
| `grantRole` | [H] roles: Should not allow non-admin to grant roles | revert | = | 🟢 OK |
| `hasRole` | (usato trasversalmente in ~30 assertion) | coerente con grant/revoke | = | 🟢 OK |
| UPGRADER | [H] roles: Should allow upgrader to upgrade | upgrade ok | = | 🟢 OK |
| FEE_MANAGER | [H] roles: allow/not allow fee admin (2 test) | senza ruolo revert | = | 🟢 OK |
| RECOVERER | [H] roles: allow/not allow recoverer (2 test) | senza ruolo revert | = | 🟢 OK |
| gestione multipla | [H] edge: Should handle granting and revoking roles | sequenze grant/revoke | = | 🟢 OK |
| gestione multipla | [H] edge: Should handle multiple role grants | più ruoli stesso account | = | 🟢 OK |
| gestione multipla | [H] edge: Should handle role-based minting | mint funziona solo post-grant | = | 🟢 OK |
| *(altri 10 test "senza ruolo → revert" già contati nelle sezioni feature: freeze ×2, block ×2, custody ×7, recovery ×3, upgrade ×1 — qui il conteggio evita i doppi)* | | | | |

## 13. EIP-2612 Permit + EIP-5267 (13)

| Metodo/attributo | Descrizione test | Risultato atteso | Ottenuto | Esito |
|---|---|---|---|---|
| `permit` | [H] permit: Should permit using EIP-2612 signature | allowance impostata via firma | = | 🟢 OK |
| `permit` | [H] permit: Should increment nonce after permit (×2 test) | nonce +1 | = | 🟢 OK |
| `permit` | [H] permit: Should fail with expired deadline | revert `ERC2612ExpiredSignature` | = | 🟢 OK |
| `permit` | [H] permit: Should fail with invalid signature | revert `ERC2612InvalidSigner` | = | 🟢 OK |
| `nonces` | [H] permit: Should return zero nonce for new account | 0 | = | 🟢 OK |
| `nonces` | [F] `test_nonces` | 0 per account nuovo | = | 🟢 OK |
| `DOMAIN_SEPARATOR` | [F] `test_domainSeparator` | ≠ bytes32(0) | = | 🟢 OK |
| `DOMAIN_SEPARATOR` | [H] eip5267: Should have correct domain separator | coerente con eip712Domain | = | 🟢 OK |
| `eip712Domain` | [F] `test_eip712Domain` | name/version/chainId/contract corretti | = | 🟢 OK |
| `eip712Domain` | [H] eip5267: Should return correct EIP-712 domain | campi corretti | = | 🟢 OK |

## 14. EIP-3009 — firme, nonce, scadenze (29)

| Metodo/attributo | Descrizione test | Risultato atteso | Ottenuto | Esito |
|---|---|---|---|---|
| `transferWithAuthorization` | [F] `test_transferWithAuthorization_valid` | trasferimento eseguito, eventi `AuthorizationUsed`+`Transfer` | = | 🟢 OK |
| `transferWithAuthorization` | [H] eip3009: Should execute transfer with valid authorization | ok | = | 🟢 OK |
| `transferWithAuthorization` (evento) | [H] eip3009: Should emit AuthorizationUsed event | `AuthorizationUsed(from, nonce)` | = | 🟢 OK |
| `transferWithAuthorization` | [F] `test_transferWithAuthorization_replayReverts` | riuso nonce → `AuthorizationAlreadyUsed` | = | 🟢 OK |
| `transferWithAuthorization` | [H] eip3009: Should fail with used nonce | revert | = | 🟢 OK |
| `transferWithAuthorization` | [F] `test_transferWithAuthorization_expiredReverts` | oltre `validBefore` → `AuthorizationExpired` | = | 🟢 OK |
| `transferWithAuthorization` | [H] eip3009: Should fail with expired authorization | revert | = | 🟢 OK |
| `transferWithAuthorization` | [F] `test_transferWithAuthorization_notYetValidReverts` | prima di `validAfter` → `AuthorizationNotYetValid` | = | 🟢 OK |
| `transferWithAuthorization` | [F] `test_transferWithAuthorization_invalidSignatureReverts` | firma altrui → `InvalidSignature` | = | 🟢 OK |
| `transferWithAuthorization` | [F] `test_transferWithAuthorization_nonce_markedUsed` | `authorizationState` diventa true | = | 🟢 OK |
| `transferWithAuthorization` | [F] `test_transferWithAuthorization_frozenFromReverts` | firmatario frozen → revert | = | 🟢 OK |
| `transferWithAuthorization` (fuzz) | [F] `testFuzz_transferWithAuthorization_amount` — fuzz importi | settlement lordo sempre esatto | = | 🟢 OK |
| `transferWithAuthorization` (fuzz) | [F] `testFuzz_transferWithAuthorization_uniqueNonces` — fuzz nonce | nonce indipendenti | = | 🟢 OK |
| `receiveWithAuthorization` | [F] `test_receiveWithAuthorization_valid` | ok se caller = destinatario | = | 🟢 OK |
| `receiveWithAuthorization` | [H] eip3009: valid authorization (recipient calls) | ok | = | 🟢 OK |
| `receiveWithAuthorization` | [F] `test_receiveWithAuthorization_wrongCallerReverts` | caller ≠ to → revert | = | 🟢 OK |
| `receiveWithAuthorization` | [H] eip3009: Should fail when recipient is not msg.sender | revert | = | 🟢 OK |
| `receiveWithAuthorization` | [F] `test_receiveWithAuthorization_replayReverts` | riuso nonce → revert | = | 🟢 OK |
| `cancelAuthorization` | [F] `test_cancelAuthorization_preventsTransfer` | nonce annullato → transfer successivo reverta | = | 🟢 OK |
| `cancelAuthorization` | [F] `test_cancelAuthorization_invalidSignatureReverts` | firma non del titolare → revert | = | 🟢 OK |
| `cancelAuthorization` | [F] `test_cancelAuthorization_alreadyUsedReverts` | nonce già usato → revert | = | 🟢 OK |
| `cancelAuthorization` | [H] eip3009: Should cancel authorization | evento `AuthorizationCanceled` | = | 🟢 OK |
| `authorizationState` | [F] `test_authorizationState_freshIsfalse` | false per nonce nuovo | = | 🟢 OK |
| *(+ 6 test di settlement lordo/esenzioni/pausa/block già dettagliati in §5, §10, §11)* | | | | |

## 15. ERC-1363 — callback (40)

| Metodo/attributo | Descrizione test | Risultato atteso | Ottenuto | Esito |
|---|---|---|---|---|
| `transferAndCall(to,v)` | [F] `test_transferAndCall_toGoodReceiver` | transfer + callback `onTransferReceived` | = | 🟢 OK |
| `transferAndCall` | [H] erc1363: Should transfer tokens and call receiver | evento `TransferReceived` dal mock | = | 🟢 OK |
| `transferAndCall` | [H] erc1363: Should update balances correctly | balance esatti | = | 🟢 OK |
| `transferAndCall` | [H] erc1363: Should work without data | overload senza `data` ok | = | 🟢 OK |
| `transferAndCall(to,v,data)` | [F] `test_transferAndCall_withData_toGoodReceiver` | `data` passata al callback | = | 🟢 OK |
| `transferAndCall` → EOA | [F] `test_transferAndCall_toEOA_noCallback` | verso EOA nessun callback, transfer ok | = | 🟢 OK |
| `transferAndCall` → contratto non compliant | [F] `test_transferAndCall_toContractWrongSelectorReverts` | selector sbagliato → `ERC1363TransferFailed` | = | 🟢 OK |
| `transferAndCall` → receiver che reverta | [F] `test_transferAndCall_toRevertingReceiverReverts` | revert propagato come `ERC1363TransferFailed` | = | 🟢 OK |
| `transferAndCall` × frozen | [F] `test_transferAndCall_frozenSenderReverts` | revert `AccountFrozen` | = | 🟢 OK |
| `transferFromAndCall` | [F] `test_transferFromAndCall_toGoodReceiver` | spend allowance + transfer + callback | = | 🟢 OK |
| `transferFromAndCall` | [F] `test_transferFromAndCall_withData` | con data | = | 🟢 OK |
| `transferFromAndCall` | [F] `test_transferFromAndCall_toEOA` | verso EOA ok | = | 🟢 OK |
| `transferFromAndCall` | [F] `test_transferFromAndCall_badReceiverReverts` | receiver non compliant → revert | = | 🟢 OK |
| `transferFromAndCall` | [F] `test_transferFromAndCall_insufficientAllowanceReverts` | revert `ERC20InsufficientAllowance` | = | 🟢 OK |
| `transferFromAndCall` | [H] erc1363: Should transferFrom tokens and call receiver | ok con allowance lorda | = | 🟢 OK |
| `transferFromAndCall` | [H] erc1363: Should update balances and allowance correctly | +v esatti, allowance lorda consumata | = | 🟢 OK |
| `approveAndCall` | [F] `test_approveAndCall_toGoodSpender` | approve + `onApprovalReceived` | = | 🟢 OK |
| `approveAndCall` | [F] `test_approveAndCall_withData` | con data | = | 🟢 OK |
| `approveAndCall` → EOA | [F] `test_approveAndCall_toEOA_noCallback` | nessun callback, approve ok | = | 🟢 OK |
| `approveAndCall` | [F] `test_approveAndCall_badSpenderReverts` | spender non compliant → `ERC1363ApprovalFailed` | = | 🟢 OK |
| `approveAndCall` | [F] `test_approveAndCall_revertingSpenderReverts` | revert propagato | = | 🟢 OK |
| `approveAndCall` × fee | [F] `test_approveAndCall_unaffectedByTransferFee` | approve non paga mai fee | = | 🟢 OK |
| `approveAndCall` | [H] erc1363: Should approve and call spender | eventi `Approval`+`ApprovalReceived` | = | 🟢 OK |
| `approveAndCall` | [H] erc1363: Should update allowance correctly | allowance esatta | = | 🟢 OK |
| `supportsInterface` | [F] `test_supportsInterface_ERC1363` | true per `IERC1363` | = | 🟢 OK |
| `supportsInterface` | [F] `test_supportsInterface_ERC165` | true per `IERC165` | = | 🟢 OK |
| `supportsInterface` | [F] `test_supportsInterface_unknownReturnsFalse` | false per interfaceId ignoto | = | 🟢 OK |
| `supportsInterface` | [H] erc1363: Should support ERC1363 interface | true | = | 🟢 OK |
| *(+ 12 test di semantica lorda/allowance/esenzioni/pausa/fee-zero già dettagliati in §5, §7, §10, §11)* | | | | |

## 16. Recovery (31)

| Metodo/attributo | Descrizione test | Risultato atteso | Ottenuto | Esito |
|---|---|---|---|---|
| `recoverERC20` | [F] `test_recoverERC20_sendsTokensToRecipient` | mock ERC20 recuperato al destinatario | = | 🟢 OK |
| `recoverERC20` | [F] `test_recoverERC20_partialAmount` | recupero parziale | = | 🟢 OK |
| `recoverERC20` (fuzz) | [F] `testFuzz_recoverERC20_amount` | qualsiasi importo ≤ posseduto | = | 🟢 OK |
| `recoverERC20` | [F] `test_recoverERC20_zeroRecipientReverts` | revert `InvalidRecipient` | = | 🟢 OK |
| `recoverERC20` | [F] `test_recoverERC20_nonRecovererReverts` | revert access control | = | 🟢 OK |
| `recoverERC20` | [F] `test_recoverERC20_falseReturningTokenReverts` | token che ritorna false → `SafeERC20FailedOperation` | = | 🟢 OK |
| `recoverERC20` | [F] `test_recoverERC20_transferReturnsFalse_reverts` (CoverageGaps) | idem | = | 🟢 OK |
| `recoverERC20` (self) | [F] `test_recoverERC20_selfToken_paysTransferFee` | recupero di IGT paga la transfer fee | = | 🟢 OK |
| `recoverERC20` (self) | [F] `test_recoverERC20_selfToken_exemptContractSendsFullAmount` | col contratto esente: importo pieno | = | 🟢 OK |
| `recoverERC20` (self) | [F] `test_recoverERC20_selfToken_revertsWhenPaused` | in pausa reverta (percorso standard) | = | 🟢 OK |
| `recoverERC20` | [F] `test_recoverERC20_externalTokenWorksWhilePaused` | token ESTERNO recuperabile anche in pausa | = | 🟢 OK |
| `recoverERC20` | [H] recover: allow/not allow/zero recipient (3 test) | ok/revert/revert | = | 🟢 OK |
| `recoverNative` | [F] `test_recoverNative_sendsNativeToRecipient` | POL (nativo) inviato | = | 🟢 OK |
| `recoverNative` | [F] `test_recoverNative_partialAmount` + fuzz `testFuzz_recoverNative_amount` (2) | importi arbitrari ≤ saldo | = | 🟢 OK |
| `recoverNative` | [F] `test_recoverNative_zeroRecipientReverts` | revert `InvalidRecipient` | = | 🟢 OK |
| `recoverNative` | [F] `test_recoverNative_nonRecovererReverts` | revert access control | = | 🟢 OK |
| `recoverNative` | [F] `test_recoverNative_sendToContractThatRejectsNativeReverts` | destinatario che rifiuta la valuta nativa → `NativeTransferFailed` | = | 🟢 OK |
| `recoverNative` | [H] recover: allow/not allow/zero recipient (3 test) | ok/revert/revert | = | 🟢 OK |
| `recoverERC721` | [F] `test_recoverERC721_sendsNFTToRecipient` | NFT trasferito | = | 🟢 OK |
| `recoverERC721` | [F] `test_recoverERC721_nonOwnedTokenReverts` | NFT non posseduto → errore ERC721 | = | 🟢 OK |
| `recoverERC721` | [F] `test_recoverERC721_zeroRecipientReverts` / `nonRecovererReverts` (2) | revert | = | 🟢 OK |
| `recoverERC721` | [H] recover: allow/not allow/zero recipient (3 test) | ok/revert/revert | = | 🟢 OK |
| `receive()` | [F] `test_tokenReceivesNative` | il contratto accetta POL (nativo) | = | 🟢 OK |

## 17. Upgrade UUPS (15)

| Metodo/attributo | Descrizione test | Risultato atteso | Ottenuto | Esito |
|---|---|---|---|---|
| `upgradeToAndCall` | [F] `test_authorizeUpgrade_upgraderCanUpgrade` | upgrade a V2, version "2.1.0-test" | = | 🟢 OK |
| `upgradeToAndCall` | [F] `test_authorizeUpgrade_nonUpgraderReverts` | senza UPGRADER_ROLE → revert | = | 🟢 OK |
| `upgradeToAndCall` | [H] forward: Should upgrade to V2 successfully | upgrade + initializeV2 | = | 🟢 OK |
| stato post-upgrade | [H] forward: Should preserve state after upgrade | balance/ruoli intatti | = | 🟢 OK |
| nuove funzioni V2 | [H] forward: Should call new function after upgrade | `newVariable`/`getCombinedValue` | = | 🟢 OK |
| catena V1→V2→V3 | [H] compat: Should upgrade V1 -> V2 -> V3 successfully | doppio upgrade ok | = | 🟢 OK |
| stato multi-upgrade | [H] compat: Should preserve all state through multiple upgrades | tutto lo stato preservato | = | 🟢 OK |
| catena V1→V2→V3 | [H] comprehensive: upgrade sequence | versioni e funzioni corrette | = | 🟢 OK |
| stato multi-ciclo | [H] comprehensive: preserve state through multiple upgrade cycles | intatto | = | 🟢 OK |
| upgrade con restrizioni attive | [H] comprehensive: upgrades with active restrictions | frozen/blocked sopravvivono all'upgrade | = | 🟢 OK |
| funzionalità V1 post-upgrade | [H] comprehensive: maintain all V1 functionality | transfer/fee/ruoli funzionano | = | 🟢 OK |
| fee post-upgrade | [H] comprehensive: fee functionality through upgrades | config fee preservata | = | 🟢 OK |
| ruoli post-upgrade | [H] comprehensive: role management through upgrades | grant/revoke funzionano | = | 🟢 OK |
| dati grandi | [H] comprehensive: upgrade with large amounts of data | nessuna corruzione | = | 🟢 OK |
| timing/gas | [H] comprehensive: upgrade timing and gas efficiency | upgrade completa senza anomalie | = | 🟢 OK |

## 18. Storage layout ERC-7201 (6)

| Metodo/attributo | Descrizione test | Risultato atteso | Ottenuto | Esito |
|---|---|---|---|---|
| slot freezable | [F] `test_freezableSlot_erc7201Conformance` | `frozen[a]` leggibile con `vm.load` allo slot della formula standard | = | 🟢 OK |
| slot blocklist | [F] `test_blocklistSlot_erc7201Conformance` | idem per `blocked[a]` | = | 🟢 OK |
| slot transfer fee | [F] `test_transferFeeSlot_erc7201Conformance` | packing uint16 bps + address collector verificato byte per byte | = | 🟢 OK |
| slot custody fee | [F] `test_custodyFeeSlot_erc7201Conformance` | packing + `currentCycle` a base+1 + mapping a base+2 | = | 🟢 OK |
| slot EIP-3009 | [F] `test_eip3009Slot_erc7201Conformance` | nested mapping `authorizationState` allo slot derivato | = | 🟢 OK |
| costanti precomputate | [F] `test_precomputedConstantsMatchFormula` | le 5 costanti hardcoded == formula ERC-7201 | = | 🟢 OK |

## 19. Interazioni cross-feature + edge case (20)

| Metodo/attributo | Descrizione test | Risultato atteso | Ottenuto | Esito |
|---|---|---|---|---|
| pause × freeze/block | [H] interactions: Pause should block transfer but not freeze/block | in pausa si può ancora freezare/bloccare | = | 🟢 OK |
| freeze × pause | [H] interactions: Freeze should block transfer even when paused | ordine revert corretto | = | 🟢 OK |
| block × pause | [H] interactions: Block should block transfer even when paused | idem | = | 🟢 OK |
| burn × freeze+block | [H] interactions: Burn should override freeze and block | burn sempre possibile (per design) | = | 🟢 OK |
| frozen+blocked | [H] edge: Should handle frozen + blocked account | stato combinato coerente | = | 🟢 OK |
| frozen+paused | [H] edge: Should handle frozen + paused contract | idem | = | 🟢 OK |
| sequenza completa | [H] edge: Should handle multiple state changes | fee→freeze→block→pause→unwind, fee 1% esatta alla fine | = | 🟢 OK |
| fee massima | [H] edge: Should handle maximum fee | 1% dedotto esattamente | = | 🟢 OK |
| fee su dust | [H] edge: Should handle very small amounts with fee | 1 wei: fee 0 per floor | = | 🟢 OK |
| fee zero | [H] edge: Should handle zero fee | importo pieno | = | 🟢 OK |
| block/unblock ciclo | [H] edge: Should handle blocking and unblocking | ripristino completo | = | 🟢 OK |
| freeze/unfreeze ciclo | [H] edge: Should handle freezing and unfreezing | ripristino completo | = | 🟢 OK |
| pause/unpause ciclo | [H] edge: Should handle pause and unpause | ripristino completo | = | 🟢 OK |
| *(+ 7 righe di edge già dettagliate nelle sezioni 2, 3, 12)* | | | | |

## 20. Invariant — stateful fuzzing (7)

1000 sequenze casuali × 100 azioni (mint, burn, transfer, transferAndCall, freeze/unfreeze, block/unblock, pause/unpause, setFee, sweep, startNewCycle) — l'invariante deve reggere DOPO OGNI sequenza:

| Invariante | Descrizione | Risultato atteso | Ottenuto | Esito |
|---|---|---|---|---|
| conservazione supply | [F] `invariant_sumOfBalancesEqualsTotalSupply` | somma balance tracciati == totalSupply SEMPRE (anche con fee e sweep) | = | 🟢 OK |
| cap transfer fee | [F] `invariant_transferFeeBoundedByMax` | `transferFeeBps ≤ 100` sempre | = | 🟢 OK |
| cap custody fee | [F] `invariant_custodyFeeBoundedByMax` | `custodyFeeBps ≤ 200` sempre | = | 🟢 OK |
| collector valido | [F] `invariant_feeCollectorNotZero` | mai address(0) | = | 🟢 OK |
| treasury valida | [F] `invariant_custodyTreasuryNotZero` | mai address(0) | = | 🟢 OK |
| ciclo valido | [F] `invariant_cycleAtLeastOne` | `currentCycle ≥ 1` sempre | = | 🟢 OK |
| accounting handler | [F] `invariant_handlerAccounting` | minted ≥ burned nel ghost accounting | = | 🟢 OK |

---

## 21. Lacune identificate → CHIUSE (2026-07-06)

Le 11 lacune chiudibili in locale sono state chiuse con **14 nuovi test** (tutti 🟢).
Decisione di policy dell'utente: **il collector incassa comunque le fee anche se
bloccato/congelato** — se la gamba fee revertasse, bloccare il collector
paralizzerebbe l'intero token; il rimedio a un collector compromesso è
`setFeeCollector(nuovo)`. Policy fissata nei NatSpec di `Token._update`, in
AGENTS.md §8.1 e nei test guardiani qui sotto.

| Metodo/area | Test aggiunto | Risultato atteso | Ottenuto | Esito |
|---|---|---|---|---|
| gamba fee → collector blocked (netto) | [F] `test_policy_blockedCollectorStillReceivesFee_netPath` | collector bloccato incassa la fee; ma NON può spendere (AccountBlocked) | = | 🟢 OK |
| gamba fee → collector frozen (netto) | [F] `test_policy_frozenCollectorStillReceivesFee_netPath` | idem con freeze | = | 🟢 OK |
| gamba fee → collector blocked (lordo) | [F] `test_policy_blockedCollectorStillReceivesFee_grossPath` | policy identica su ERC-1363 | = | 🟢 OK |
| treasury frozen su sweep | [F] `test_sweep_worksWithFrozenTreasury` | la treasury congelata riceve la custody fee (coerente con D3) | = | 🟢 OK |
| treasury blocked su sweep | [F] `test_sweep_worksWithBlockedTreasury` | idem con blocklist | = | 🟢 OK |
| `sweepCustodyFee([])` | [F] `test_sweep_emptyBatch_noop` | batch vuoto = no-op senza revert | = | 🟢 OK |
| gas del batch sweep | [F] `test_sweep_gasProfile_batch100` | budget < 100k gas/holder | **30.481 gas/holder** (3,05M per 100) — su Polygon batch da ~300 holder ≈ 9M gas, ampiamente fattibili | 🟢 OK |
| reentrancy avversariale ERC-1363 | [F] `test_transferAndCall_reentrantReceiver_stateConsistent` | receiver malevolo che rientra nel token durante il callback: stato coerente, conservazione esatta (CEI) | = | 🟢 OK |
| replay cross-chain EIP-712 | [F] `test_transferWithAuthorization_wrongChainIdSignatureReverts` | firma su domain separator con chainId diverso → `InvalidSignature` | = | 🟢 OK |
| flusso gasless completo | [F] `test_permitThenTransferFrom_gaslessFlow` | permit (firma) + transferFrom dal relayer, fee 1% dedotta, nonce+1 | = | 🟢 OK |
| `initialize` holder=0 con supply>0 | [F] `test_init_zeroHolderWithSupply_skipsMintSilently` | mint saltato silenziosamente, supply=0 | = | 🟢 OK |
| `getRoleAdmin` | [F] `test_getRoleAdmin_defaultAdminForAllRoles` | DEFAULT_ADMIN_ROLE è role admin di tutti gli 8 ruoli | = | 🟢 OK |
| `renounceRole` ultimo admin | [F] `test_renounceLastAdmin_locksGovernanceIrreversibly` | lockout irreversibile documentato; regola operativa in AGENTS.md §16.11 | = | 🟢 OK |
| upgrade verso non-UUPS | [F] `test_upgradeToNonUUPSImplementationReverts` | implementation senza `proxiableUUID` rifiutata | = | 🟢 OK |

### ⚪ Ancora aperte (non chiudibili in locale / rimandate)

| Area | Perché aperta | Consiglio |
|---|---|---|
| Mutation testing | Richiede i workflow multi-agente (bloccati dal limite di spesa) o una campagna `mewt`/`muton` dedicata | Da fare pre-mainnet: trasforma "coverage 100%" in "i test uccidono davvero i bug" |
| Fork test su Amoy | I test girano su EVM locale; il contratto deployato è stato validato solo con lo smoke test manuale | `forge test --fork-url $AMOY_RPC_URL` con suite di sole letture sul proxy reale — utile prima del mainnet |
