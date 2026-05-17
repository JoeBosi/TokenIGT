import { ethers, upgrades } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS;
  if (!proxyAddress) throw new Error("PROXY_ADDRESS not set");

  console.log("Upgrading token at", proxyAddress);

  const TokenV2 = await ethers.getContractFactory("TokenV2");
  const upgraded = await upgrades.upgradeProxy(proxyAddress, TokenV2);
  await upgraded.waitForDeployment();

  const newImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("New implementation:", newImplementation);

  const deploymentsDir = path.join(__dirname, "../../deployments/local");
  fs.writeFileSync(
    path.join(deploymentsDir, "implementation.json"),
    JSON.stringify({ address: newImplementation }, null, 2)
  );
}

main().catch(console.error);
