import { ethers, upgrades } from "hardhat";
import fs from "fs";
import path from "path";

/**
 * SIMULAZIONE OPERATIVA — prelievo della fee di custodia (sweep)
 *
 * Riproduce in locale l'intera procedura di incasso della custody fee:
 *   1. deploy del token (custody 50 bp, transfer fee 1 bp)
 *   2. seed di N holder con balance distribuiti su 4 ordini di grandezza
 *      (10 / 1.000 / 100.000 / 10.000.000 IGT) + casi limite (dust, exempt)
 *   3. procedura anti-elusione: pause() → sweep a batch → unpause()
 *   4. riconciliazione: eventi CustodyFeeCollected vs delta treasury vs atteso
 *   5. misura del gas per batch (ciclo 1 = slot lastSweptCycle "freddi",
 *      ciclo 2 = slot già scritti) e stima del modello lineare gas(batch)
 *
 * Output: JSON con tutte le misure in scripts/simulation/results/
 *
 * Parametri via env: SIM_HOLDERS (default 2000), SIM_BATCH (default 500)
 */

const HOLDERS = parseInt(process.env.SIM_HOLDERS || "2000");
const BATCH_SIZE = parseInt(process.env.SIM_BATCH || "300");
// Profilo balance: "magnitudes" = 10/1k/100k/10M IGT (stress su 4 ordini di
// grandezza) · "business" = detenzione media €2.000/utente ≈ 8,61 IGT
// (PEG_ORO.md: 1 IGT = 2 g, oro €116,15/g) con dispersione ±75%
const PROFILE = process.env.SIM_PROFILE || "magnitudes";
const PROFILE_BATCH_SIZES = [10, 50, 100, 250, 500];
const CUSTODY_BPS = 50n; // 0,50%
const TRANSFER_FEE_BPS = 1n; // 0,01% — attiva per verificare che lo sweep NON la paghi

// Balance su 4 ordini di grandezza: 10 → 10M IGT (step di due zeri)
const MAGNITUDES = [10n, 1_000n, 100_000n, 10_000_000n].map((x) => x * 10n ** 18n);
// Scenario business: media ESATTA 8,6096 IGT (moltiplicatori a media 1.0)
const AVG_IGT_MILLI = 8_609n; // 8,609 IGT in millesimi
const BUSINESS = [250n, 500n, 1000n, 1500n, 1750n].map(
  (m) => (AVG_IGT_MILLI * m * 10n ** 18n) / 1000n / 1000n
);
const BALANCES = PROFILE === "business" ? BUSINESS : MAGNITUDES;

function fmt(x: bigint): string {
  return ethers.formatEther(x);
}

async function main() {
  console.log(`\n══ SIMULAZIONE SWEEP CUSTODIA — ${HOLDERS} holder, batch ${BATCH_SIZE}, profilo ${PROFILE} ══\n`);
  const [admin, treasury, collector, probe] = await ethers.getSigners();

  // ── 1. Deploy ────────────────────────────────────────────────────────────
  const Token = await ethers.getContractFactory("Token");
  const token = await upgrades.deployProxy(
    Token,
    ["IGE Token", "IGT", 0, admin.address, TRANSFER_FEE_BPS, collector.address, CUSTODY_BPS, treasury.address, admin.address],
    { kind: "uups" }
  );
  await token.waitForDeployment();
  await (await token.grantRole(await token.MINTER_ROLE(), admin.address)).wait();
  await (await token.grantRole(await token.PAUSER_ROLE(), admin.address)).wait();
  console.log(`Token deployato: ${await token.getAddress()} (v${await token.version()})`);

  // ── 2. Seed holder ───────────────────────────────────────────────────────
  // Wallet deterministici (solo indirizzi: non servono le chiavi per lo sweep)
  const holders: string[] = [];
  const expectedFee = new Map<string, bigint>();
  let totalSupplySeeded = 0n;

  console.log(`Seeding ${HOLDERS} holder (mint)...`);
  const t0 = Date.now();
  for (let i = 0; i < HOLDERS; i++) {
    const addr = ethers.getAddress("0x" + (0x100000000000n + BigInt(i)).toString(16).padStart(40, "0"));
    const balance = BALANCES[i % BALANCES.length];
    await (await token.mint(addr, balance)).wait();
    holders.push(addr);
    expectedFee.set(addr, (balance * CUSTODY_BPS) / 10000n);
    totalSupplySeeded += balance;
    if ((i + 1) % 500 === 0) console.log(`  ...${i + 1}/${HOLDERS}`);
  }

  // Casi limite: dust (fee → 0 per floor), exempt, holder ripetuto nel batch
  const dust = ethers.getAddress("0x" + "d".repeat(40));
  await (await token.mint(dust, 199n)).wait(); // 199 wei × 50bp / 10000 = 0 (floor)
  const exempt = ethers.getAddress("0x" + "e".repeat(40));
  await (await token.mint(exempt, ethers.parseEther("5000"))).wait();
  await (await token.addCustodyFeeExempt(exempt)).wait();
  console.log(`Seed completato in ${((Date.now() - t0) / 1000).toFixed(1)}s. Supply: ${fmt(totalSupplySeeded + 199n + ethers.parseEther("5000"))} IGT`);

  const expectedTotalFee = [...expectedFee.values()].reduce((a, b) => a + b, 0n);

  // ── 3. Procedura operativa: PAUSE → SWEEP a batch → UNPAUSE ─────────────
  await (await token.pause()).wait();

  // probe: i transfer normali devono essere bloccati durante lo sweep
  let pauseBlocked = false;
  try {
    await (await token.connect(probe).transfer(admin.address, 1)).wait();
  } catch {
    pauseBlocked = true;
  }

  const treasuryBefore = await token.balanceOf(treasury.address);
  const collectorBefore = await token.balanceOf(collector.address);

  const sweepTargets = [...holders, dust, exempt, holders[0] /* duplicato */];
  const batches: string[][] = [];
  for (let i = 0; i < sweepTargets.length; i += BATCH_SIZE) {
    batches.push(sweepTargets.slice(i, i + BATCH_SIZE));
  }

  console.log(`\nSweep ciclo 1: ${batches.length} batch da max ${BATCH_SIZE}...`);
  const cycle1Gas: { size: number; gasUsed: bigint }[] = [];
  const s0 = Date.now();
  for (const [bi, batch] of batches.entries()) {
    const rc = await (await token.sweepCustodyFee(batch)).wait();
    cycle1Gas.push({ size: batch.length, gasUsed: rc!.gasUsed });
    console.log(`  batch ${bi + 1}/${batches.length}: ${batch.length} holder → ${rc!.gasUsed} gas (${(Number(rc!.gasUsed) / batch.length).toFixed(0)}/holder)`);
  }
  const sweepSeconds = (Date.now() - s0) / 1000;

  // idempotenza: ripetere il primo batch nello stesso ciclo dev'essere quasi gratis
  const rcIdem = await (await token.sweepCustodyFee(batches[0])).wait();

  await (await token.unpause()).wait();

  // ── 4. Riconciliazione ───────────────────────────────────────────────────
  const treasuryDelta = (await token.balanceOf(treasury.address)) - treasuryBefore;
  const collectorDelta = (await token.balanceOf(collector.address)) - collectorBefore;

  const events = await token.queryFilter(token.filters.CustodyFeeCollected(), 0, "latest");
  const eventSum = events.reduce((a, e: any) => a + e.args.fee, 0n);

  let sweptOk = 0;
  for (const h of holders) {
    if ((await token.lastSweptCycle(h)) === 1n) sweptOk++;
  }
  const dustMarked = (await token.lastSweptCycle(dust)) === 1n;
  const dustIntact = (await token.balanceOf(dust)) === 199n;
  const exemptSkipped = (await token.lastSweptCycle(exempt)) === 0n;
  const exemptIntact = (await token.balanceOf(exempt)) === ethers.parseEther("5000");

  // spot check aritmetico sui 4 ordini di grandezza
  const spotChecks: any[] = [];
  for (let m = 0; m < BALANCES.length; m++) {
    const h = holders[m];
    const bal = await token.balanceOf(h);
    const exp = BALANCES[m] - expectedFee.get(h)!;
    spotChecks.push({ magnitudeIGT: fmt(BALANCES[m]), balanceAfter: fmt(bal), expected: fmt(exp), ok: bal === exp });
  }

  // ── 5. Ciclo 2: slot lastSweptCycle già scritti → gas inferiore ─────────
  await (await token.startNewCycle()).wait();
  await (await token.pause()).wait();
  console.log(`\nSweep ciclo 2 (slot caldi)...`);
  const cycle2Gas: { size: number; gasUsed: bigint }[] = [];
  for (const batch of batches) {
    const rc = await (await token.sweepCustodyFee(batch)).wait();
    cycle2Gas.push({ size: batch.length, gasUsed: rc!.gasUsed });
  }
  await (await token.unpause()).wait();

  // ── 6. Profilo gas per dimensione batch (ciclo 3, per il modello) ───────
  await (await token.startNewCycle()).wait();
  const profile: { size: number; gasUsed: string; perHolder: number }[] = [];
  let cursor = 0;
  for (const size of PROFILE_BATCH_SIZES) {
    const batch = holders.slice(cursor, cursor + size);
    cursor += size;
    if (batch.length < size) break;
    const rc = await (await token.sweepCustodyFee(batch)).wait();
    profile.push({ size, gasUsed: rc!.gasUsed.toString(), perHolder: Number(rc!.gasUsed) / size });
  }

  // fit lineare gas = a + b·n (minimi quadrati sul profilo ciclo 3)
  const n = profile.length;
  const sx = profile.reduce((a, p) => a + p.size, 0);
  const sy = profile.reduce((a, p) => a + Number(p.gasUsed), 0);
  const sxx = profile.reduce((a, p) => a + p.size * p.size, 0);
  const sxy = profile.reduce((a, p) => a + p.size * Number(p.gasUsed), 0);
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx); // gas marginale per holder
  const a = (sy - b * sx) / n; // overhead per transazione

  const gasPerHolderC1 = Number(cycle1Gas.reduce((s, g) => s + g.gasUsed, 0n)) / sweepTargets.length;
  const gasPerHolderC2 = Number(cycle2Gas.reduce((s, g) => s + g.gasUsed, 0n)) / sweepTargets.length;

  // ── Report ────────────────────────────────────────────────────────────────
  const results = {
    date: new Date().toISOString(),
    network: "hardhat-local (in-process)",
    tokenVersion: await token.version(),
    params: { holders: HOLDERS, batchSize: BATCH_SIZE, profile: PROFILE, custodyBps: Number(CUSTODY_BPS), transferFeeBps: Number(TRANSFER_FEE_BPS) },
    checks: {
      pauseBlocksTransfersDuringSweep: pauseBlocked,
      allHoldersSweptCycle1: sweptOk === HOLDERS,
      treasuryDeltaEqualsExpected: treasuryDelta === expectedTotalFee,
      eventsSumEqualsTreasuryDelta: eventSum === treasuryDelta,
      eventCount: events.length,
      transferFeeNotAppliedOnSweep: collectorDelta === 0n,
      dustMarkedButIntact: dustMarked && dustIntact,
      exemptSkippedAndIntact: exemptSkipped && exemptIntact,
      idempotentRepeatGas: rcIdem!.gasUsed.toString(),
      spotChecks,
    },
    economics: {
      totalCustodyCollectedIGT: fmt(treasuryDelta),
      expectedIGT: fmt(expectedTotalFee),
    },
    gas: {
      cycle1: { batches: cycle1Gas.map((g) => ({ size: g.size, gasUsed: g.gasUsed.toString() })), perHolderAvg: Math.round(gasPerHolderC1) },
      cycle2: { batches: cycle2Gas.map((g) => ({ size: g.size, gasUsed: g.gasUsed.toString() })), perHolderAvg: Math.round(gasPerHolderC2) },
      model: { perHolderMarginal: Math.round(b), txOverhead: Math.round(a), profiledOn: profile },
      idempotentRepeatPerHolder: Math.round(Number(rcIdem!.gasUsed) / batches[0].length),
      sweepWallClockSeconds: sweepSeconds,
    },
  };

  const outDir = path.join(__dirname, "results");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `sweep-simulation-${HOLDERS}h-${PROFILE}.json`);
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));

  console.log("\n══ RISULTATI ══");
  console.log(JSON.stringify(results.checks, null, 2));
  console.log(JSON.stringify(results.gas.model, null, 2));
  console.log(`Custodia incassata: ${results.economics.totalCustodyCollectedIGT} IGT (attesa: ${results.economics.expectedIGT})`);
  console.log(`Gas/holder — ciclo 1: ${results.gas.cycle1.perHolderAvg} · ciclo 2+: ${results.gas.cycle2.perHolderAvg}`);
  console.log(`\n📄 Salvato in ${outFile}`);

  // exit code ≠ 0 se una verifica fallisce
  const allOk =
    pauseBlocked &&
    sweptOk === HOLDERS &&
    treasuryDelta === expectedTotalFee &&
    eventSum === treasuryDelta &&
    collectorDelta === 0n &&
    dustMarked && dustIntact && exemptSkipped && exemptIntact &&
    spotChecks.every((s) => s.ok);
  if (!allOk) {
    console.error("\n❌ VERIFICHE FALLITE");
    process.exit(1);
  }
  console.log("\n✅ Tutte le verifiche superate");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
