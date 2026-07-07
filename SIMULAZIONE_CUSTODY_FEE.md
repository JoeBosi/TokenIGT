# Simulazione e test del pagamento della fee di custodia

> Data: 2026-07-07 · Branch `2026706ClaudeCode` · Token v2.1.0
> Ambiente: **locale** (rete Hardhat in-process) — primo test; il fork test su Amoy è pianificato
> Script: `scripts/simulation/simulate_custody_sweep.ts` (rieseguibile) · Economics: `scripts/simulation/economics.py`

---

## 1. Come funziona il pagamento della custodia (il quadro chiaro)

Il "pagamento del caveau" è **l'incasso della custody fee**: una volta per ciclo
(riferimento operativo: 20 marzo), il gestore preleva lo 0,50% del saldo di ogni
holder e lo accredita alla **custody treasury**, che lo usa per pagare custodia e
assicurazione dell'oro fisico.

**Ordine del processo (VINCOLANTE — specifica del 2026-07-07): prima la PAUSA,
poi lo SNAPSHOT.** L'enumerazione degli holder si fa sullo stato già congelato:
zero finestre tra snapshot e prelievo, elusione impossibile per costruzione.

```
1. pause()                    → congela i trasferimenti            [PAUSER]
2. startNewCycle()            → apre il ciclo N                    [FEE_MANAGER]
3. SNAPSHOT (off-chain)       → indexer: enumera gli holder dagli eventi
                                 Transfer sullo stato CONGELATO e verifica la
                                 completezza (Σ balance == totalSupply)
4. sweepCustodyFee(batch_1)   → preleva 0,50% da ~300 holder per transazione
   sweepCustodyFee(batch_2)      · fee calcolata sul saldo AL MOMENTO
   ...                           · idempotente: holder già prelevato nel ciclo = skip
   sweepCustodyFee(batch_K)      · preleva anche da frozen/blocked; esenti saltati
5. VERIFICA (gate)            → ogni holder eleggibile ha lastSweptCycle == N;
                                 Σ eventi CustodyFeeCollected == delta treasury
6. unpause()                  → riapre i trasferimenti SOLO se il gate passa [PAUSER]
```

Strumenti: `scripts/indexer/sweep_indexer.ts` (INDEXER_MODE=build per lo snapshot
al punto 3, INDEXER_MODE=verify per il gate al punto 5).

Punti che la simulazione ha **verificato uno per uno**:

| Verifica | Esito |
|---|---|
| La pausa blocca i transfer normali durante lo sweep (anti-elusione tra batch) | 🟢 |
| Lo sweep FUNZIONA in pausa (bypass by design) | 🟢 |
| Tutti i 2.000 holder marcati al ciclo 1, nessuno saltato | 🟢 |
| Delta treasury == Σ fee attese == Σ eventi `CustodyFeeCollected` (esatto al wei: 25.252.525 IGT su ~5,05 mld) | 🟢 |
| La transfer fee NON viene applicata al prelievo (il collector resta a zero) | 🟢 |
| Aritmetica esatta su 4 ordini di grandezza: 10 → 9,95 · 1.000 → 995 · 100.000 → 99.500 · 10.000.000 → 9.950.000 IGT | 🟢 |
| Dust (199 wei-token): fee=0 per arrotondamento, ciclo comunque marcato, saldo intatto | 🟢 |
| Holder esente: saltato, non marcato, saldo intatto | 🟢 |
| Batch ripetuto nello stesso ciclo: no-op (solo ~2.870 gas/holder di lettura) | 🟢 |
| Duplicati nello stesso batch: addebitati una volta sola | 🟢 |

## 2. Assunzioni e prezzi di mercato (rilevati 2026-07-07 ~06:40 UTC)

| Parametro | Valore | Fonte |
|---|---|---|
| **Peg oro** | **1 IGT = 2 grammi d'oro fino** → 1 IGT = **€ 232,30** | SPECIFICA UTENTE (2026-07-07), formalizzata in `PEG_ORO.md` |
| **Detenzione media** | **€ 2.000/utente** (= 8,61 IGT) → prelievo medio **€ 10,00/utente/ciclo** | SPECIFICA UTENTE (2026-07-07) |
| Oro | **€ 116,15/g** (€ 3.612/oz t) | livepriceofgold.com; cross-check gold-api.com $4.132,50/oz × FX BCE 0,87604 → € 116,4/g (Δ 0,2%) |
| POL | **€ 0,0655** | CoinGecko (0,065363) + Kraken POL/EUR (0,06559) |
| Gas Polygon | **280 gwei** (range 278–303) | Polygonscan gastracker: base 246 + priority ~33 |
| Custody fee | 0,50% (50 bp) — quella configurata on-chain | contratto |

I prezzi sono parametrici in `economics.py` (`GOLD_EUR_G`, `POL_EUR`, `GAS_GWEI`,
`PEG_G_PER_IGT=2`, `AVG_HOLDING_EUR=2000`): da rieseguire coi valori correnti.

## 3. Risultanze — come scalano i numeri da 10 a 10 milioni

### Tabella A — Il ritiro per il pagamento del caveau (0,50%, peg 2 g/IGT)

| IGT custoditi | Oro sottostante | Valore custodito | Prelievo (IGT) | **Prelievo in EUR** |
|---:|---:|---:|---:|---:|
| 10 | 20 g | € 2.323 | 0,05 | **€ 11,62** |
| 1.000 | 2 kg | € 232.300 | 5,00 | **€ 1.161,50** |
| 100.000 | 200 kg | € 23.230.000 | 500,00 | **€ 116.150** |
| 10.000.000 | 20 t | € 2.323.000.000 | 50.000,00 | **€ 11.615.000** |

Il prelievo è una percentuale fissa: scala perfettamente lineare (×100 a ogni step).

### Tabella B — La spesa in gas (per numero di holder da sweepare, batch da 300)

Gas misurato in simulazione: **35.147/holder al ciclo 1** (slot mai scritti) e
**18.056/holder dai cicli successivi** (slot già inizializzati — il caso ricorrente).

| Holder | Transazioni | Gas totale (ciclo 1) | POL | **EUR (ciclo 1)** | **EUR (cicli 2+)** |
|---:|---:|---:|---:|---:|---:|
| 10 | 1 | 389.000 | 0,11 | **€ 0,01** | € 0,00 |
| 1.000 | 4 | 35,3 M | 9,88 | **€ 0,65** | € 0,33 |
| 100.000 | 334 | 3,53 mld | 988 | **€ 64,69** | € 33,34 |
| 10.000.000 | 33.334 | 352,7 mld | 98.762 | **€ 6.469** | € 3.334 |

Anche il gas scala linearmente (×100 a step); il costo di UNA transazione batch da
300 holder è ~€ 0,19.

### Tabella C — Scenario di business: detenzione media € 2.000/utente (8,61 IGT)

| Utenti | IGT custoditi | Valore custodito | **Prelievo EUR** | Gas EUR (c.1) | **Incidenza gas** |
|---:|---:|---:|---:|---:|---:|
| 10 | 86 | € 20.000 | **€ 100** | € 0,01 | 0,0071% |
| 1.000 | 8.610 | € 2.000.000 | **€ 10.000** | € 0,65 | 0,0065% |
| 100.000 | 860.956 | € 200.000.000 | **€ 1.000.000** | € 64,69 | 0,0065% |
| 10.000.000 | 86.095.566 | € 20.000.000.000 | **€ 100.000.000** | € 6.469 | **0,0065%** |

**Prelievo medio: € 10,00 per utente per ciclo** (0,5% di € 2.000). Il costo
on-chain dell'incasso è irrilevante — ~**65 centesimi ogni 10.000 € prelevati**,
costante a ogni scala. Il vero costo a grande scala non è il gas ma la
**finestra di pausa** (vedi §5).

> **Conferma empirica (run `SIM_PROFILE=business`, 2026-07-07)**: simulati 2.000
> utenti con detenzione media 8,609 IGT (≈ € 2.000, dispersione ±75%) → incassati
> **esattamente 86,09 IGT = 172,18 g oro = € 19.998,71 ≈ € 10,00/utente**, con
> riconciliazione al wei e tutte le 10 verifiche superate. Il gas per holder è
> identico al profilo stress (35.147/18.056): il costo NON dipende dai balance.

## 4. Problemi incontrati e come sono stati risolti

### 4.1 🔴→🟢 File v1 "fantasma" ricomparsi in `contracts/` (build rotta)
Alla prima esecuzione la compilazione è fallita: in `contracts/` erano ricomparse
le **vecchie versioni v1** dei sorgenti (`Token (1).sol`, `ERC20FeeUpgradeable.sol`,
`ERC20RestrictedUpgradeable.sol`, le vecchie interfacce IERC1363, mock duplicati
"(1)"…), tutte untracked, con date di maggio/giugno e permessi diversi — quasi
certamente un ripristino Finder/iCloud o un drag&drop accidentale. Collidevano con
i contratti v2 (identifier duplicati). **Risoluzione**: i 16 file sono stati messi
in quarantena fuori dall'albero (sono copie esatte già presenti nella history git —
nessuna perdita). **Prevenzione consigliata**: escludere la cartella del progetto
dalla sincronizzazione iCloud Drive, o aggiungere un check in CI/pre-commit che
fallisca se in `contracts/` compaiono file untracked.

### 4.2 🔴→🟢 Il batch da 500 holder supera il tx gas cap EIP-7825
Lo sweep da 500 holder "freddi" (~18M gas) **revertava**: da Fusaka (dic 2025)
esiste un tetto per SINGOLA transazione (EIP-7825), che Hardhat/EDR applica in
locale col valore Ethereum: **16.777.216 gas (2²⁴)**. Il sintomo era fuorviante
(revert senza reason: la stima veniva troncata al cap → out-of-gas a metà loop).
**Risoluzione**: batch operativo ridotto a **300 holder** (~10,6M gas al ciclo 1,
~5,5M ai successivi — margine ampio sotto il cap).

**Verifica su Polygon mainnet (fonti primarie, codice Bor)**: Polygon PoS applica
EIP-7825 dal fork **Madhugiri** (blocco 80.084.800, 9 dic 2025) ma con cap
**raddoppiato: 33.554.432 gas (2²⁵)** — `MaxTxGas = 1 << 25` in
`bor/params/protocol_params.go`, confermato fino al fork Valencia (lug 2026).
Il block gas limit attuale è **160M** (progressione 30→45→60→90→160M, roadmap
Gigagas), quindi il vincolo dimensionante è SOLO il tx cap. Su mainnet il batch
massimo all'80% del cap è ~**760** (ciclo 1) / ~**1.480** (cicli 2+); il nostro
standard 300 resta la scelta portabile che funziona ovunque (locale, Amoy, mainnet).

### 4.3 🟡 Gas del ciclo 1 quasi doppio dei cicli successivi
Il primo sweep di sempre scrive `lastSweptCycle` da zero (SSTORE 0→N ≈ 22k gas);
dai cicli successivi la slot è già inizializzata (≈ 5k). Misurato: 35.147 vs
18.056 gas/holder. Non è un problema ma va budgetato: **il primo anno costa ~2×**.
(La misura Foundry precedente di ~30,5k era ottimistica perché fatta con slot
"caldi" nello stesso contesto di transazione.)

## 5. Problemi residui e attività da pianificare

| # | Tema | Azione |
|---|---|---|
| 1 | ~~Peg oro non formalizzato~~ **DEFINITO: 1 IGT = 2 g** (specifica utente 2026-07-07) | ✅ Formalizzato in `PEG_ORO.md`; da scolpire nei NatSpec al prossimo redeploy |
| 2 | ~~EIP-7825 su Polygon PoS~~ **CONFERMATO** (fork Madhugiri, cap 2²⁵ = 33,55M gas; block limit 160M) | ✅ Chiuso — vedi §4.2; batch 300 valido ovunque, su mainnet estendibile fino a ~700 |
| 3 | **Finestra di pausa a grande scala** — 10M holder = 33.334 tx; in sequenza (1 tx/blocco da 2s) ≈ 18 ore di pausa | Per >100k holder: inviare più tx per blocco (nonce sequenziali), valutare più operatori FEE_MANAGER in parallelo; da collaudare su Amoy |
| 4 | **Indexer holder** — la simulazione usa holder noti; in produzione serve l'enumerazione da eventi Transfer con verifica di completezza (MONITORING.md) | Costruire/collaudare l'indexer prima del primo ciclo reale |
| 5 | **Fork test su Amoy** — questo è il test locale; la prova generale va fatta sulla testnet col contratto deployato | Pianificare: seed di holder su Amoy + sweep reale multi-batch |
| 6 | **Runbook operativo** — la sequenza §1 va formalizzata in un runbook con checklist, ruoli (chi ha PAUSER, chi FEE_MANAGER), gas budget e piano di rollback (unpause d'emergenza) | Scrivere `RUNBOOK_SWEEP.md` |
| 7 | **Fondi POL dell'operatore** — il wallet FEE_MANAGER deve avere POL sufficiente (10M holder ciclo 1 ≈ 98.800 POL ≈ € 6.500) | Includere il funding nel runbook |

## 6. Suggerimenti

1. **Batch 300 come standard portabile** (funziona in locale, su Amoy e su mainnet);
   per gli sweep di massa su mainnet si può salire a ~700 (ciclo 1) / ~1.400 (cicli 2+)
   grazie al cap Polygon di 33,55M — dimezza le transazioni e la finestra di pausa
   (10M holder: da 33.334 a ~14.300 tx).
2. **Ordine di sweep deterministico** (es. holder ordinati): rende la ripresa dopo
   un'interruzione banale e la riconciliazione più leggibile.
3. **Riconciliazione automatica post-sweep** (già abbozzata nello script): somma
   eventi vs delta treasury vs atteso — da integrare nel runbook come gate per l'unpause.
4. **Dust**: sotto i 200 wei-token la fee è 0 per arrotondamento — economicamente
   irrilevante, ma l'indexer può escludere i saldi < 200 wei dai batch per risparmiare gas.
5. **Prezzi volatili**: `economics.py` è parametrico (env `GOLD_EUR_G`, `POL_EUR`,
   `GAS_GWEI`, `PEG_G_PER_IGT`) — da rieseguire con prezzi correnti prima di ogni ciclo.
6. **Il gas non è una leva**: a 0,001% di incidenza non vale nessuna ottimizzazione
   di contratto; ottimizzare invece la DURATA della pausa (throughput di invio).

---

### Appendice — Riproducibilità

```bash
# profilo stress (balance 10 → 10M IGT su 4 ordini di grandezza)
SIM_HOLDERS=2000 SIM_BATCH=300 pnpm hardhat run scripts/simulation/simulate_custody_sweep.ts
# profilo business (detenzione media €2.000/utente ≈ 8,61 IGT — PEG_ORO.md)
SIM_HOLDERS=2000 SIM_BATCH=300 SIM_PROFILE=business pnpm hardhat run scripts/simulation/simulate_custody_sweep.ts
# tabelle economiche sui risultati
python3 scripts/simulation/economics.py
```
Output JSON: `scripts/simulation/results/sweep-simulation-2000h-{magnitudes,business}.json`.
Modello gas (fit sui batch profilati): `gas(n) ≈ 17.942·n + 37.530` per transazione (cicli 2+).
