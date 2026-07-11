import { ethers, upgrades } from "hardhat";
import * as readline from "readline";
import fs from "fs";
import path from "path";

const POLYGON_CHAIN_ID = 137n;

function askConfirmation(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer);
  }));
}

/**
 * Upgrade del Token su Polygon MAINNET.
 *
 * SICUREZZA MASSIMA: punta SEMPRE al contratto di produzione (contracts/Token.sol)
 * o a una sua nuova versione reale — MAI a un mock di test (contracts/mocks/*).
 * Richiede conferma esplicita interattiva (o CONFIRM_MAINNET=yes in CI).
 */
async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS;
  if (!proxyAddress) throw new Error("PROXY_ADDRESS not set");

  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== POLYGON_CHAIN_ID) {
    throw new Error(`Rete sbagliata: connesso a chainId ${chainId}, atteso Polygon mainnet (${POLYGON_CHAIN_ID})`);
  }

  const targetContract = process.env.UPGRADE_TARGET_CONTRACT || "Token";
  if (targetContract.includes("Mock") || targetContract === "TokenV2" || targetContract === "TokenV3") {
    throw new Error(
      `RIFIUTATO: "${targetContract}" e' un fixture di test (contracts/mocks/). ` +
        `Un upgrade mainnet verso un mock non e' MAI consentito, a nessuna condizione.`
    );
  }

  const TargetFactory = await ethers.getContractFactory(targetContract);

  console.log(`\n⚠️  UPGRADE SU POLYGON MAINNET`);
  console.log(`Proxy: ${proxyAddress}`);
  console.log(`Nuovo contratto: ${targetContract}`);

  await upgrades.validateUpgrade(proxyAddress, TargetFactory, { kind: "uups" });
  console.log("✅ validateUpgrade OK (storage layout compatibile)\n");

  if (process.env.CONFIRM_MAINNET !== "yes") {
    const answer = await askConfirmation('Digitare "UPGRADE MAINNET" per confermare: ');
    if (answer.trim() !== "UPGRADE MAINNET") {
      throw new Error("Conferma non fornita. Upgrade annullato.");
    }
  }

  const upgraded = await upgrades.upgradeProxy(proxyAddress, TargetFactory);
  await upgraded.waitForDeployment();

  const newImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("New implementation:", newImplementation);
  console.log("Version:", await (upgraded as any).version());
  console.log(`📊 Explorer: https://polygonscan.com/address/${newImplementation}#code`);
  console.log("Prossimo passo: pnpm hardhat verify --network polygon", newImplementation);

  const deploymentsDir = path.join(__dirname, "../../deployments/polygon");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(deploymentsDir, "implementation.json"),
    JSON.stringify({ address: newImplementation }, null, 2)
  );

  const historyFile = path.join(deploymentsDir, "upgrade-history.json");
  const history = fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile, "utf8")) : [];
  history.push({ timestamp: new Date().toISOString(), proxy: proxyAddress, newImplementation, targetContract });
  fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
}

main()
  .then(() => process.exitCode = 0)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
