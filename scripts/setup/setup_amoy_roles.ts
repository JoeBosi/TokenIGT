import { ethers } from "hardhat";
import { Token } from "../../typechain-types";
import fs from "fs";
import path from "path";

async function main() {
  console.log("Setting up roles on Amoy testnet...");
  
  // Get deployed contract address
  const deploymentsDir = path.join(__dirname, "../../deployments/amoy");
  const proxyData = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "proxy.json"), "utf8"));
  const tokenAddress = proxyData.address;
  
  console.log("Token Address:", tokenAddress);
  
  // Connect to deployed contract
  const [deployer] = await ethers.getSigners();
  const token = await ethers.getContractAt("Token", tokenAddress, deployer) as Token;
  
  console.log("Deployer:", deployer.address);
  
  // Grant all necessary roles to deployer for testing
  console.log("Granting roles to deployer...");
  
  try {
    // Grant PAUSER_ROLE
    const PAUSER_ROLE = await token.PAUSER_ROLE();
    const hasPauserRole = await token.hasRole(PAUSER_ROLE, deployer.address);
    if (!hasPauserRole) {
      await token.grantRole(PAUSER_ROLE, deployer.address);
      console.log("✅ PAUSER_ROLE granted to deployer");
    } else {
      console.log("✅ Deployer already has PAUSER_ROLE");
    }
    
    // Grant MINTER_ROLE
    const MINTER_ROLE = await token.MINTER_ROLE();
    const hasMinterRole = await token.hasRole(MINTER_ROLE, deployer.address);
    if (!hasMinterRole) {
      await token.grantRole(MINTER_ROLE, deployer.address);
      console.log("✅ MINTER_ROLE granted to deployer");
    } else {
      console.log("✅ Deployer already has MINTER_ROLE");
    }
    
    // Grant BURNER_ROLE
    const BURNER_ROLE = await token.BURNER_ROLE();
    const hasBurnerRole = await token.hasRole(BURNER_ROLE, deployer.address);
    if (!hasBurnerRole) {
      await token.grantRole(BURNER_ROLE, deployer.address);
      console.log("✅ BURNER_ROLE granted to deployer");
    } else {
      console.log("✅ Deployer already has BURNER_ROLE");
    }
    
    // Grant UPGRADER_ROLE
    const UPGRADER_ROLE = await token.UPGRADER_ROLE();
    const hasUpgraderRole = await token.hasRole(UPGRADER_ROLE, deployer.address);
    if (!hasUpgraderRole) {
      await token.grantRole(UPGRADER_ROLE, deployer.address);
      console.log("✅ UPGRADER_ROLE granted to deployer");
    } else {
      console.log("✅ Deployer already has UPGRADER_ROLE");
    }
    
    // Grant FREEZER_ROLE
    const FREEZER_ROLE = await token.FREEZER_ROLE();
    const hasFreezerRole = await token.hasRole(FREEZER_ROLE, deployer.address);
    if (!hasFreezerRole) {
      await token.grantRole(FREEZER_ROLE, deployer.address);
      console.log("✅ FREEZER_ROLE granted to deployer");
    } else {
      console.log("✅ Deployer already has FREEZER_ROLE");
    }
    
    // Grant BLOCKER_ROLE
    const BLOCKER_ROLE = await token.BLOCKER_ROLE();
    const hasBlockerRole = await token.hasRole(BLOCKER_ROLE, deployer.address);
    if (!hasBlockerRole) {
      await token.grantRole(BLOCKER_ROLE, deployer.address);
      console.log("✅ BLOCKER_ROLE granted to deployer");
    } else {
      console.log("✅ Deployer already has BLOCKER_ROLE");
    }
    
    console.log("🎉 All roles granted successfully!");
    
    // Save roles configuration
    const rolesData = {
      deployer: deployer.address,
      roles: {
        DEFAULT_ADMIN_ROLE: await token.DEFAULT_ADMIN_ROLE(),
        PAUSER_ROLE,
        MINTER_ROLE,
        BURNER_ROLE,
        UPGRADER_ROLE,
        FREEZER_ROLE,
        BLOCKER_ROLE,
        FEE_ADMIN_ROLE: await token.FEE_ADMIN_ROLE(),
        RECOVERER_ROLE: await token.RECOVERER_ROLE()
      }
    };
    
    fs.writeFileSync(path.join(deploymentsDir, "roles.json"), JSON.stringify(rolesData, null, 2));
    console.log("✅ Roles configuration saved");
    
  } catch (error) {
    console.error("❌ Error setting up roles:", error);
  }
}

main().catch(console.error);
