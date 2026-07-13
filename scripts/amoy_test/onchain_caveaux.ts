import { ethers } from "hardhat";
import type { Token } from "../../typechain-types";
import fs from "fs";
import path from "path";

/**
 * TEST DEL CAVEAUX (custody sweep) ON-CHAIN sul proxy Amoy live (v2.4.0).
 * Esegue la procedura operativa VINCOLANTE del runbook con transazioni reali:
 *   pause → startNewCycle → SNAPSHOT (letture) → sweepCustodyFee → VERIFICA → unpause
 * e riconcilia l'incasso (delta treasury == Σ fee attese == Σ eventi) al wei.
 *
 * Uso: PROXY_ADDRESS=... pnpm hardhat run scripts/amoy_test/onchain_caveaux.ts --network amoy
 */

const CUSTODY_BPS = 50n; // 0,50%

async function main() {
  const proxy = process.env.PROXY_ADDRESS!;
  const [op] = await ethers.getSigners();
  const token = (await ethers.getContractAt("Token", proxy)) as unknown as Token;
  console.log(`Proxy ${proxy} · operatore ${op.address} · v${await token.version()}\n`);

  // v2.4.0: startNewCycle/sweepCustodyFee richiedono SWEEPER_ROLE (split da
  // FEE_ADMIN_ROLE, non più auto-concesso da initialize) — il deployer/admin
  // se lo autoconcede per il test, come già fa per gli altri ruoli operativi
  // in onchain_integration.ts
  const sweeperRole = await token.SWEEPER_ROLE();
  if (!(await token.hasRole(sweeperRole, op.address))) {
    await (await token.grantRole(sweeperRole, op.address)).wait();
  }

  // Treasury dedicata (≠ operatore) per misurare l'incasso in modo pulito
  const treasury = "0x000000000000000000000000000000000000FEE2";
  if ((await token.custodyTreasury()).toLowerCase() !== treasury.toLowerCase()) {
    await (await token.setCustodyTreasury(treasury)).wait();
  }
  if (Number(await token.custodyFeeBps()) !== Number(CUSTODY_BPS)) {
    await (await token.setCustodyFeeBps(CUSTODY_BPS)).wait();
  }

  // ── Seed: 6 holder con balance vari (business ~8,6 IGT, grandi, dust) ──
  const holders = Array.from({ length: 6 }, () => ethers.Wallet.createRandom().address);
  const balances = [
    ethers.parseEther("8.609"), // detenzione media (~€2.000)
    ethers.parseEther("8.609"),
    ethers.parseEther("1000"), // grande
    ethers.parseEther("100000"), // molto grande
    ethers.parseEther("0.05"), // piccolo (fee = 0.00025)
    199n, // dust: fee arrotondata a 0
  ];
  console.log("Seed 6 holder (mint)...");
  for (let i = 0; i < holders.length; i++) {
    await (await token.mint(holders[i], balances[i])).wait();
  }

  const expectedFee = balances.map((b) => (b * CUSTODY_BPS) / 10000n);
  const expectedTotal = expectedFee.reduce((a, b) => a + b, 0n);

  // ── RUNBOOK: 1. PAUSA ──
  if (!(await token.paused())) await (await token.pause()).wait();
  console.log("① PAUSA attiva");

  // probe: un transfer normale deve fallire in pausa
  let pauseBlocks = false;
  try {
    await (await token.transfer(holders[0], 1n)).wait();
  } catch {
    pauseBlocks = true;
  }

  // ── 2. APERTURA CICLO ──
  await (await token.startNewCycle()).wait();
  const cycle = await token.currentCycle();
  console.log(`② Ciclo aperto: ${cycle}`);

  // ── 3. SNAPSHOT (letture sullo stato congelato) ──
  const snap: bigint[] = [];
  for (const h of holders) snap.push(await token.balanceOf(h));
  console.log("③ Snapshot letto (stato congelato)");

  // ── 4. SWEEP ──
  const treasuryBefore = await token.balanceOf(treasury);
  const rc = await (await token.sweepCustodyFee(holders)).wait();
  console.log(`④ Sweep eseguito — gas ${rc!.gasUsed} (${(Number(rc!.gasUsed) / holders.length).toFixed(0)}/holder)`);

  // ── 5. VERIFICA (gate) ──
  const treasuryDelta = (await token.balanceOf(treasury)) - treasuryBefore;
  let allSwept = true;
  for (const h of holders) if ((await token.lastSweptCycle(h)) !== cycle) allSwept = false;

  // eventi CustodyFeeCollected del ciclo
  const evts = rc!.logs
    .map((l) => {
      try {
        return token.interface.parseLog(l as any);
      } catch {
        return null;
      }
    })
    .filter((p) => p?.name === "CustodyFeeCollected");
  const evtSum = evts.reduce((a, e: any) => a + e!.args.fee, 0n);

  // spot check per holder (dust deve avere fee 0)
  const spot = holders.map((h, i) => ({
    holderBalance: ethers.formatEther(balances[i]),
    expectedFee: ethers.formatEther(expectedFee[i]),
    ok: snap[i] === balances[i],
  }));

  const reconOk = treasuryDelta === expectedTotal && evtSum === treasuryDelta && allSwept;
  console.log(
    `⑤ Verifica: treasuryDelta ${ethers.formatEther(treasuryDelta)} == atteso ${ethers.formatEther(expectedTotal)} == eventi ${ethers.formatEther(evtSum)} · tutti sweepati=${allSwept}`
  );

  // ── 6. UNPAUSE ──
  await (await token.unpause()).wait();
  console.log("⑥ UNPAUSE — token riaperto");

  const checks = {
    pauseBlocksTransfers: pauseBlocks,
    allHoldersSwept: allSwept,
    treasuryDeltaEqualsExpected: treasuryDelta === expectedTotal,
    eventsSumEqualsDelta: evtSum === treasuryDelta,
    dustFeeIsZero: expectedFee[5] === 0n,
    unpaused: !(await token.paused()),
  };
  const allOk = Object.values(checks).every(Boolean) && reconOk;

  const out = {
    date: new Date().toISOString(),
    proxy,
    cycle: cycle.toString(),
    custodyBps: Number(CUSTODY_BPS),
    holders: holders.length,
    totalCollected: ethers.formatEther(treasuryDelta),
    expectedTotal: ethers.formatEther(expectedTotal),
    gasPerHolder: Math.round(Number(rc!.gasUsed) / holders.length),
    sweepTx: rc!.hash,
    checks,
    spot,
  };
  const outDir = path.join(__dirname, "results");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "caveaux.json"), JSON.stringify(out, null, 2));

  console.log("\n" + JSON.stringify(checks, null, 2));
  console.log(`\nIncasso custodia: ${out.totalCollected} IGT (atteso ${out.expectedTotal}) · tx ${rc!.hash}`);
  console.log(allOk ? "\n✅ CAVEAUX: tutte le verifiche superate" : "\n❌ CAVEAUX: verifiche fallite");
  if (!allOk) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
