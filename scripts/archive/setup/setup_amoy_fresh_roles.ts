import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("👥 SETUP: Configure Roles for Fresh Amoy Deployment");
  console.log("===============================================");
  
  // Get fresh deployment address
  const deploymentsDir = path.join(__dirname, "../../deployments/amoy-fresh");
  const proxyData = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "proxy.json"), "utf8"));
  const tokenAddress = proxyData.address;
  
  console.log("Token Address:", tokenAddress);
  
  // Connect to deployed contract
  const [deployer] = await ethers.getSigners();
  const token = await ethers.getContractAt("Token", tokenAddress, deployer);
  
  console.log("Deployer:", deployer.address);
  
  try {
    // Get role constants
    const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
    const PAUSER_ROLE = await token.PAUSER_ROLE();
    const MINTER_ROLE = await token.MINTER_ROLE();
    const BURNER_ROLE = await token.BURNER_ROLE();
    const UPGRADER_ROLE = await token.UPGRADER_ROLE();
    const FREEZER_ROLE = await token.FREEZER_ROLE();
    const BLOCKER_ROLE = await token.BLOCKER_ROLE();
    const FEE_ADMIN_ROLE = await token.FEE_ADMIN_ROLE();
    const RECOVERER_ROLE = await token.RECOVERER_ROLE();
    
    // Role addresses from .env
    const defaultAdminAddress = process.env.DEFAULT_ADMIN_ADDRESS || deployer.address;
    const upgraderAddress = process.env.UPGRADER_ADDRESS || deployer.address;
    const minterAddress = process.env.MINTER_ADDRESS || deployer.address;
    const burnerAddress = process.env.BURNER_ADDRESS || deployer.address;
    const pauserAddress = process.env.PAUSER_ADDRESS || deployer.address;
    const freezerAddress = process.env.FREEZER_ADDRESS || deployer.address;
    const blockerAddress = process.env.BLOCKER_ADDRESS || deployer.address;
    const feeAdminAddress = process.env.FEE_ADMIN_ADDRESS || deployer.address;
    const recovererAddress = process.env.RECOVERER_ADDRESS || deployer.address;
    
    console.log("\n🔧 Granting Roles...");
    
    // Grant roles (deployer already has DEFAULT_ADMIN_ROLE from initialize)
    const roles = [
      { name: "UPGRADER_ROLE", role: UPGRADER_ROLE, address: upgraderAddress },
      { name: "MINTER_ROLE", role: MINTER_ROLE, address: minterAddress },
      { name: "BURNER_ROLE", role: BURNER_ROLE, address: burnerAddress },
      { name: "PAUSER_ROLE", role: PAUSER_ROLE, address: pauserAddress },
      { name: "FREEZER_ROLE", role: FREEZER_ROLE, address: freezerAddress },
      { name: "BLOCKER_ROLE", role: BLOCKER_ROLE, address: blockerAddress },
      { name: "FEE_ADMIN_ROLE", role: FEE_ADMIN_ROLE, address: feeAdminAddress },
      { name: "RECOVERER_ROLE", role: RECOVERER_ROLE, address: recovererAddress }
    ];
    
    for (const { name, role, address } of roles) {
      try {
        const hasRole = await token.hasRole(role, address);
        if (!hasRole) {
          const tx = await token.grantRole(role, address);
          await tx.wait();
          console.log(`✅ ${name} granted to ${address}`);
        } else {
          console.log(`ℹ️ ${name} already granted to ${address}`);
        }
      } catch (error) {
        console.error(`❌ Failed to grant ${name}:`, error);
      }
    }
    
    // Verify all roles
    console.log("\n🔍 Verifying Role Assignments...");
    for (const { name, role, address } of roles) {
      const hasRole = await token.hasRole(role, address);
      console.log(`${name}: ${hasRole ? "✅ GRANTED" : "❌ NOT GRANTED"}`);
    }
    
    // Save roles info
    const rolesInfo = {
      network: "amoy-fresh",
      timestamp: new Date().toISOString(),
      roles: {
        DEFAULT_ADMIN_ROLE: { address: defaultAdminAddress, hash: DEFAULT_ADMIN_ROLE },
        UPGRADER_ROLE: { address: upgraderAddress, hash: UPGRADER_ROLE },
        MINTER_ROLE: { address: minterAddress, hash: MINTER_ROLE },
        BURNER_ROLE: { address: burnerAddress, hash: BURNER_ROLE },
        PAUSER_ROLE: { address: pauserAddress, hash: PAUSER_ROLE },
        FREEZER_ROLE: { address: freezerAddress, hash: FREEZER_ROLE },
        BLOCKER_ROLE: { address: blockerAddress, hash: BLOCKER_ROLE },
        FEE_ADMIN_ROLE: { address: feeAdminAddress, hash: FEE_ADMIN_ROLE },
        RECOVERER_ROLE: { address: recovererAddress, hash: RECOVERER_ROLE }
      }
    };
    
    fs.writeFileSync(path.join(deploymentsDir, "roles.json"), JSON.stringify(rolesInfo, null, 2));
    
    console.log("\n✅ Role setup completed!");
    console.log("🔗 Roles info saved to deployments/amoy-fresh/roles.json");
    
  } catch (error) {
    console.error("❌ Role setup failed:", error);
  }
}

main().catch(console.error);
