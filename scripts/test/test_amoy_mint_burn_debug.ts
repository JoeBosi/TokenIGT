import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔍 DEBUG: Mint & Burn Issues on Amoy");
  console.log("=====================================");
  
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
    // Check roles
    console.log("\n👥 Role Check:");
    const MINTER_ROLE = await token.MINTER_ROLE();
    const BURNER_ROLE = await token.BURNER_ROLE();
    const hasMinterRole = await token.hasRole(MINTER_ROLE, deployer.address);
    const hasBurnerRole = await token.hasRole(BURNER_ROLE, deployer.address);
    
    console.log(`Has MINTER_ROLE: ${hasMinterRole}`);
    console.log(`Has BURNER_ROLE: ${hasBurnerRole}`);
    
    // Check current state
    console.log("\n📊 Current State:");
    const totalSupply = await token.totalSupply();
    const deployerBalance = await token.balanceOf(deployer.address);
    
    console.log(`Total Supply: ${ethers.formatEther(totalSupply)}`);
    console.log(`Deployer Balance: ${ethers.formatEther(deployerBalance)}`);
    
    // Debug mint issue
    console.log("\n🪙 Debug Mint Issue:");
    
    const mintAmount = ethers.parseEther("5");
    const mintRecipient = "0x35744Db4a90e39648C45921dd039168EeAa2B5cf";
    
    console.log(`Attempting to mint ${ethers.formatEther(mintAmount)} to ${mintRecipient}`);
    
    try {
      // Check gas estimation
      const gasEstimate = await token.mint.estimateGas(mintRecipient, mintAmount);
      console.log(`Gas estimate: ${gasEstimate.toString()}`);
      
      // Try actual mint
      const supplyBefore = await token.totalSupply();
      const recipientBalanceBefore = await token.balanceOf(mintRecipient);
      
      const tx = await token.mint(mintRecipient, mintAmount);
      const receipt = await tx.wait();
      
      const supplyAfter = await token.totalSupply();
      const recipientBalanceAfter = await token.balanceOf(mintRecipient);
      
      const supplyChange = supplyAfter - supplyBefore;
      const recipientChange = recipientBalanceAfter - recipientBalanceBefore;
      
      console.log(`✅ Mint successful! TX: ${tx.hash}`);
      console.log(`Supply change: ${ethers.formatEther(supplyChange)}`);
      console.log(`Recipient change: ${ethers.formatEther(recipientChange)}`);
      console.log(`Expected: ${ethers.formatEther(mintAmount)}`);
      console.log(`Mint working: ${supplyChange === mintAmount && recipientChange === mintAmount ? "✅ YES" : "❌ NO"}`);
      console.log(`Gas used: ${receipt?.gasUsed.toString()}`);
      
    } catch (mintError) {
      console.error("❌ Mint failed:", mintError.message);
      
      // Try to get more detailed error info
      if (mintError.data) {
        console.error("Error data:", mintError.data);
      }
    }
    
    // Debug burn issue
    console.log("\n🔥 Debug Burn Issue:");
    
    const burnAmount = ethers.parseEther("3");
    
    console.log(`Attempting to burn ${ethers.formatEther(burnAmount)} from deployer`);
    
    try {
      // Check if deployer has enough balance
      const deployerBalanceBefore = await token.balanceOf(deployer.address);
      console.log(`Deployer balance before: ${ethers.formatEther(deployerBalanceBefore)}`);
      
      if (deployerBalanceBefore < burnAmount) {
        console.log("❌ Insufficient balance for burn");
        return;
      }
      
      // Check gas estimation
      const gasEstimate = await token.burn.estimateGas(deployer.address, burnAmount);
      console.log(`Gas estimate: ${gasEstimate.toString()}`);
      
      // Try actual burn
      const supplyBefore = await token.totalSupply();
      
      const tx = await token.burn(deployer.address, burnAmount);
      const receipt = await tx.wait();
      
      const supplyAfter = await token.totalSupply();
      const deployerBalanceAfter = await token.balanceOf(deployer.address);
      
      const supplyChange = supplyBefore - supplyAfter;
      const balanceChange = deployerBalanceBefore - deployerBalanceAfter;
      
      console.log(`✅ Burn successful! TX: ${tx.hash}`);
      console.log(`Supply change: ${ethers.formatEther(supplyChange)}`);
      console.log(`Balance change: ${ethers.formatEther(balanceChange)}`);
      console.log(`Expected: ${ethers.formatEther(burnAmount)}`);
      console.log(`Burn working: ${supplyChange === burnAmount && balanceChange === burnAmount ? "✅ YES" : "❌ NO"}`);
      console.log(`Gas used: ${receipt?.gasUsed.toString()}`);
      
    } catch (burnError) {
      console.error("❌ Burn failed:", burnError.message);
      
      // Try to get more detailed error info
      if (burnError.data) {
        console.error("Error data:", burnError.data);
      }
      
      // Try to understand the error better
      console.log("Analyzing burn error...");
      console.log(`Deployer balance: ${ethers.formatEther(deployerBalance)}`);
      console.log(`Burn amount: ${ethers.formatEther(burnAmount)}`);
      console.log(`Has BURNER_ROLE: ${hasBurnerRole}`);
      
      if (deployerBalance < burnAmount) {
        console.log("❌ ERROR: Insufficient balance");
      } else if (!hasBurnerRole) {
        console.log("❌ ERROR: Missing BURNER_ROLE");
      } else {
        console.log("❌ ERROR: Unknown burn error - possibly contract logic issue");
      }
    }
    
    // Test with different recipient for burn
    console.log("\n🔥 Debug Burn with Different Recipient:");
    
    const burnRecipient = "0xB15a4A995050b5DdE912c1a948fF49b2a2E7d615";
    const burnAmount2 = ethers.parseEther("2");
    
    console.log(`Attempting to burn ${ethers.formatEther(burnAmount2)} from ${burnRecipient}`);
    
    try {
      const recipientBalanceBefore = await token.balanceOf(burnRecipient);
      console.log(`Recipient balance before: ${ethers.formatEther(recipientBalanceBefore)}`);
      
      if (recipientBalanceBefore < burnAmount2) {
        console.log("❌ Recipient has insufficient balance");
        return;
      }
      
      const tx = await token.burn(burnRecipient, burnAmount2);
      const receipt = await tx.wait();
      
      const recipientBalanceAfter = await token.balanceOf(burnRecipient);
      const balanceChange = recipientBalanceBefore - recipientBalanceAfter;
      
      console.log(`✅ Burn successful! TX: ${tx.hash}`);
      console.log(`Balance change: ${ethers.formatEther(balanceChange)}`);
      console.log(`Expected: ${ethers.formatEther(burnAmount2)}`);
      console.log(`Burn working: ${balanceChange === burnAmount2 ? "✅ YES" : "❌ NO"}`);
      console.log(`Gas used: ${receipt?.gasUsed.toString()}`);
      
    } catch (burnError2) {
      console.error("❌ Burn from recipient failed:", burnError2.message);
    }
    
  } catch (error) {
    console.error("❌ Debug failed:", error);
  }
}

main().catch(console.error);
