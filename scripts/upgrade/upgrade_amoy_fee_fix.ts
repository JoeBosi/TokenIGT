import { ethers, upgrades } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔧 UPGRADE: Fix Fee Bug on Amoy");
  console.log("=================================");
  
  // Get deployment info
  const deploymentsDir = path.join(__dirname, "../../deployments/amoy-fresh");
  const proxyData = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "proxy.json"), "utf8"));
  const PROXY_ADDRESS = proxyData.address;
  
  console.log("Proxy Address:", PROXY_ADDRESS);
  
  // Get deployer (UPGRADER_ROLE)
  const [deployer] = await ethers.getSigners();
  console.log("Upgrader:", deployer.address);
  
  // Get existing contract
  const token = await ethers.getContractAt("Token", PROXY_ADDRESS, deployer);
  
  const versionBefore = await token.version();
  console.log("Version before:", versionBefore);
  
  // Deploy new implementation
  console.log("\n🚀 Deploying new implementation...");
  const Token = await ethers.getContractFactory("Token", deployer);
  
  // Get provider
  const provider = ethers.provider;
  
  const upgraded = await upgrades.upgradeProxy(PROXY_ADDRESS, Token, {
    kind: "uups",
  });
  
  await upgraded.waitForDeployment();
  
  // Get implementation address from proxy storage slot
  const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const implAddressData = await provider.getStorage(PROXY_ADDRESS, implementationSlot);
  const newImplementation = "0x" + implAddressData.slice(26);
  console.log("✅ New Implementation:", newImplementation);
  
  // Verify version after upgrade
  const versionAfter = await token.version();
  console.log("Version after:", versionAfter);
  
  // Save deployment info
  const deployInfo = {
    network: "amoy",
    proxy: PROXY_ADDRESS,
    implementation: newImplementation,
    version: versionAfter,
    upgradedAt: new Date().toISOString(),
  };
  
  fs.writeFileSync(
    path.join(deploymentsDir, "upgrade-fee-fix.json"),
    JSON.stringify(deployInfo, null, 2)
  );
  
  console.log("\n🎯 Fee bug fix upgrade completed!");
  console.log(`🔗 Explorer: https://amoy.polygonscan.com/address/${PROXY_ADDRESS}`);
}

main().catch(console.error);
