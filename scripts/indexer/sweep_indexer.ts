import { ethers } from "hardhat";
import type { Token } from "../../typechain-types";
import fs from "fs";
import path from "path";

/**
 * INDEXER HOLDER per lo sweep di custodia — lo "SNAPSHOT" del processo
 *
 * ⚠️ ORDINE VINCOLANTE (specifica 2026-07-07): questo snapshot va eseguito
 * DOPO pause() — sullo stato congelato — mai prima. Sequenza completa:
 * pause → startNewCycle → SNAPSHOT (build) → sweep batch → VERIFICA (verify) → unpause.
 *
 * Ricostruisce il set degli holder dagli eventi Transfer (fonte di verità
 * on-chain), verifica la completezza contro lo stato del contratto e produce
 * i batch pronti per `sweepCustodyFee`.
 *
 * Modalità (env INDEXER_MODE):
 *   build   (default) → scansiona i Transfer, verifica, scrive holders.json + batches.json
 *   verify            → dopo lo sweep: controlla che ogni holder eleggibile abbia
 *                       lastSweptCycle == currentCycle (gate per l'unpause)
 *
 * Env: PROXY_ADDRESS, FROM_BLOCK (default 0), SWEEP_BATCH (default 300),
 *      DUST_WEI (default 200: sotto questa soglia la fee è 0 → escluso dai batch),
 *      LOG_CHUNK (default 5000 blocchi per chiamata getLogs)
 * Rete: --network hardhat|localhost|amoy|polygon
 */

export interface IndexResult {
  balances: Map<string, bigint>;
  holders: string[]; // balance > 0
  lastBlock: number;
}

export async function indexHolders(token: Token, fromBlock: number, logChunk: number): Promise<IndexResult> {
  const latest = await ethers.provider.getBlockNumber();
  const balances = new Map<string, bigint>();
  const ZERO = ethers.ZeroAddress;

  for (let start = fromBlock; start <= latest; start += logChunk) {
    const end = Math.min(start + logChunk - 1, latest);
    const logs = await token.queryFilter(token.filters.Transfer(), start, end);
    for (const log of logs) {
      const { from, to, value } = (log as any).args;
      if (from !== ZERO) balances.set(from, (balances.get(from) ?? 0n) - value);
      if (to !== ZERO) balances.set(to, (balances.get(to) ?? 0n) + value);
    }
  }

  const holders = [...balances.entries()].filter(([, b]) => b > 0n).map(([a]) => a).sort();
  return { balances, holders, lastBlock: latest };
}

/**
 * Verifica di completezza dell'indice:
 *  1. nessun balance negativo (indice incoerente)
 *  2. somma dei balance indicizzati == totalSupply() on-chain
 *  3. spot-check casuale: balance indicizzato == balanceOf on-chain
 */
export async function verifyCompleteness(
  token: Token,
  idx: IndexResult,
  spotChecks: number
): Promise<{ ok: boolean; issues: string[] }> {
  const issues: string[] = [];

  for (const [a, b] of idx.balances) {
    if (b < 0n) issues.push(`balance negativo indicizzato per ${a}: ${b}`);
  }

  const sum = [...idx.balances.values()].reduce((x, y) => x + y, 0n);
  const supply = await token.totalSupply();
  if (sum !== supply) issues.push(`somma indicizzata ${sum} != totalSupply ${supply}`);

  const pool = idx.holders;
  for (let i = 0; i < Math.min(spotChecks, pool.length); i++) {
    const a = pool[(i * 2654435761) % pool.length]; // passo pseudo-casuale deterministico
    const onchain = await token.balanceOf(a);
    if (onchain !== (idx.balances.get(a) ?? 0n)) {
      issues.push(`spot-check fallito per ${a}: indice ${idx.balances.get(a)} vs on-chain ${onchain}`);
    }
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Costruisce i batch per sweepCustodyFee: esclude treasury, esenti e dust
 * (fee arrotondata a 0), spezza a `batchSize`.
 */
export async function buildBatches(
  token: Token,
  idx: IndexResult,
  batchSize: number,
  dustWei: bigint
): Promise<{ batches: string[][]; excluded: { treasury: string; exempt: string[]; dust: number } }> {
  const treasury = (await token.custodyTreasury()).toLowerCase();
  const exempt = (await token.getCustodyFeeExemptList()).map((a: string) => a.toLowerCase());
  const exemptSet = new Set(exempt);

  let dust = 0;
  const eligible = idx.holders.filter((a) => {
    const low = a.toLowerCase();
    if (low === treasury || exemptSet.has(low)) return false;
    if ((idx.balances.get(a) ?? 0n) < dustWei) {
      dust++;
      return false;
    }
    return true;
  });

  const batches: string[][] = [];
  for (let i = 0; i < eligible.length; i += batchSize) {
    batches.push(eligible.slice(i, i + batchSize));
  }
  return { batches, excluded: { treasury, exempt, dust } };
}

/**
 * Gate post-sweep: ogni holder eleggibile deve risultare sweepato nel ciclo
 * corrente. Da eseguire PRIMA di unpause().
 */
export async function verifySweepComplete(
  token: Token,
  batches: string[][]
): Promise<{ ok: boolean; cycle: bigint; missing: string[] }> {
  const cycle = await token.currentCycle();
  const missing: string[] = [];
  for (const batch of batches) {
    for (const h of batch) {
      if ((await token.lastSweptCycle(h)) !== cycle) missing.push(h);
    }
  }
  return { ok: missing.length === 0, cycle, missing };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  const mode = process.env.INDEXER_MODE || "build";
  const proxy = process.env.PROXY_ADDRESS;
  if (!proxy) throw new Error("PROXY_ADDRESS non impostato");
  const fromBlock = parseInt(process.env.FROM_BLOCK || "0");
  const batchSize = parseInt(process.env.SWEEP_BATCH || "300");
  const dustWei = BigInt(process.env.DUST_WEI || "200");
  const logChunk = parseInt(process.env.LOG_CHUNK || "5000");

  const token = (await ethers.getContractAt("Token", proxy)) as unknown as Token;
  const outDir = path.join(__dirname, "output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  if (mode === "build") {
    console.log(`Indicizzazione Transfer da blocco ${fromBlock}...`);
    const idx = await indexHolders(token, fromBlock, logChunk);
    console.log(`Holder con balance > 0: ${idx.holders.length} (ultimo blocco ${idx.lastBlock})`);

    const check = await verifyCompleteness(token, idx, 25);
    if (!check.ok) {
      console.error("❌ VERIFICA COMPLETEZZA FALLITA:\n" + check.issues.join("\n"));
      process.exit(1);
    }
    console.log("✅ Completezza verificata (somma == totalSupply, spot-check ok)");

    const { batches, excluded } = await buildBatches(token, idx, batchSize, dustWei);
    console.log(
      `Batch generati: ${batches.length} da max ${batchSize} — esclusi: treasury, ${excluded.exempt.length} esenti, ${excluded.dust} dust`
    );

    fs.writeFileSync(
      path.join(outDir, "holders.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          proxy,
          lastBlock: idx.lastBlock,
          holders: idx.holders.map((a) => ({ address: a, balance: idx.balances.get(a)!.toString() })),
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(outDir, "batches.json"),
      JSON.stringify({ generatedAt: new Date().toISOString(), proxy, batchSize, batches }, null, 2)
    );
    console.log(`📄 Scritti ${path.join(outDir, "holders.json")} e batches.json`);
  } else if (mode === "verify") {
    const batches: string[][] = JSON.parse(fs.readFileSync(path.join(outDir, "batches.json"), "utf8")).batches;
    const res = await verifySweepComplete(token, batches);
    if (!res.ok) {
      console.error(`❌ GATE FALLITO: ${res.missing.length} holder NON sweepati nel ciclo ${res.cycle}:`);
      console.error(res.missing.slice(0, 20).join("\n"));
      process.exit(1);
    }
    console.log(`✅ GATE SUPERATO: tutti gli holder dei batch sweepati nel ciclo ${res.cycle} — si può fare unpause()`);
  } else {
    throw new Error(`INDEXER_MODE sconosciuto: ${mode}`);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
