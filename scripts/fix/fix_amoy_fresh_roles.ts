import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔧 FIX: Grant MINTER_ROLE to Deployer");
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
    const MINTER_ROLE = await token.MINTER_ROLE();
    const hasMinterRole = await token.hasRole(MINTER_ROLE, deployer.address);
    
    console.log(`Current MINTER_ROLE status: ${hasMinterRole ? "✅ GRANTED" : "❌ NOT GRANTED"}`);
    
    if (!hasMinterRole) {
      console.log("Granting MINTER_ROLE to deployer...");
      const tx = await token.grantRole(MINTER_ROLE, deployer.address);
      await tx.wait();
      console.log(`✅ MINTER_ROLE granted! TX: ${tx.hash}`);
      
      // Verify
      const hasRoleAfter = await token.hasRole(MINTER_ROLE, deployer.address);
      console.log(`New MINTER_ROLE status: ${hasRoleAfter ? "✅ GRANTED" : "❌ NOT GRANTED"}`);
    }
    
    // Test mint functionality
    console.log("\n🪙 Testing Mint Functionality...");
    
    const mintAmount = ethers.parseEther("5");
    const mintRecipient = "0x35744Db4a90e39648C45921dd039168EeAa2B5cf";
    
    console.log(`Attempting to mint ${ethers.formatEther(mintAmount)} tokens to ${mintRecipient}`);
    
    const supplyBefore = await token.totalSupply();
    const recipientBalanceBefore = await token.balanceOf(mintRecipient);
    
    const tx = await token.mint(mintRecipient, mintAmount);
    const receipt = await tx.wait();
    
    const supplyAfter = await token.totalSupply();
    const recipientBalanceAfter = await token.balanceOf(mintRecipient);
    
    const supplyChange = supplyAfter - supplyBefore;
    const recipientChange = recipientBalanceAfter - recipientBalanceBefore;
    
    const mintWorking = supplyChange === mintAmount && recipientChange === mintAmount;
    
    console.log(`✅ Mint successful! TX: ${tx.hash}`);
    console.log(`Supply change: ${ethers.formatEther(supplyChange)}`);
    console.log(`Recipient change: ${ethers.formatEther(recipientChange)}`);
    console.log(`Mint working: ${mintWorking ? "✅ YES" : "❌ NO"}`);
    console.log(`Gas used: ${receipt?.gasUsed.toString()}`);
    
  } catch (error) {
    console.error("❌ Fix failed:", error);
  }
}

main().catch(console.error);
