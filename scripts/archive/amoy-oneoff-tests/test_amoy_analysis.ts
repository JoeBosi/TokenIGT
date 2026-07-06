import { ethers } from "hardhat";
import { Token } from "../../typechain-types";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔍 DEEP ANALYSIS: Amoy Test Failures");
  console.log("=====================================");
  
  // Get deployed contract address
  const deploymentsDir = path.join(__dirname, "../../deployments/amoy");
  const proxyData = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "proxy.json"), "utf8"));
  const tokenAddress = proxyData.address;
  
  console.log("Token Address:", tokenAddress);
  
  // Connect to deployed contract
  const [deployer] = await ethers.getSigners();
  const token = await ethers.getContractAt("Token", tokenAddress, deployer) as Token;
  
  console.log("Deployer:", deployer.address);
  
  try {
    // Check current state
    console.log("\n📊 CURRENT STATE:");
    const name = await token.name();
    const symbol = await token.symbol();
    const totalSupply = await token.totalSupply();
    const deployerBalance = await token.balanceOf(deployer.address);
    const version = await token.version();
    
    console.log(`Name: ${name}`);
    console.log(`Symbol: ${symbol}`);
    console.log(`Version: ${version}`);
    console.log(`Total Supply: ${ethers.formatEther(totalSupply)} ${symbol}`);
    console.log(`Deployer Balance: ${ethers.formatEther(deployerBalance)} ${symbol}`);
    
    // ANALYSIS 1: Role System Issues
    console.log("\n🔍 ANALYSIS 1: Role System");
    console.log("========================");
    
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
    
    console.log("Role Assignments:");
    for (const { name, role } of roles) {
      const hasRole = await token.hasRole(role, deployer.address);
      console.log(`  ${name}: ${hasRole ? "✅ GRANTED" : "❌ NOT GRANTED"}`);
    }
    
    // ANALYSIS 2: Fee System Issues
    console.log("\n🔍 ANALYSIS 2: Fee System");
    console.log("======================");
    
    const fee = await token.fee();
    const feeCollector = await token.feeCollector();
    console.log(`Current Fee: ${fee} basis points (${Number(fee)/100}%)`);
    console.log(`Fee Collector: ${feeCollector}`);
    
    // Test fee application with detailed logging
    console.log("\nTesting fee application...");
    const testAddress = "0xB15a4A995050b5DdE912c1a948fF49b2a2E7d615";
    const transferAmount = ethers.parseEther("10");
    
    console.log(`Transfer Amount: ${ethers.formatEther(transferAmount)} ${symbol}`);
    console.log(`Expected Fee: ${ethers.formatEther(transferAmount * fee / 10000n)} ${symbol}`);
    console.log(`Expected Received: ${ethers.formatEther(transferAmount - (transferAmount * fee / 10000n))} ${symbol}`);
    
    const balanceBefore = await token.balanceOf(testAddress);
    console.log(`Recipient Balance Before: ${ethers.formatEther(balanceBefore)} ${symbol}`);
    
    try {
      const tx = await token.transfer(testAddress, transferAmount);
      const receipt = await tx.wait();
      
      console.log(`Transfer TX: ${tx.hash}`);
      console.log(`Gas Used: ${receipt?.gasUsed.toString()}`);
      
      const balanceAfter = await token.balanceOf(testAddress);
      console.log(`Recipient Balance After: ${ethers.formatEther(balanceAfter)} ${symbol}`);
      
      const received = balanceAfter - balanceBefore;
      const expectedFee = transferAmount * fee / 10000n;
      const expectedReceived = transferAmount - expectedFee;
      
      console.log(`Actually Received: ${ethers.formatEther(received)} ${symbol}`);
      console.log(`Expected Received: ${ethers.formatEther(expectedReceived)} ${symbol}`);
      console.log(`Fee Applied Correctly: ${received === expectedReceived ? "✅ YES" : "❌ NO"}`);
      
      if (received !== expectedReceived) {
        console.log("🚨 FEE CALCULATION ISSUE DETECTED!");
        console.log(`  Expected: ${ethers.formatEther(expectedReceived)}`);
        console.log(`  Actual: ${ethers.formatEther(received)}`);
        console.log(`  Difference: ${ethers.formatEther(expectedReceived - received)}`);
      }
      
    } catch (error) {
      console.error("❌ Transfer failed:", error);
    }
    
    // ANALYSIS 3: Pause System Issues
    console.log("\n🔍 ANALYSIS 3: Pause System");
    console.log("========================");
    
    try {
      const isPausedBefore = await token.paused();
      console.log(`Is Paused (Before): ${isPausedBefore}`);
      
      const PAUSER_ROLE = await token.PAUSER_ROLE();
      const hasPauserRole = await token.hasRole(PAUSER_ROLE, deployer.address);
      console.log(`Has PAUSER_ROLE: ${hasPauserRole}`);
      
      if (hasPauserRole) {
        console.log("Attempting to pause...");
        const pauseTx = await token.pause();
        const pauseReceipt = await pauseTx.wait();
        console.log(`Pause TX: ${pauseTx.hash}`);
        
        const isPausedAfter = await token.paused();
        console.log(`Is Paused (After): ${isPausedAfter}`);
        console.log(`Pause Success: ${isPausedAfter ? "✅ YES" : "❌ NO"}`);
        
        if (isPausedAfter) {
          console.log("Attempting to unpause...");
          const unpauseTx = await token.unpause();
          const unpauseReceipt = await unpauseTx.wait();
          console.log(`Unpause TX: ${unpauseTx.hash}`);
          
          const isUnpaused = !(await token.paused());
          console.log(`Is Unpaused: ${isUnpaused ? "✅ YES" : "❌ NO"}`);
        }
      } else {
        console.log("❌ Cannot test pause - no PAUSER_ROLE");
      }
      
    } catch (error) {
      console.error("❌ Pause test failed:", error);
    }
    
    // ANALYSIS 4: Block/Freeze System Issues
    console.log("\n🔍 ANALYSIS 4: Block/Freeze System");
    console.log("===============================");
    
    try {
      const testBlockAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
      
      const BLOCKER_ROLE = await token.BLOCKER_ROLE();
      const hasBlockerRole = await token.hasRole(BLOCKER_ROLE, deployer.address);
      console.log(`Has BLOCKER_ROLE: ${hasBlockerRole}`);
      
      const FREEZER_ROLE = await token.FREEZER_ROLE();
      const hasFreezerRole = await token.hasRole(FREEZER_ROLE, deployer.address);
      console.log(`Has FREEZER_ROLE: ${hasFreezerRole}`);
      
      if (hasBlockerRole) {
        console.log("Testing block function...");
        await token.block(testBlockAddress);
        const isBlocked = await token.isBlocked(testBlockAddress);
        console.log(`Block Success: ${isBlocked ? "✅ YES" : "❌ NO"}`);
        
        if (isBlocked) {
          await token.unblock(testBlockAddress);
          const isUnblocked = !(await token.isBlocked(testBlockAddress));
          console.log(`Unblock Success: ${isUnblocked ? "✅ YES" : "❌ NO"}`);
        }
      }
      
      if (hasFreezerRole) {
        console.log("Testing freeze function...");
        await token.freeze(testBlockAddress);
        const isFrozen = await token.isFrozen(testBlockAddress);
        console.log(`Freeze Success: ${isFrozen ? "✅ YES" : "❌ NO"}`);
        
        if (isFrozen) {
          await token.unfreeze(testBlockAddress);
          const isUnfrozen = !(await token.isFrozen(testBlockAddress));
          console.log(`Unfreeze Success: ${isUnfrozen ? "✅ YES" : "❌ NO"}`);
        }
      }
      
    } catch (error) {
      console.error("❌ Block/Freeze test failed:", error);
    }
    
    // ANALYSIS 5: Mint/Burn System Issues
    console.log("\n🔍 ANALYSIS 5: Mint/Burn System");
    console.log("============================");
    
    try {
      const MINTER_ROLE = await token.MINTER_ROLE();
      const hasMinterRole = await token.hasRole(MINTER_ROLE, deployer.address);
      console.log(`Has MINTER_ROLE: ${hasMinterRole}`);
      
      const BURNER_ROLE = await token.BURNER_ROLE();
      const hasBurnerRole = await token.hasRole(BURNER_ROLE, deployer.address);
      console.log(`Has BURNER_ROLE: ${hasBurnerRole}`);
      
      if (hasMinterRole) {
        console.log("Testing mint function...");
        const mintAmount = ethers.parseEther("5");
        const mintRecipient = "0x35744Db4a90e39648C45921dd039168EeAa2B5cf";
        
        const supplyBefore = await token.totalSupply();
        await token.mint(mintRecipient, mintAmount);
        const supplyAfter = await token.totalSupply();
        
        const supplyChange = supplyAfter - supplyBefore;
        console.log(`Mint Success: ${supplyChange === mintAmount ? "✅ YES" : "❌ NO"}`);
        console.log(`Expected: ${ethers.formatEther(mintAmount)}, Actual: ${ethers.formatEther(supplyChange)}`);
      }
      
      if (hasBurnerRole) {
        console.log("Testing burn function...");
        const burnAmount = ethers.parseEther("3");
        
        const deployerBalanceBefore = await token.balanceOf(deployer.address);
        await token.burn(deployer.address, burnAmount);
        const deployerBalanceAfter = await token.balanceOf(deployer.address);
        
        const balanceChange = deployerBalanceBefore - deployerBalanceAfter;
        console.log(`Burn Success: ${balanceChange === burnAmount ? "✅ YES" : "❌ NO"}`);
        console.log(`Expected: ${ethers.formatEther(burnAmount)}, Actual: ${ethers.formatEther(balanceChange)}`);
      }
      
    } catch (error) {
      console.error("❌ Mint/Burn test failed:", error);
    }
    
    console.log("\n🎯 ANALYSIS COMPLETE!");
    console.log("Review the results above to identify contract code issues.");
    
  } catch (error) {
    console.error("❌ Analysis failed:", error);
  }
}

main().catch(console.error);
