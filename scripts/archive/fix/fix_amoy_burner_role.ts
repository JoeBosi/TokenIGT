import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔧 FIX: Grant BURNER_ROLE to Deployer");
  console.log("====================================");
  
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
    // Check current role status
    const BURNER_ROLE = await token.BURNER_ROLE();
    const hasBurnerRole = await token.hasRole(BURNER_ROLE, deployer.address);
    
    console.log(`Current BURNER_ROLE status: ${hasBurnerRole ? "✅ GRANTED" : "❌ NOT GRANTED"}`);
    
    if (!hasBurnerRole) {
      console.log("Granting BURNER_ROLE to deployer...");
      const tx = await token.grantRole(BURNER_ROLE, deployer.address);
      await tx.wait();
      console.log(`✅ BURNER_ROLE granted! TX: ${tx.hash}`);
      
      // Verify
      const hasRoleAfter = await token.hasRole(BURNER_ROLE, deployer.address);
      console.log(`New BURNER_ROLE status: ${hasRoleAfter ? "✅ GRANTED" : "❌ NOT GRANTED"}`);
    }
    
    // Test burn functionality
    console.log("\n🔥 Testing Burn Functionality...");
    
    const burnAmount = ethers.parseEther("3");
    
    console.log(`Attempting to burn ${ethers.formatEther(burnAmount)} tokens from deployer`);
    
    const deployerBalanceBefore = await token.balanceOf(deployer.address);
    const supplyBefore = await token.totalSupply();
    
    console.log(`Deployer balance before: ${ethers.formatEther(deployerBalanceBefore)}`);
    console.log(`Total supply before: ${ethers.formatEther(supplyBefore)}`);
    
    const tx = await token.burn(deployer.address, burnAmount);
    const receipt = await tx.wait();
    
    const deployerBalanceAfter = await token.balanceOf(deployer.address);
    const supplyAfter = await token.totalSupply();
    
    const balanceChange = deployerBalanceBefore - deployerBalanceAfter;
    const supplyChange = supplyBefore - supplyAfter;
    
    console.log(`✅ Burn successful! TX: ${tx.hash}`);
    console.log(`Deployer balance after: ${ethers.formatEther(deployerBalanceAfter)}`);
    console.log(`Total supply after: ${ethers.formatEther(supplyAfter)}`);
    console.log(`Balance change: ${ethers.formatEther(balanceChange)}`);
    console.log(`Supply change: ${ethers.formatEther(supplyChange)}`);
    console.log(`Expected: ${ethers.formatEther(burnAmount)}`);
    console.log(`Burn working: ${balanceChange === burnAmount && supplyChange === burnAmount ? "✅ YES" : "❌ NO"}`);
    console.log(`Gas used: ${receipt?.gasUsed.toString()}`);
    
    // Test all roles status
    console.log("\n👥 Final Role Status:");
    const roles = [
      { name: "DEFAULT_ADMIN_ROLE", role: await token.DEFAULT_ADMIN_ROLE() },
      { name: "PAUSER_ROLE", role: await token.PAUSER_ROLE() },
      { name: "MINTER_ROLE", role: await token.MINTER_ROLE() },
      { name: "BURNER_ROLE", role: await token.BURNER_ROLE() },
      { name: "UPGRADER_ROLE", role: await token.UPGRADER_ROLE() },
      { name: "FREEZER_ROLE", role: await token.FREEZER_ROLE() },
      { name: "BLOCKER_ROLE", role: await token.BLOCKER_ROLE() },
      { name: "FEE_ADMIN_ROLE", role: await token.FEE_ADMIN_ROLE() },
      { name: "RECOVERER_ROLE", role: await token.RECOVERER_ROLE() }
    ];
    
    let grantedCount = 0;
    for (const { name, role } of roles) {
      const hasRole = await token.hasRole(role, deployer.address);
      if (hasRole) grantedCount++;
      console.log(`${name}: ${hasRole ? "✅ GRANTED" : "❌ NOT GRANTED"}`);
    }
    
    console.log(`\n📊 Summary: ${grantedCount}/9 roles granted to deployer`);
    
  } catch (error) {
    console.error("❌ Fix failed:", error);
  }
}

main().catch(console.error);
