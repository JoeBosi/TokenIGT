import { ethers, upgrades } from "hardhat";
import { indexHolders, verifyCompleteness, buildBatches, verifySweepComplete } from "./sweep_indexer";

/**
 * TEST LOCALE end-to-end dell'indexer + processo runbook:
 *   PAUSA → startNewCycle → SNAPSHOT (index+completezza) → SWEEP → GATE → UNPAUSE
 *
 * Dimostra inoltre la proprietà chiave dell'ordine pausa→snapshot: il prelievo
 * on-chain coincide AL WEI con quello previsto dallo snapshot (stato congelato).
 */
async function main() {
  const [admin, treasury, collector, u1, u2, u3] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("Token");
  const token = await upgrades.deployProxy(
    Token,
    ["IGE Token", "IGT", 0, admin.address, 1, collector.address, 50, treasury.address, admin.address],
    { kind: "uups" }
  );
  await token.waitForDeployment();
  for (const role of ["MINTER_ROLE", "BURNER_ROLE", "PAUSER_ROLE"]) {
    await (await token.grantRole(await (token as any)[role](), admin.address)).wait();
  }

  // ── Attività realistica pre-sweep ─────────────────────────────────────────
  console.log("Seed: 800 holder sintetici + attività di trasferimento reale...");
  const mk = (i: number) => ethers.getAddress("0x" + (0x300000000000n + BigInt(i)).toString(16).padStart(40, "0"));
  const MAG = [10n, 1_000n, 100_000n, 10_000_000n].map((x) => x * 10n ** 18n);
  for (let i = 0; i < 800; i++) {
    await (await token.mint(mk(i), MAG[i % 4])).wait();
  }
  // utenti con chiavi che si scambiano token (genera Transfer con gambe fee)
  for (const u of [u1, u2, u3]) await (await token.mint(u.address, ethers.parseEther("50000"))).wait();
  await (await token.connect(u1).transfer(u2.address, ethers.parseEther("12345"))).wait();
  await (await token.connect(u2).transfer(u3.address, ethers.parseEther("777"))).wait();
  await (await token.connect(u3)["transferAndCall(address,uint256)"](u1.address, ethers.parseEther("100"))).wait();
  // burn parziale (il to=0 va gestito dall'indexer)
  await (await token.burn(mk(5), MAG[1] / 2n)).wait();
  // dust ed esente
  const dust = ethers.getAddress("0x" + "d".repeat(40));
  await (await token.mint(dust, 150n)).wait();
  const exempt = ethers.getAddress("0x" + "e".repeat(40));
  await (await token.mint(exempt, ethers.parseEther("9999"))).wait();
  await (await token.addCustodyFeeExempt(exempt)).wait();

  // ── RUNBOOK §1-2: PAUSA, poi apertura ciclo ───────────────────────────────
  await (await token.pause()).wait();
  await (await token.startNewCycle()).wait();
  const cycle = await token.currentCycle();
  console.log(`PAUSA ok · ciclo aperto: ${cycle}`);

  // ── RUNBOOK §3: SNAPSHOT sullo stato congelato ────────────────────────────
  const idx = await indexHolders(token as any, 0, 100000);
  const completeness = await verifyCompleteness(token as any, idx, 30);
  if (!completeness.ok) throw new Error("Completezza fallita:\n" + completeness.issues.join("\n"));
  console.log(`SNAPSHOT ok: ${idx.holders.length} holder, completezza verificata (Σ==totalSupply, spot-check)`);

  const { batches, excluded } = await buildBatches(token as any, idx, 300, 200n);
  console.log(`Batch: ${batches.length} · esclusi ${excluded.exempt.length} esenti + ${excluded.dust} dust`);

  // Previsione ESATTA dallo snapshot (possibile solo perché siamo in pausa)
  const predicted = batches.flat().reduce((sum, h) => sum + ((idx.balances.get(ethers.getAddress(h)) ?? 0n) * 50n) / 10000n, 0n);

  // ── GATE negativo: con un batch mancante la verifica DEVE fallire ─────────
  const treasuryBefore = await token.balanceOf(treasury.address);
  for (const batch of batches.slice(0, -1)) {
    await (await token.sweepCustodyFee(batch)).wait();
  }
  const gateEarly = await verifySweepComplete(token as any, batches);
  if (gateEarly.ok) throw new Error("Il gate doveva fallire con un batch mancante!");
  console.log(`GATE negativo ok: rilevati ${gateEarly.missing.length} holder non sweepati (batch mancante)`);

  // completa l'ultimo batch → gate deve passare
  await (await token.sweepCustodyFee(batches[batches.length - 1])).wait();
  const gate = await verifySweepComplete(token as any, batches);
  if (!gate.ok) throw new Error(`Gate fallito: mancano ${gate.missing.length} holder`);
  console.log("GATE positivo ok: tutti gli holder sweepati nel ciclo corrente");

  // ── Riconciliazione: previsione snapshot == incasso reale (al wei) ───────
  const collected = (await token.balanceOf(treasury.address)) - treasuryBefore;
  if (collected !== predicted) {
    throw new Error(`Riconciliazione fallita: previsto ${predicted}, incassato ${collected}`);
  }
  console.log(`RICONCILIAZIONE esatta al wei: ${ethers.formatEther(collected)} IGT (previsto == incassato)`);

  // esente e dust intatti
  if ((await token.balanceOf(exempt)) !== ethers.parseEther("9999")) throw new Error("esente toccato!");
  if ((await token.balanceOf(dust)) !== 150n) throw new Error("dust toccato!");

  // ── RUNBOOK §6: UNPAUSE solo a gate superato ──────────────────────────────
  await (await token.unpause()).wait();
  await (await token.connect(u1).transfer(u2.address, 1n)).wait();
  console.log("UNPAUSE ok, transfer di prova riuscito");

  console.log("\n✅ INDEXER + PROCESSO RUNBOOK: tutte le verifiche superate");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
