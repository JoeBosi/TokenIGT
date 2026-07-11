# PEG_ORO.md — Definizione del sottostante del token IGT

> Definito dall'utente/emittente il 2026-07-07 · Documento ufficiale di riferimento

## Definizione

**1 IGT = 2 grammi d'oro fino (Au 999,9)**

| Grandezza | Valore |
|---|---|
| Peg | 2 g oro fino per token |
| Decimali token | 18 (1 wei-IGT = 2×10⁻¹⁸ g) |
| Valore unitario indicativo | € 232,30/IGT (oro a € 116,15/g, 2026-07-07) |
| Detenzione media prevista | **€ 2.000/utente** ≈ 8,61 IGT ≈ 17,2 g oro |

## Implicazioni operative

1. **Custody fee (0,50%/ciclo)**: il prelievo in IGT equivale a grammi d'oro in
   ragione di 2:1 — es. prelievo di 5 IGT = 10 g d'oro = € 1.161,50 (prezzo 2026-07-07).
   Prelievo medio per utente tipo: **€ 10,00/ciclo**.
2. **Supply ↔ caveau**: ogni IGT in circolazione impegna 2 g nel caveau;
   10.000.000 IGT = **20 tonnellate** d'oro custodito.
3. **Calcoli economici**: `scripts/simulation/economics.py` usa `PEG_G_PER_IGT = 2`
   e `AVG_HOLDING_EUR = 2000` come default — non modificarli senza aggiornare
   questo documento.

## Dove è (e dove sarà) dichiarato

| Sede | Stato |
|---|---|
| Questo documento | ✅ fonte di verità |
| `economics.py` (default parametrici) | ✅ allineato |
| NatSpec di `Token.sol` (`@notice` con il peg) | ⬜ da inserire al prossimo redeploy (evita drift col sorgente verificato su Polygonscan) |
| Whitepaper / documentazione legale | ⬜ a cura dell'emittente |

> Ogni modifica al peg è una decisione dell'emittente e va riflessa in TUTTE le
> sedi sopra, oltre che nelle tabelle di SIMULAZIONE_CUSTODY_FEE.md.

## Procedura mint/burn ↔ attestazione oro (day-1 mainnet e ricorrente)

**Principio vincolante: si minta SOLO a fronte di grammi d'oro già attestati.**
Il mint precede sempre l'attestazione nel senso causale (l'oro entra nel caveau,
POI si minta), mai il contrario.

1. **Deposito fisico**: l'oro entra nel caveau del custode.
2. **Attestazione** (E6a/E6e): il custode/auditor certifica i grammi depositati;
   il documento (con hash + link IPFS, quando E6e sarà implementato) viene
   pubblicato su `reserveInfoURI` (E6b) — **prima** di qualsiasi mint collegato.
3. **Mint**: `MINTER_ROLE` emette IGT per un ammontare tale che
   `totalSupply() × 2g ≤ grammi attestati` resti sempre vero (invariante di
   monitoraggio, PIANO_LAVORI §3.4).
4. **Burn simmetrico al ritiro**: quando un detentore preleva oro fisico dal
   caveau, il quantitativo equivalente di IGT viene bruciato (`BURNER_ROLE`)
   PRIMA o contestualmente alla consegna fisica — mai dopo.
5. **Riconciliazione periodica**: a ogni nuova attestazione (E6a), verificare
   `totalSupply() × 2g ≤ grammi attestati correnti`; uno scostamento è un
   incidente da trattare con `RUNBOOK_INCIDENT.md`.

**Gate per il mainnet (day-1)**: la PRIMA attestazione del custode deve esistere
ed essere pubblicata su `reserveInfoURI` PRIMA del primo mint su Polygon mainnet.
Senza questo, il token debutta senza copertura verificabile — il momento in cui
la fiducia conta di più.

> Nota: oggi (v2.3.0) non c'è enforcement ON-CHAIN di questa invariante (nessun
> oracolo, per scelta — vedi PIANO_LAVORI §E6f). È una disciplina PROCEDURALE
> del `MINTER_ROLE`/`BURNER_ROLE`, verificata dal monitoraggio off-chain.
