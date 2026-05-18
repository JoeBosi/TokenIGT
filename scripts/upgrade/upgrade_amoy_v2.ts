import { ethers, upgrades } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🚀 UPGRADE TEST: V1 -> V2");
  console.log("==========================");
  
  // Get deployment info
  const deploymentsDir = path.join(__dirname, "../../deployments/amoy-fresh");
  const proxyData = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "proxy.json"), "utf8"));
  const PROXY_ADDRESS = proxyData.address;
  
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Proxy:", PROXY_ADDRESS);
  
  // Get existing contract
  const token = await ethers.getContractAt("Token", PROXY_ADDRESS, deployer);
  
  const versionBefore = await token.version();
  const totalSupplyBefore = await token.totalSupply();
  console.log("Version before:", versionBefore);
  console.log("Total Supply before:", ethers.formatEther(totalSupplyBefore), "IGT");
  
  // Deploy V2
  console.log("\n🔧 Deploying TokenV2...");
  const TokenV2 = await ethers.getContractFactory("TokenV2", deployer);
  
  const upgraded = await upgrades.upgradeProxy(PROXY_ADDRESS, TokenV2, {
    kind: "uups",
    call: { fn: "initializeV2", args: [42, "V2 Upgrade Test"] }
  });
  
  await upgraded.waitForDeployment();
  
  // Get new implementation
  const provider = ethers.provider;
  const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const implAddressData = await provider.getStorage(PROXY_ADDRESS, implementationSlot);
  const newImplementation = "0x" + implAddressData.slice(26);
  console.log("New Implementation:", newImplementation);
  
  // Check V2 functionality
  const tokenV2 = await ethers.getContractAt("TokenV2", PROXY_ADDRESS, deployer);
  
  const newVariable = await tokenV2.newVariable();
  const newString = await tokenV2.newString();
  const versionAfter = await tokenV2.version();
  const totalSupplyAfter = await tokenV2.totalSupply();
  
  console.log("\n📊 V2 State:");
  console.log("newVariable:", newVariable.toString());
  console.log("newString:", newString);
  console.log("Version after:", versionAfter);
  console.log("Total Supply after:", ethers.formatEther(totalSupplyAfter), "IGT");
  
  // Verify state preserved
  const statePreserved = totalSupplyAfter === totalSupplyBefore;
  console.log("\n✅ State preserved:", statePreserved ? "YES" : "NO");
  console.log("✅ V2 initialized:", newVariable === 42n ? "YES" : "NO");
  
  // Save deployment info
  const deployInfo = {
    network: "amoy",
    proxy: PROXY_ADDRESS,
    implementationV2: newImplementation,
    version: versionAfter,
    upgradedAt: new Date().toISOString(),
  };
  
  fs.writeFileSync(
    path.join(deploymentsDir, "upgrade-v2.json"),
    JSON.stringify(deployInfo, null, 2)
  );
  
  console.log("\n🎉 V1 -> V2 Upgrade completed successfully!");
}

main().catch(console.error);
