# Report test on-chain su Amoy — Token v2.5.0

> Data: 2026-07-13 · Rete: Amoy testnet (chainId 80002) · Deploy fresco v2.5.0
> Metodo: gate locale (561 test) → deploy → verifica Polygonscan → verifica on-chain
> mirata dei fix v2.5.0.

## Deployment (nuovo, v2.5.0)

| | Indirizzo |
|---|---|
| **Proxy (UUPS)** | [`0xf162e1B87a71abb498a69a51179a9cf6F1ECc1e0`](https://amoy.polygonscan.com/address/0xf162e1B87a71abb498a69a51179a9cf6F1ECc1e0) |
| **Implementation v2.5.0** | [`0x8FDC870CB41ceEdD2c69Fd49687730579Cf29b90`](https://amoy.polygonscan.com/address/0x8FDC870CB41ceEdD2c69Fd49687730579Cf29b90#code) (verificata ✅) |

## 0bis. Verifica on-chain dei fix v2.5.0 (il "delta" rispetto a v2.4.0)

Il redeploy v2.5.0 è stato validato on-chain sul proxy live con transazioni reali
(fee) e con `staticCall`/`eth_call` per le revert e le view (nessuna tx → immuni
alla flakiness nonce dell'RPC pubblico):

| Check | Metodo | Esito |
|---|---|---|
| `version() == "2.5.0"` | read | 🟢 |
| `transfer` NETTO (fee dedotta, collector +fee) | tx reale | 🟢 (dest. 999,9 / fee 0,1) |
| `transferAndCall` LORDO (dest. +v esatti, mittente v+fee) | tx reale | 🟢 (dest. 500 / pagato 500,05) |
| FREEZE blocca transfer verso frozen, unfreeze ripristina | tx reale | 🟢 |
| **A1** — firma *TransferWithAuthorization* RIFIUTATA sul percorso receive | staticCall | 🟢 `InvalidSignature` |
| **A1** — firma *ReceiveWithAuthorization* ACCETTATA sul percorso receive | staticCall | 🟢 |
| **A4** — `freeze(address(0))` reverta | eth_call | 🟢 `InvalidFreezeAccount` (0xc54e58ec) |
| **A4** — `blockAccount(address(0))` reverta | eth_call | 🟢 `InvalidBlockAccount` (0xa5e202d9) |
| `getTransferFeeExemptCount()` / `getCustodyFeeExemptCount()` presenti | read | 🟢 (view nuove v2.5.0) |
| `isRestricted(address)` presente | read | 🟢 (view nuova v2.5.0) |

> Script: `scripts/amoy_test/onchain_a1_check.ts` (A1 via staticCall). I percorsi
> **invariati** rispetto a v2.4.0 (block/pause/recovery, custody sweep, scala) sono
> già stati validati on-chain sul deploy v2.4.0 (sezioni 2-4 sotto) e sono coperti
> dai 561 test locali; il bytecode delle logiche non toccate è identico.
> Nota: il run sequenziale completo di `onchain_integration.ts` (~18 tx) resta
> soggetto alla race del nonce dell'RPC pubblico publicnode — mitigata da un
> `NonceManager` nello script, ma la verifica a basso numero di tx sopra è la fonte
> autoritativa per il delta v2.5.0.

---

## (Sezioni 1-4 sotto: risultati on-chain del deploy v2.4.0 — paths invariati)

> **Deploy di TEST** (non di produzione): durante i test la config è stata
> modificata (feeCollector → `0x…FEE1`, custodyTreasury → `0x…FEE2`, ruoli
> operativi concessi al deployer incluso il nuovo `SWEEPER_ROLE`, ciclo
> custodia avanzato a 2). Per un deploy "pulito" pre-mainnet si riparte da
> `initialize` con i valori definitivi e la coreografia di handover a due fasi
> (`finalize_governance.ts` → `accept_governance.ts`, vedi GOVERNANCE.md).

## 0. Novità v2.4.0 rispetto al deploy precedente (v2.3.0)

- **Split di ruolo**: `FEE_MANAGER_ROLE` → `FEE_ADMIN_ROLE` (governance: setter
  fee/collector/treasury/esenzioni) + `SWEEPER_ROLE` (operativo:
  `startNewCycle`/`sweepCustodyFee`).
- **`ContractURIsUpgradeable`**: `websiteURI`/`reserveInfoURI`/`contractURI`
  (ERC-7572), gestiti da `DEFAULT_ADMIN_ROLE`.
- **`AccessControlDefaultAdminRulesUpgradeable`**: transfer di
  `DEFAULT_ADMIN_ROLE` a due fasi con delay obbligatorio (259.200s = 3 giorni
  su questo deploy); `grantRole`/`revokeRole` su `DEFAULT_ADMIN_ROLE` revertono
  sempre.
- `initialize` a 10 parametri (nuovo `adminTransferDelay_`).

## 1. Gate locale (pre-deploy)
**546 test verdi** (327 Foundry unit+fuzz+invariant · 219 Hardhat) — conferma che
il bytecode v2.4.0 deployato è quello testato. `forge fmt --check` pulito,
`.gas-snapshot` rigenerato e verificato (`--check --tolerance 3`). Il conteggio
include i 12 test aggiunti dal mutation testing (MUTATION_TESTING.md); il deploy
on-chain era gated a 532, i 12 test successivi coprono lo STESSO bytecode
(nessuna modifica al contratto).

## 1bis. Review avversariale (4 agenti indipendenti)
Eseguita sul diff completo prima del deploy:
- **Sicurezza contratti** (diamond inheritance, role split, storage slot): nessun
  bug trovato.
- **Script di governance** (`finalize_governance.ts`/`accept_governance.ts`):
  1 finding MEDIO — un re-run con `GOVERNANCE_ADMIN` diverso sovrascrive
  silenziosamente il transfer pendente. **Corretto**: ora stampa un warning
  esplicito prima di procedere.
- **Copertura test**: 2 gap trovati e colmati — test di re-schedule di
  `beginDefaultAdminTransfer` (`TokenAdminRulesTest.t.sol`), test di
  sopravvivenza di ContractURIs/ruoli attraverso un upgrade UUPS
  (`upgrade.compatibility.spec.ts`). `.gas-snapshot` era stale, rigenerato.
- **Coerenza documentazione**: 1 riferimento stale trovato e corretto
  (`Token.sol` NatSpec "FEE_MANAGER" → "FEE_ADMIN"); l'indirizzo v2.1.0 in
  API.md era già disallineato con DEPLOYMENT.md (v2.3.0) indipendentemente
  dal redeploy v2.4.0 — sincronizzato in questo stesso giro.
- **Bug di script trovato durante il test on-chain reale** (non dalla review):
  `onchain_caveaux.ts` chiamava `startNewCycle()`/`sweepCustodyFee()` senza
  autoconcedersi `SWEEPER_ROLE` (auto-grant da `initialize` rimosso nello
  split) — **corretto** prima di eseguire il test qui sotto.

## 2. Integrazione on-chain (transazioni reali sul proxy live)

| Check | Esito | Evidenza |
|---|---|---|
| `transfer` NETTO | 🟢 | destinatario 999,9 IGT (v − fee), collector +0,1 |
| `transferAndCall` LORDO | 🟢 | destinatario 500 esatti, mittente paga 500,05 (v + fee) |
| FREEZE | 🟢 | transfer verso frozen reverta; unfreeze ripristina |
| BLOCK | 🟢 | transfer verso blocked reverta; unblock ripristina |
| PAUSE | 🟢 | transfer reverta in pausa; unpause ripristina |
| RECOVERY nativo | 🟢 | `recoverNative` sposta POL ed **emette `AssetRecovered`** |

## 3. Caveaux — sweep di custodia on-chain (procedura del runbook, con SWEEPER_ROLE)

Flusso VINCOLANTE eseguito con transazioni reali: **pausa → apertura ciclo →
snapshot → sweep → verifica → unpause**, tutte le operazioni di ciclo/sweep
firmate dal `SWEEPER_ROLE` (non più `FEE_MANAGER_ROLE`). 6 holder con balance
vari (media €2.000 ≈ 8,609 IGT, grandi, piccolo, dust).

| Check | Esito |
|---|---|
| La pausa blocca i transfer normali | 🟢 |
| `startNewCycle`/`sweepCustodyFee` autorizzati da SWEEPER_ROLE | 🟢 |
| Tutti gli holder marcati nel ciclo (cycle 2) | 🟢 |
| **Delta treasury == Σ fee attese == Σ eventi** (505,08634 IGT) | 🟢 al wei |
| Dust (199 wei-token): fee arrotondata a 0 | 🟢 |
| Unpause riapre il token | 🟢 |

- **Incasso**: 505,08634 IGT · tx sweep [`0x9b303a21…ceb95`](https://amoy.polygonscan.com/tx/0x9b303a21d0776f0d1a69db31429e5edbbb0a5de111fbc4d9736c142cbd8ceb95)
- **Gas**: 332.582 per il batch da 6 = **55.430/holder** (per-holder alto perché il
  costo fisso di transazione è ammortizzato su pochi holder; su batch grandi scende
  verso ~18–35k/holder come misurato in locale).

## 4. Prova di SCALA dello sweep (100 holder, on-chain)

Estensione del caveaux base (6 holder) a 100 holder reali su Amoy per misurare
su rete vera l'ammortamento del costo fisso di transazione e la correttezza
dello sweep a batch. Script: `scripts/amoy_test/onchain_scale.ts` (parametrico
via `SCALE_HOLDERS`/`SCALE_BATCH`; seeding a chunk con gestione nonce esplicita
per resistere all'RPC pubblico).

| Check | Esito |
|---|---|
| Seeding 100 holder (mint a chunk) | 🟢 ~28 s |
| Tutti i 100 holder marcati nel ciclo | 🟢 |
| **Riconciliazione** (delta treasury == Σ fee attese, calcolate dai saldi reali congelati) | 🟢 al wei (8,5445401125 IGT) |
| Re-sweep dello stesso batch nello stesso ciclo = no-op | 🟢 |
| Unpause riapre il token | 🟢 |

**Profilo gas per dimensione batch (dato on-chain reale):**

| Batch | Stato slot `lastSweptCycle` | Gas totale | Gas/holder |
|---:|---|---:|---:|
| 6 (caveaux base) | freddo (primo sweep) | 332.582 | 55.430 |
| 50 | freddo (primo sweep) | 2.268.914 | 45.378 |
| 100 (tx singola) | caldo (già sweepati) | 2.689.529 | **26.895** |

- L'ammortamento del costo fisso di transazione (~21k gas) è netto: da 55k/holder
  a batch 6 a 27k/holder a batch 100. Il salto batch-50→batch-100 riflette anche
  il costo dello slot `lastSweptCycle`: **freddo** (0→ciclo, ~20k SSTORE) al primo
  sweep, **caldo** (ciclo→ciclo, ~5k) nei cicli successivi — coerente col profilo
  locale (35k ciclo 1 / 18k cicli 2+).
- **Un batch da 100 holder sta in UNA sola tx da 2,69M gas**, largamente sotto il
  tx gas cap reale (33,55M su Polygon PoS). Estrapolando linearmente: batch 300
  ≈ 8M gas, batch 700 ≈ 18,8M — entrambi ampiamente sotto il cap. La dimensione
  operativa 300 del runbook è confermata fattibile su rete vera.
- Re-sweep idempotente di 100 holder già sweepati: 661.003 gas (~6,6k/holder di
  sole letture) — reinviare un batch per retry costa poco, come atteso.

> Nota: il primo run con batch 100 aveva mostrato `treasuryDeltaEqualsExpected:
> false` — era un bug del **calcolo dell'atteso nello script** (assumeva il saldo
> base ignorando i residui post-sweep di cicli precedenti su holder ri-toppati),
> NON del contratto: la fee raccolta era sempre esattamente lo 0,5% del saldo
> reale. Lo script ora calcola l'atteso dai saldi reali congelati (riconciliazione
> robusta) e chiude 🟢.

## Esito complessivo
**🟢 Tutto superato on-chain.** Il contratto v2.4.0 deployato su Amoy si comporta
esattamente come in locale: split di ruolo FEE_ADMIN/SWEEPER, doppia semantica
fee, restrizioni, recovery con evento, la procedura di custodia completa con
riconciliazione esatta al wei — con il nuovo SWEEPER_ROLE correttamente gated — e
lo sweep a scala (100 holder, batch singolo, ammortamento gas confermato).

## Problemi incontrati
- **`nonce too low` transitorio** sull'RPC pubblico durante `onchain_caveaux.ts`:
  errore di sincronizzazione nonce, non un bug — risolto ripetendo lo script.
- **`onchain_caveaux.ts` non concedeva `SWEEPER_ROLE`** al deployer prima di
  chiamare `startNewCycle`/`sweepCustodyFee` (script scritto per v2.3.0, dove
  quei metodi erano ancora su `FEE_MANAGER_ROLE` auto-concesso dall'admin):
  corretto aggiungendo l'auto-grant, come già faceva `onchain_integration.ts`
  per gli altri ruoli operativi.

## Script (riutilizzabili)
- `scripts/amoy_test/onchain_integration.ts` — integrazione (fee/freeze/block/pause/recovery)
- `scripts/amoy_test/onchain_caveaux.ts` — sweep custodia end-to-end (ora con auto-grant SWEEPER_ROLE)
- `scripts/amoy_test/onchain_scale.ts` — prova di scala parametrica (`SCALE_HOLDERS`/`SCALE_BATCH`)
- Output: `scripts/amoy_test/results/{integration,caveaux,scale}.json`
