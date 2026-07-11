import { ethers } from "hardhat";
import type { Token } from "../../typechain-types";
import fs from "fs";
import path from "path";

/**
 * PROVA DI SCALA dello sweep di custodia ON-CHAIN sul proxy Amoy live (v2.4.0).
 *
 * Estende il test caveaux base (6 holder) a N holder reali per misurare, su
 * rete vera (gas price, block gas limit, RPC pubblico), l'AMMORTAMENTO del
 * costo fisso di transazione sul per-holder e la correttezza dello sweep a
 * batch attraverso i confini di batch nello stesso ciclo.
 *
 * Parametri (env, con default):
 *   SCALE_HOLDERS   numero di holder da seminare (default 100)
 *   SCALE_BATCH     dimensione batch dello sweep   (default 50)
 *   SCALE_SEED_CHUNK mint concorrenti per chunk     (default 25)
 *
 * Uso: PROXY_ADDRESS=... SCALE_HOLDERS=100 SCALE_BATCH=50 \
 *      pnpm hardhat run scripts/amoy_test/onchain_scale.ts --network amoy
 */

const HOLDERS = Number(process.env.SCALE_HOLDERS || "100");
const BATCH = Number(process.env.SCALE_BATCH || "50");
const SEED_CHUNK = Number(process.env.SCALE_SEED_CHUNK || "10");
const CUSTODY_BPS = 50n; // 0,50%
const PER_HOLDER = ethers.parseEther("8.609"); // detenzione media (~€2.000)

const fmt = (v: bigint) => ethers.formatEther(v);

async function main() {
  const proxy = process.env.PROXY_ADDRESS!;
  const [op] = await ethers.getSigners();
  const token = (await ethers.getContractAt("Token", proxy)) as unknown as Token;
  console.log(`Proxy ${proxy} · operatore ${op.address} · v${await token.version()}`);
  console.log(`Scala: ${HOLDERS} holder, batch ${BATCH}, seed-chunk ${SEED_CHUNK}\n`);

  // Ruoli operativi per il test (deployer = admin che si autoconcede)
  for (const r of ["MINTER_ROLE", "PAUSER_ROLE", "SWEEPER_ROLE"]) {
    const role = await (token as any)[r]();
    if (!(await token.hasRole(role, op.address))) {
      await (await token.grantRole(role, op.address)).wait();
    }
  }

  // Treasury dedicata (≠ operatore) per misurare l'incasso pulito
  const treasury = "0x000000000000000000000000000000000000FEE2";
  if ((await token.custodyTreasury()).toLowerCase() !== treasury.toLowerCase()) {
    await (await token.setCustodyTreasury(treasury)).wait();
  }
  if (Number(await token.custodyFeeBps()) !== Number(CUSTODY_BPS)) {
    await (await token.setCustodyFeeBps(CUSTODY_BPS)).wait();
  }

  // ── 1. Seed: N holder deterministici, mint in chunk concorrenti ──────────
  // Indirizzi derivati dall'indice (solo indirizzi: lo sweep non usa le chiavi).
  const holders: string[] = [];
  for (let i = 0; i < HOLDERS; i++) {
    holders.push(ethers.getAddress("0x" + (0x5ca1e00000n + BigInt(i)).toString(16).padStart(40, "0")));
  }

  // Semina solo gli holder non ancora finanziati (idempotente su re-run)
  const toMint: string[] = [];
  for (const h of holders) {
    if ((await token.balanceOf(h)) < PER_HOLDER) toMint.push(h);
  }
  console.log(`Seeding: ${toMint.length}/${HOLDERS} da mintare (gli altri già finanziati)...`);

  const t0 = Date.now();
  let nonce = await ethers.provider.getTransactionCount(op.address, "latest");
  for (let i = 0; i < toMint.length; i += SEED_CHUNK) {
    const chunk = toMint.slice(i, i + SEED_CHUNK);
    // Invio concorrente con nonce espliciti sequenziali, poi attendo il chunk.
    const sent = [];
    for (const h of chunk) {
      sent.push(
        token.mint(h, PER_HOLDER, { nonce: nonce++ }).then((tx) => tx.wait())
      );
    }
    try {
      await Promise.all(sent);
    } catch (e) {
      // Su errore di nonce/RPC: risincronizza il nonce e ritenta il chunk residuo
      console.warn(`  ⚠️  chunk ${i / SEED_CHUNK + 1} parziale (${(e as Error).message.slice(0, 60)}...), risincronizzo nonce`);
      nonce = await ethers.provider.getTransactionCount(op.address, "latest");
      for (const h of chunk) {
        if ((await token.balanceOf(h)) < PER_HOLDER) {
          await (await token.mint(h, PER_HOLDER, { nonce: nonce++ })).wait();
        }
      }
    }
    console.log(`  ...${Math.min(i + SEED_CHUNK, toMint.length)}/${toMint.length} mintati`);
  }
  const seedSeconds = (Date.now() - t0) / 1000;
  console.log(`Seed completato in ${seedSeconds.toFixed(1)}s\n`);

  // ── 2. RUNBOOK: pausa → ciclo → sweep a batch → verifica → unpause ───────
  if (!(await token.paused())) await (await token.pause()).wait();
  await (await token.startNewCycle()).wait();
  const cycle = await token.currentCycle();
  console.log(`Ciclo ${cycle} aperto (token in pausa)`);

  // Atteso calcolato dai saldi REALI congelati (robusto a re-run/residui):
  // fee = balance * bps / 10000 (floor) per ogni holder eleggibile.
  let expectedTotal = 0n;
  for (const h of holders) {
    expectedTotal += ((await token.balanceOf(h)) * CUSTODY_BPS) / 10000n;
  }

  const treasuryBefore = await token.balanceOf(treasury);

  const batches: string[][] = [];
  for (let i = 0; i < holders.length; i += BATCH) batches.push(holders.slice(i, i + BATCH));

  console.log(`\nSweep: ${batches.length} batch da max ${BATCH} holder...`);
  const perBatch: { size: number; gasUsed: string; perHolder: number; tx: string }[] = [];
  const s0 = Date.now();
  for (const [bi, batch] of batches.entries()) {
    const rc = await (await token.sweepCustodyFee(batch)).wait();
    const perHolder = Math.round(Number(rc!.gasUsed) / batch.length);
    perBatch.push({ size: batch.length, gasUsed: rc!.gasUsed.toString(), perHolder, tx: rc!.hash });
    console.log(`  batch ${bi + 1}/${batches.length}: ${batch.length} holder → ${rc!.gasUsed} gas (${perHolder}/holder)`);
  }
  const sweepSeconds = (Date.now() - s0) / 1000;

  // ── 3. Verifica riconciliazione ──────────────────────────────────────────
  const treasuryDelta = (await token.balanceOf(treasury)) - treasuryBefore;
  let allSwept = true;
  for (const h of holders) if ((await token.lastSweptCycle(h)) !== cycle) allSwept = false;

  // idempotenza: reinviare il primo batch nello stesso ciclo è un no-op
  const idemBefore = await token.balanceOf(treasury);
  const rcIdem = await (await token.sweepCustodyFee(batches[0])).wait();
  const idemDelta = (await token.balanceOf(treasury)) - idemBefore;

  await (await token.unpause()).wait();

  const totalGas = perBatch.reduce((a, b) => a + BigInt(b.gasUsed), 0n);
  const avgPerHolder = Math.round(Number(totalGas) / holders.length);

  const checks = {
    allHoldersSwept: allSwept,
    treasuryDeltaEqualsExpected: treasuryDelta === expectedTotal,
    idempotentResweepIsNoop: idemDelta === 0n,
    unpaused: !(await token.paused()),
  };
  const allOk = Object.values(checks).every(Boolean);

  const out = {
    date: new Date().toISOString(),
    proxy,
    network: "amoy",
    cycle: cycle.toString(),
    holders: holders.length,
    batchSize: BATCH,
    batches: batches.length,
    perHolderBalance: fmt(PER_HOLDER),
    totalCollected: fmt(treasuryDelta),
    expectedTotal: fmt(expectedTotal),
    totalGas: totalGas.toString(),
    avgGasPerHolder: avgPerHolder,
    seedSeconds: Number(seedSeconds.toFixed(1)),
    sweepSeconds: Number(sweepSeconds.toFixed(1)),
    perBatch,
    idempotentResweepGas: rcIdem!.gasUsed.toString(),
    checks,
  };

  const outDir = path.join(__dirname, "results");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "scale.json"), JSON.stringify(out, null, 2));

  console.log("\n" + JSON.stringify(checks, null, 2));
  console.log(
    `\nScala ${holders.length} holder: incasso ${out.totalCollected} IGT (atteso ${out.expectedTotal}) · ` +
      `gas medio ${avgPerHolder}/holder · re-sweep idempotente ${rcIdem!.gasUsed} gas`
  );
  console.log(allOk ? "\n✅ SCALE: tutte le verifiche superate" : "\n❌ SCALE: verifiche fallite");
  if (!allOk) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
