# RUNBOOK — Incasso della custody fee (sweep)

> Procedura operativa vincolante · v1.0 (2026-07-07) · Token IGT v2.1.0
> Ciclo di riferimento: 20 marzo (convenzione off-chain, non enforced on-chain)
> **ORDINE OBBLIGATORIO: PAUSA → SNAPSHOT → SWEEP → VERIFICA → UNPAUSE**
> (specifica emittente 2026-07-07: lo snapshot si fa sullo stato congelato)

## 0. Prerequisiti (da verificare il giorno prima)

| Check | Come |
|---|---|
| Wallet operatore ha `FEE_MANAGER_ROLE` | `hasRole(FEE_MANAGER_ROLE, op)` — vedi roles.md |
| Wallet pausa ha `PAUSER_ROLE` | idem |
| **Funding POL** dell'operatore | Budget: `n_holder × gas/holder × gas_price`. Ciclo 1: 35.147 gas/holder; cicli 2+: 18.056. Esempio 100k holder, 280 gwei: ~988 POL (≈ € 65) + margine 50% → **1.500 POL** |
| Parametri on-chain attesi | `custodyFeeBps() == 50`, `custodyTreasury()` corretta, `currentCycle()` = ciclo precedente |
| Lista esenzioni aggiornata | `getCustodyFeeExemptList()` revisionata dall'emittente |
| Prezzi correnti per il report | rieseguire `economics.py` con oro/POL/gas del giorno |
| Comunicazione utenti | avviso pausa programmata (finestra stimata: vedi §4) |

## 1. PAUSA — congelamento dei trasferimenti

```bash
# wallet PAUSER
cast send $PROXY "pause()" --rpc-url $RPC --private-key $PAUSER_KEY
# oppure via script/console hardhat
```
Verifica: `paused() == true`. Da questo momento nessun transfer utente passa
(ERC-20, ERC-1363, EIP-3009 inclusi). Lo sweep invece funziona by design.

## 2. APERTURA CICLO

```bash
# wallet FEE_MANAGER
cast send $PROXY "startNewCycle()" --rpc-url $RPC --private-key $FEE_MANAGER_KEY
```
Verifica: `currentCycle()` incrementato; evento `CycleStarted(N, ts)`.

## 3. SNAPSHOT — enumerazione holder sullo stato congelato

```bash
PROXY_ADDRESS=$PROXY FROM_BLOCK=$DEPLOY_BLOCK SWEEP_BATCH=300 \
  pnpm hardhat run scripts/indexer/sweep_indexer.ts --network <rete>
```
Lo script: ricostruisce i balance dagli eventi `Transfer`, **verifica la
completezza** (Σ balance == totalSupply + spot-check on-chain — se fallisce si
FERMA), esclude treasury/esenti/dust (<200 wei: fee = 0) e scrive
`scripts/indexer/output/batches.json`.

**GATE 1**: non procedere se la verifica di completezza fallisce.

## 4. SWEEP — prelievo a batch

Batch standard: **300 holder/tx** (~10,6M gas ciclo 1 / ~5,5M cicli 2+ — sempre
sotto il tx cap: 16,77M in locale/Ethereum, 33,55M su Polygon PoS post-Madhugiri).

```bash
# per ogni batch in batches.json (nonce sequenziali):
cast send $PROXY "sweepCustodyFee(address[])" <batch> --rpc-url $RPC --private-key $FEE_MANAGER_KEY
```

Proprietà che rendono lo sweep "tranquillo":
- **idempotente per ciclo**: un batch reinviato (retry, timeout ambiguo) è un no-op;
- **mai revert per singolo holder**: esenti/già-prelevati/dust vengono saltati;
- **preleva anche da frozen/blocked** (decisione D3) — nessun batch si inceppa.

**Durata stimata della finestra di pausa** (blocchi Polygon ~2s):

| Holder | Tx (batch 300) | Sequenziale (1 tx/blocco) | Parallelo (5 tx/blocco) |
|---:|---:|---:|---:|
| 1.000 | 4 | ~8 s | ~2 s |
| 100.000 | 334 | ~11 min | ~2,5 min |
| 10.000.000 | 33.334 | ~18,5 h ⚠️ | ~3,7 h |

Per >100k holder: inviare più tx per blocco con nonce sequenziali (il gas totale
resta lo stesso); su mainnet si può salire a batch ~700 (cap 33,55M) dimezzando
le tx. Oltre il milione di holder valutare più operatori con `FEE_MANAGER_ROLE`
in parallelo su sotto-liste disgiunte. **Da collaudare nella prova generale su
Amoy (pianificata, con specifiche aggiuntive).**

### Ripresa dopo interruzione
Grazie all'idempotenza: ripartire **dall'inizio della lista batch** (o dal punto
noto) e reinviare — i già prelevati costano ~2.870 gas/holder di sole letture.
Non serve tracciare lo stato: la fonte di verità è `lastSweptCycle(holder)`.

## 5. VERIFICA — gate per la riapertura

```bash
INDEXER_MODE=verify PROXY_ADDRESS=$PROXY \
  pnpm hardhat run scripts/indexer/sweep_indexer.ts --network <rete>
```
Controlla che OGNI holder dei batch abbia `lastSweptCycle == currentCycle`.
Riconciliazione contabile (dal report eventi):
`Σ CustodyFeeCollected(_, fee, N) == delta balance treasury == 0,50% × Σ balance eleggibili`.

**GATE 2 (bloccante): niente unpause finché il gate non passa.**
Se mancano holder → reinviare i batch mancanti (idempotente) → riverificare.

## 6. UNPAUSE — riapertura

```bash
cast send $PROXY "unpause()" --rpc-url $RPC --private-key $PAUSER_KEY
```
Verifica: `paused() == false` + un transfer di prova.

## 7. Report post-ciclo

- salvare `holders.json`/`batches.json` + hash tx + totale incassato (IGT, g oro, EUR)
- valori economici col peg ufficiale (PEG_ORO.md: **1 IGT = 2 g**): prelievo medio
  atteso ≈ € 10,00/utente (detenzione media € 2.000)
- aggiornare il registro cicli e conservare per audit/compliance

## Rollback / emergenze

| Scenario | Azione |
|---|---|
| Errore grave durante lo sweep | `unpause()` immediato (PAUSER) — il ciclo resta aperto, si riprende in una nuova finestra; i prelievi già fatti restano validi (idempotenza) |
| Gas price impennato | lo sweep può attendere: la pausa è il costo reale — valutare rinvio finestra |
| Operatore compromesso | `revokeRole(FEE_MANAGER_ROLE, op)` dall'admin; i fondi prelevati sono già in treasury |
| Treasury errata | STOP prima dello sweep: `setCustodyTreasury(corretta)` e ripartire dal §3 |

## Regole permanenti

1. Mai `renounceRole` su DEFAULT_ADMIN senza un secondo admin attivo (AGENTS §16.11).
2. Il batch standard è 300; modifiche vanno motivate e ricollaudate.
3. Ogni ciclo produce un report archiviato; gli eventi on-chain sono la fonte di verità.
