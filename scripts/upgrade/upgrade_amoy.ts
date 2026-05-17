import { ethers, upgrades } from "hardhat";

async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS;
  if (!proxyAddress) throw new Error("PROXY_ADDRESS not set");

  console.log("Upgrading token on Amoy at", proxyAddress);

  const TokenV2 = await ethers.getContractFactory("TokenV2");
  const upgraded = await upgrades.upgradeProxy(proxyAddress, TokenV2);
  await upgraded.waitForDeployment();

  const newImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("New implementation:", newImplementation);
}

main().catch(console.error);
