import { ethers } from "hardhat";
import type { Token } from "../../typechain-types";
import fs from "fs";
import path from "path";

/**
 * TEST DI INTEGRAZIONE ON-CHAIN sul proxy Amoy live.
 * Esegue transazioni REALI contro il contratto deployato e verifica il
 * comportamento: fee netta, fee lorda (ERC-1363), freeze, block, pause, recovery
 * (con evento AssetRecovered). Un solo operatore (il deployer, DEFAULT_ADMIN che
 * si autoconcede i ruoli operativi per il test).
 *
 * Uso: PROXY_ADDRESS=... pnpm hardhat run scripts/amoy_test/onchain_integration.ts --network amoy
 */

const results: { check: string; ok: boolean; detail: string }[] = [];
function record(check: string, ok: boolean, detail = "") {
  results.push({ check, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${check}${detail ? " — " + detail : ""}`);
}

async function main() {
  const proxy = process.env.PROXY_ADDRESS!;
  const [rawOp] = await ethers.getSigners();
  // NonceManager: gestisce il nonce localmente invece di rileggerlo (in ritardo)
  // dall'RPC pubblico dopo ogni tx — elimina i "nonce too low" transitori.
  const op = new ethers.NonceManager(rawOp) as unknown as typeof rawOp;
  const token = (await ethers.getContractAt("Token", proxy, op)) as unknown as Token;
  console.log(`Proxy ${proxy} · operatore ${rawOp.address} · v${await token.version()}\n`);

  // ── Setup: il deployer (admin) si concede i ruoli operativi per il test ──
  for (const r of ["MINTER_ROLE", "PAUSER_ROLE", "FREEZER_ROLE", "BLOCKER_ROLE", "BURNER_ROLE"]) {
    const role = await (token as any)[r]();
    if (!(await token.hasRole(role, rawOp.address))) {
      await (await token.grantRole(role, rawOp.address)).wait();
    }
  }
  // Il collector deve essere DIVERSO dal mittente (deployer), altrimenti la fee
  // rientrerebbe al mittente e non sarebbe osservabile. Uso un indirizzo dedicato.
  const feeCollector = "0x000000000000000000000000000000000000FEE1";
  if ((await token.feeCollector()).toLowerCase() !== feeCollector.toLowerCase()) {
    await (await token.setFeeCollector(feeCollector)).wait();
  }
  console.log(`Ruoli operativi concessi al deployer; feeCollector = ${feeCollector}\n`);

  const fresh = () => ethers.Wallet.createRandom().address;

  // ── 1. Transfer NETTO: destinatario riceve v - fee ──
  {
    const to = fresh();
    const v = ethers.parseEther("1000");
    await (await token.mint(rawOp.address, v)).wait();
    const expNet = await token.previewNet(v);
    const collBefore = await token.balanceOf(feeCollector);
    await (await token.transfer(to, v)).wait();
    const got = await token.balanceOf(to);
    const collDelta = (await token.balanceOf(feeCollector)) - collBefore;
    record(
      "transfer NETTO (destinatario riceve netto, collector +fee)",
      got === expNet && collDelta === v - expNet,
      `destinatario ${ethers.formatEther(got)} (atteso ${ethers.formatEther(expNet)}), fee ${ethers.formatEther(collDelta)}`
    );
  }

  // ── 2. Transfer LORDO (ERC-1363 verso EOA): destinatario riceve v esatti ──
  {
    const to = fresh();
    const v = ethers.parseEther("500");
    const need = v + (v - (await token.previewNet(v))); // v + fee
    await (await token.mint(rawOp.address, need)).wait();
    const opBefore = await token.balanceOf(rawOp.address);
    await (await token["transferAndCall(address,uint256)"](to, v)).wait();
    const got = await token.balanceOf(to);
    const paid = opBefore - (await token.balanceOf(rawOp.address));
    record(
      "transferAndCall LORDO (destinatario +v esatti, mittente paga v+fee)",
      got === v && paid === need,
      `destinatario ${ethers.formatEther(got)} (=v ${ethers.formatEther(v)}), pagato ${ethers.formatEther(paid)}`
    );
  }

  // ── 3. FREEZE: transfer verso un frozen reverta; unfreeze ripristina ──
  {
    const frozen = fresh();
    await (await token.freeze(frozen)).wait();
    let reverted = false;
    try {
      await (await token.transfer(frozen, ethers.parseEther("1"))).wait();
    } catch {
      reverted = true;
    }
    await (await token.unfreeze(frozen)).wait();
    await (await token.mint(rawOp.address, ethers.parseEther("10"))).wait();
    await (await token.transfer(frozen, ethers.parseEther("10"))).wait();
    record("FREEZE blocca il transfer verso frozen, unfreeze ripristina", reverted && (await token.balanceOf(frozen)) > 0n);
  }

  // ── 4. BLOCK: transfer verso un blocked reverta; unblock ripristina ──
  {
    const blocked = fresh();
    await (await token.blockAccount(blocked)).wait();
    let reverted = false;
    try {
      await (await token.transfer(blocked, ethers.parseEther("1"))).wait();
    } catch {
      reverted = true;
    }
    await (await token.unblockAccount(blocked)).wait();
    record("BLOCK blocca il transfer verso blocked, unblock ripristina", reverted && !(await token.isBlocked(blocked)));
  }

  // ── 5. PAUSE: transfer reverta in pausa; unpause ripristina ──
  {
    await (await token.pause()).wait();
    let reverted = false;
    try {
      await (await token.transfer(fresh(), ethers.parseEther("1"))).wait();
    } catch {
      reverted = true;
    }
    await (await token.unpause()).wait();
    record("PAUSE blocca i transfer, unpause ripristina", reverted && !(await token.paused()));
  }

  // ── 6. RECOVERY nativo → evento AssetRecovered ──
  {
    const to = fresh();
    const amount = ethers.parseEther("0.01"); // 0.01 POL
    await (await op.sendTransaction({ to: proxy, value: amount })).wait();
    const tx = await token.recoverNative(to, amount);
    const rc = await tx.wait();
    // cerca l'evento AssetRecovered nei log
    let found = false;
    for (const log of rc!.logs) {
      try {
        const parsed = token.interface.parseLog(log as any);
        if (parsed?.name === "AssetRecovered") found = true;
      } catch {}
    }
    const recovered = await ethers.provider.getBalance(to);
    record("recoverNative sposta POL ed emette AssetRecovered", found && recovered === amount, `evento=${found}`);
  }

  // ── Report ──
  const outDir = path.join(__dirname, "results");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "integration.json"),
    JSON.stringify({ date: new Date().toISOString(), proxy, results }, null, 2)
  );

  const allOk = results.every((r) => r.ok);
  console.log(`\n${allOk ? "✅ INTEGRAZIONE: tutti i check superati" : "❌ INTEGRAZIONE: alcuni check falliti"}`);
  if (!allOk) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
