import { ethers, upgrades, network } from "hardhat";
import fs from "fs";
import path from "path";

const AMOY_CHAIN_ID = 80002n;

/**
 * Upgrade del Token su Amoy testnet.
 *
 * SICUREZZA: punta SEMPRE al contratto di produzione (contracts/Token.sol) o a
 * una sua nuova versione reale — MAI a un mock di test (contracts/mocks/*).
 * Override esplicito via UPGRADE_TARGET_CONTRACT solo per test consapevoli.
 */
async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS;
  if (!proxyAddress) throw new Error("PROXY_ADDRESS not set");

  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== AMOY_CHAIN_ID) {
    throw new Error(`Rete sbagliata: connesso a chainId ${chainId}, atteso Amoy (${AMOY_CHAIN_ID})`);
  }

  const targetContract = process.env.UPGRADE_TARGET_CONTRACT || "Token";
  if (targetContract.includes("Mock") || targetContract === "TokenV2" || targetContract === "TokenV3") {
    throw new Error(
      `RIFIUTATO: "${targetContract}" e' un fixture di test (contracts/mocks/), non un contratto di produzione. ` +
        `Se e' intenzionale (solo su testnet, per collaudare il flusso di upgrade), impostare esplicitamente ` +
        `ALLOW_MOCK_UPGRADE=yes come conferma.`
    );
  }
  if ((targetContract === "TokenV2" || targetContract === "TokenV3") && process.env.ALLOW_MOCK_UPGRADE !== "yes") {
    throw new Error("Serve ALLOW_MOCK_UPGRADE=yes per upgradare verso un mock, anche su testnet.");
  }

  console.log(`Upgrading token on Amoy at ${proxyAddress} -> ${targetContract}`);

  const TargetFactory = await ethers.getContractFactory(targetContract);

  await upgrades.validateUpgrade(proxyAddress, TargetFactory, { kind: "uups" });
  console.log("✅ validateUpgrade OK (storage layout compatibile)");

  const upgraded = await upgrades.upgradeProxy(proxyAddress, TargetFactory);
  await upgraded.waitForDeployment();

  const newImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("New implementation:", newImplementation);
  console.log("Version:", await (upgraded as any).version());
  console.log(`📊 Explorer: https://amoy.polygonscan.com/address/${newImplementation}#code`);
  console.log("Prossimo passo: pnpm hardhat verify --network amoy", newImplementation);

  const deploymentsDir = path.join(__dirname, "../../deployments/amoy");
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
