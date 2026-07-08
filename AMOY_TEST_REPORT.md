# Report test on-chain su Amoy — Token v2.3.0

> Data: 2026-07-08 · Rete: Amoy testnet (chainId 80002) · Deploy fresco v2.3.0
> Metodo: gate locale (454 test) → deploy → verifica → integrazione on-chain → caveaux

## Deployment (nuovo, v2.3.0)

| | Indirizzo |
|---|---|
| **Proxy (UUPS)** | [`0x479DE4c471a88c0AFdf24e9E5462555BBab03BcC`](https://amoy.polygonscan.com/address/0x479DE4c471a88c0AFdf24e9E5462555BBab03BcC) |
| **Implementation v2.3.0** | [`0xf977Bf61Ba628e05771470c66878999a697d241F`](https://amoy.polygonscan.com/address/0xf977Bf61Ba628e05771470c66878999a697d241F#code) (verificata ✅) |

> **Deploy di TEST** (non di produzione): durante i test la config è stata
> modificata (feeCollector → `0x…FEE1`, custodyTreasury → `0x…FEE2`, ruoli
> operativi concessi al deployer, ciclo custodia avanzato). Per un deploy
> "pulito" pre-mainnet si riparte da `initialize` con i valori definitivi.

## 1. Gate locale (pre-deploy)
**454 test verdi** (262 Foundry unit+fuzz+invariant · 192 Hardhat) — conferma che
il bytecode v2.3.0 deployato è quello testato.

## 2. Integrazione on-chain (transazioni reali sul proxy live)

| Check | Esito | Evidenza |
|---|---|---|
| `transfer` NETTO | 🟢 | destinatario 999,9 IGT (v − fee), collector +0,1 |
| `transferAndCall` LORDO | 🟢 | destinatario 500 esatti, mittente paga 500,05 (v + fee) |
| FREEZE | 🟢 | transfer verso frozen reverta; unfreeze ripristina |
| BLOCK | 🟢 | transfer verso blocked reverta; unblock ripristina |
| PAUSE | 🟢 | transfer reverta in pausa; unpause ripristina |
| RECOVERY nativo | 🟢 | `recoverNative` sposta POL ed **emette `AssetRecovered`** |

> Nota: il test corregge un dettaglio — con `feeCollector == deployer` la fee
> rientrerebbe al mittente (caso "collector == from") e non sarebbe osservabile;
> per il test il collector è stato spostato su un indirizzo dedicato.

## 3. Caveaux — sweep di custodia on-chain (procedura del runbook)

Flusso VINCOLANTE eseguito con transazioni reali: **pausa → apertura ciclo →
snapshot → sweep → verifica → unpause**. 6 holder con balance vari (media €2.000
≈ 8,609 IGT, grandi, piccolo, dust).

| Check | Esito |
|---|---|
| La pausa blocca i transfer normali | 🟢 |
| Tutti gli holder marcati nel ciclo | 🟢 |
| **Delta treasury == Σ fee attese == Σ eventi** (505,08634 IGT) | 🟢 al wei |
| Dust (199 wei-token): fee arrotondata a 0 | 🟢 |
| Unpause riapre il token | 🟢 |

- **Incasso**: 505,08634 IGT · tx sweep [`0xaed38afb…e1593`](https://amoy.polygonscan.com/tx/0xaed38afb2e9ef64a07d434447982e94ad46ee5bd6fc245da0206a68d274e1593)
- **Gas**: 332.576 per il batch da 6 = **55.429/holder** (per-holder alto perché il
  costo fisso di transazione è ammortizzato su pochi holder; su batch grandi scende
  verso ~18–35k/holder come misurato in locale). Costo totale sweep ≈ **€ 0,006**.

## Esito complessivo
**🟢 Tutto superato on-chain.** Il contratto v2.3.0 deployato su Amoy si comporta
esattamente come in locale: doppia semantica fee, restrizioni, recovery con evento,
e la procedura di custodia completa con riconciliazione esatta al wei.

## Problemi incontrati
- **RPC pubblico rate-limited** (`rpc-amoy.polygon.technology` → Cloudflare 1015):
  passato a `polygon-amoy-bor-rpc.publicnode.com` (stabile). `.env` aggiornato;
  `.env.example` aggiornato col suggerimento.
- **Test fee non osservabile** con collector == deployer: risolto usando un
  collector/treasury dedicati nei test (non un bug del contratto).

## Script (riutilizzabili)
- `scripts/amoy_test/onchain_integration.ts` — integrazione (fee/freeze/block/pause/recovery)
- `scripts/amoy_test/onchain_caveaux.ts` — sweep custodia end-to-end
- Output: `scripts/amoy_test/results/{integration,caveaux}.json`
