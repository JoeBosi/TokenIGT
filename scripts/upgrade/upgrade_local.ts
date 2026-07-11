import { ethers, upgrades, network } from "hardhat";
import fs from "fs";
import path from "path";

/**
 * Upgrade del Token in locale (rete hardhat/localhost).
 *
 * ATTENZIONE: punta al contratto di PRODUZIONE (contracts/Token.sol), non a un
 * mock di test. Per validare un upgrade verso una nuova versione reale,
 * impostare UPGRADE_TARGET_CONTRACT (default: "Token" — nessun cambiamento di
 * bytecode, utile solo per testare il flusso).
 */
async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS;
  if (!proxyAddress) throw new Error("PROXY_ADDRESS not set");

  const targetContract = process.env.UPGRADE_TARGET_CONTRACT || "Token";
  console.log(`Upgrading token at ${proxyAddress} (rete: ${network.name}) -> ${targetContract}`);

  const TargetFactory = await ethers.getContractFactory(targetContract);

  await upgrades.validateUpgrade(proxyAddress, TargetFactory, { kind: "uups" });
  console.log("✅ validateUpgrade OK (storage layout compatibile)");

  const upgraded = await upgrades.upgradeProxy(proxyAddress, TargetFactory);
  await upgraded.waitForDeployment();

  const newImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("New implementation:", newImplementation);
  console.log("Version:", await (upgraded as any).version());

  const deploymentsDir = path.join(__dirname, "../../deployments/local");
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
