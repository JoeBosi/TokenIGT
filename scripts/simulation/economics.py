#!/usr/bin/env python3
"""
Calcolo economico dello sweep custodia: fonde le misure gas della simulazione
locale (results/sweep-simulation-*.json) con i prezzi di mercato correnti.

Uso: python3 scripts/simulation/economics.py [results.json]
I prezzi si aggiornano qui sotto (o via env GOLD_EUR_G, POL_EUR, GAS_GWEI).
"""
import json
import math
import os
import sys

# ── Prezzi di mercato (rilevati 2026-07-07 ~06:40 UTC) ──────────────────────
GOLD_EUR_G = float(os.environ.get("GOLD_EUR_G", "116.15"))  # livepriceofgold.com; xcheck gold-api.com+ECB
POL_EUR = float(os.environ.get("POL_EUR", "0.0655"))        # CoinGecko + Kraken POL/EUR
GAS_GWEI = float(os.environ.get("GAS_GWEI", "280"))         # polygonscan gastracker (base 246 + prio 33)
PEG_G_PER_IGT = float(os.environ.get("PEG_G_PER_IGT", "2")) # SPECIFICA UTENTE (2026-07-07): 1 IGT = 2 g oro fino
AVG_HOLDING_EUR = float(os.environ.get("AVG_HOLDING_EUR", "2000"))  # detenzione media prevista per utente
CUSTODY_BPS = 50
TX_GAS_CAP = 16_777_216  # EIP-7825 cap locale-Hardhat (Ethereum 2^24); su Polygon mainnet = 33_554_432 (2^25, fork Madhugiri)

SCALES = [10, 1_000, 100_000, 10_000_000]


def eur(x: float) -> str:
    return f"€ {x:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def num(x: float, dec: int = 0) -> str:
    return f"{x:,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def main() -> None:
    path = sys.argv[1] if len(sys.argv) > 1 else "scripts/simulation/results/sweep-simulation-2000h.json"
    sim = json.load(open(path))
    g1 = sim["gas"]["cycle1"]["perHolderAvg"]
    g2 = sim["gas"]["cycle2"]["perHolderAvg"]
    marginal = sim["gas"]["model"]["perHolderMarginal"]
    overhead = sim["gas"]["model"]["txOverhead"]
    batch = sim["params"]["batchSize"]

    def gas_cost(n_holders: int, per_holder: int) -> tuple[float, float, int]:
        txs = math.ceil(n_holders / batch)
        gas = n_holders * per_holder + txs * overhead
        pol = gas * GAS_GWEI * 1e9 / 1e18
        return pol, pol * POL_EUR, txs

    print(f"Prezzi: oro {eur(GOLD_EUR_G)}/g · POL {eur(POL_EUR)} · gas {GAS_GWEI} gwei · peg {PEG_G_PER_IGT} g/IGT")
    print(f"Gas misurato: ciclo1 {g1}/holder · ciclo2+ {g2}/holder · modello {marginal}·n + {overhead}/tx · batch {batch}\n")

    # ── Tabella A: ritiro custodia in EUR per quantita' custodita ───────────
    print("TABELLA A — Prelievo custodia (0,50%) al prezzo dell'oro")
    print("| IGT custoditi | Valore custodito | Prelievo (IGT = g oro) | Prelievo in EUR |")
    print("|---:|---:|---:|---:|")
    for x in SCALES:
        fee_igt = x * CUSTODY_BPS / 10000
        value = x * PEG_G_PER_IGT * GOLD_EUR_G
        print(f"| {num(x)} | {eur(value)} | {num(fee_igt, 2)} | {eur(fee_igt * PEG_G_PER_IGT * GOLD_EUR_G)} |")

    # ── Tabella B: costo gas per numero di holder ────────────────────────────
    print("\nTABELLA B — Costo gas dello sweep per numero di holder (batch da", batch, ")")
    print("| Holder | Transazioni | Gas totale (ciclo 1) | Costo POL | Costo EUR (c.1) | Costo EUR (cicli 2+) |")
    print("|---:|---:|---:|---:|---:|---:|")
    for n in SCALES:
        pol1, eur1, txs = gas_cost(n, g1)
        _, eur2, _ = gas_cost(n, g2)
        gas_tot = n * g1 + txs * overhead
        print(f"| {num(n)} | {num(txs)} | {num(gas_tot)} | {num(pol1, 2)} | {eur(eur1)} | {eur(eur2)} |")

    # ── Tabella C: scenario di business (detenzione media in EUR per utente) ──
    igt_price = PEG_G_PER_IGT * GOLD_EUR_G
    avg_igt = AVG_HOLDING_EUR / igt_price
    print(f"\nTABELLA C — Scenario di business: detenzione media {eur(AVG_HOLDING_EUR)}/utente (= {num(avg_igt, 2)} IGT a {eur(igt_price)}/IGT)")
    print("| Utenti | IGT custoditi | Valore custodito | Prelievo EUR | Costo gas EUR (c.1) | Incidenza gas |")
    print("|---:|---:|---:|---:|---:|---:|")
    for n in SCALES:
        tot_igt = n * avg_igt
        value = n * AVG_HOLDING_EUR
        take_eur = value * CUSTODY_BPS / 10000
        _, geur, _ = gas_cost(n, g1)
        print(f"| {num(n)} | {num(tot_igt)} | {eur(value)} | {eur(take_eur)} | {eur(geur)} | {geur / take_eur * 100:.4f}% |")
    print(f"Prelievo medio per utente: {eur(AVG_HOLDING_EUR * CUSTODY_BPS / 10000)}/ciclo")

    # ── Vincoli operativi ────────────────────────────────────────────────────
    max_batch = (TX_GAS_CAP * 8 // 10 - overhead) // g1
    print(f"\nBatch massimo (80% del tx gas cap EIP-7825 {num(TX_GAS_CAP)}): ~{num(max_batch)} holder/tx")
    print(f"Costo di UNA tx batch da {batch} (ciclo 1): {eur((batch * g1 + overhead) * GAS_GWEI * 1e9 / 1e18 * POL_EUR)}")


if __name__ == "__main__":
    main()
