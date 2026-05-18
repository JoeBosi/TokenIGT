import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔍 DEBUG: Freeze / Block / Pause");
  console.log("=================================");
  
  // Get deployment info
  const deploymentsDir = path.join(__dirname, "../../deployments/amoy-fresh");
  const proxyData = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "proxy.json"), "utf8"));
  const tokenAddress = proxyData.address;
  
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Token:", tokenAddress);
  
  const token = await ethers.getContractAt("Token", tokenAddress, deployer);
  
  // Check current roles
  console.log("\n📋 CHECKING ROLES");
  console.log("==================");
  
  const FREEZER_ROLE = await token.FREEZER_ROLE();
  const BLOCKER_ROLE = await token.BLOCKER_ROLE();
  const PAUSER_ROLE = await token.PAUSER_ROLE();
  
  console.log("FREEZER_ROLE hash:", FREEZER_ROLE);
  console.log("BLOCKER_ROLE hash:", BLOCKER_ROLE);
  console.log("PAUSER_ROLE hash:", PAUSER_ROLE);
  
  const hasFreezer = await token.hasRole(FREEZER_ROLE, deployer.address);
  const hasBlocker = await token.hasRole(BLOCKER_ROLE, deployer.address);
  const hasPauser = await token.hasRole(PAUSER_ROLE, deployer.address);
  
  console.log("\nDeployer has FREEZER_ROLE:", hasFreezer);
  console.log("Deployer has BLOCKER_ROLE:", hasBlocker);
  console.log("Deployer has PAUSER_ROLE:", hasPauser);
  
  // Grant missing roles
  console.log("\n🔧 GRANTING MISSING ROLES");
  console.log("==========================");
  
  if (!hasFreezer) {
    console.log("Granting FREEZER_ROLE...");
    const tx = await token.grantRole(FREEZER_ROLE, deployer.address);
    await tx.wait();
    console.log("✅ FREEZER_ROLE granted");
  }
  
  if (!hasBlocker) {
    console.log("Granting BLOCKER_ROLE...");
    const tx = await token.grantRole(BLOCKER_ROLE, deployer.address);
    await tx.wait();
    console.log("✅ BLOCKER_ROLE granted");
  }
  
  if (!hasPauser) {
    console.log("Granting PAUSER_ROLE...");
    const tx = await token.grantRole(PAUSER_ROLE, deployer.address);
    await tx.wait();
    console.log("✅ PAUSER_ROLE granted");
  }
  
  // Test FREEZE
  console.log("\n❄️ TESTING FREEZE");
  console.log("==================");
  const testAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  
  try {
    // Check if already frozen
    const frozenBefore = await token.frozenBalanceOf(testAddress);
    console.log("Frozen balance before:", ethers.formatEther(frozenBefore));
    
    // Try freeze with amount (override function)
    console.log("Calling freeze(address,uint256)...");
    const freezeTx = await token["freeze(address,uint256)"](testAddress, ethers.parseEther("5"));
    const freezeReceipt = await freezeTx.wait();
    console.log("✅ Freeze transaction mined! Gas:", freezeReceipt?.gasUsed.toString());
    
    // Check frozen
    const frozenAfter = await token.frozenBalanceOf(testAddress);
    console.log("Frozen balance after:", ethers.formatEther(frozenAfter));
    console.log("Is frozen:", frozenAfter > 0n ? "✅ YES" : "❌ NO");
    
    // Try unfreeze
    console.log("\nCalling unfreeze...");
    const unfreezeTx = await token.unfreeze(testAddress);
    await unfreezeTx.wait();
    console.log("✅ Unfreeze successful");
    
  } catch (error: any) {
    console.error("❌ Freeze test failed:", error.message);
    if (error.data) {
      console.error("Error data:", error.data);
    }
  }
  
  // Test BLOCK
  console.log("\n🚫 TESTING BLOCK");
  console.log("==================");
  const blockAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  
  try {
    // Check if already blocked
    const blockedBefore = await token.isBlocked(blockAddress);
    console.log("Blocked before:", blockedBefore);
    
    // Try block
    console.log("Calling blockAddress...");
    const blockTx = await token.blockAddress(blockAddress);
    const blockReceipt = await blockTx.wait();
    console.log("✅ Block transaction mined! Gas:", blockReceipt?.gasUsed.toString());
    
    // Parse Blocked event
    const blockEvents = blockReceipt?.logs.filter((log: any) => {
      try {
        return token.interface.parseLog(log)?.name === "Blocked";
      } catch { return false; }
    });
    console.log("Blocked events found:", blockEvents?.length || 0);
    
    // Check blocked
    const blockedAfter = await token.isBlocked(blockAddress);
    console.log("Blocked after:", blockedAfter ? "✅ YES" : "❌ NO");
    
    // Try unblock
    console.log("\nCalling unblock...");
    const unblockTx = await token.unblock(blockAddress);
    await unblockTx.wait();
    console.log("✅ Unblock successful");
    
  } catch (error: any) {
    console.error("❌ Block test failed:", error.message);
    if (error.data) {
      console.error("Error data:", error.data);
    }
  }
  
  // Test PAUSE
  console.log("\n⏸️ TESTING PAUSE");
  console.log("==================");
  
  try {
    // Check current pause state
    const pausedBefore = await token.paused();
    console.log("Paused before:", pausedBefore);
    
    if (!pausedBefore) {
      console.log("Calling pause...");
      const pauseTx = await token.pause();
      const pauseReceipt = await pauseTx.wait();
      console.log("✅ Pause transaction mined! Gas:", pauseReceipt?.gasUsed.toString());
      
      // Check paused
      const pausedAfter = await token.paused();
      console.log("Paused after:", pausedAfter ? "✅ YES" : "❌ NO");
    }
    
    // Try unpause
    console.log("\nCalling unpause...");
    const unpauseTx = await token.unpause();
    await unpauseTx.wait();
    console.log("✅ Unpause successful");
    
    const pausedFinal = await token.paused();
    console.log("Paused final:", pausedFinal ? "❌ STILL PAUSED" : "✅ UNPAUSED");
    
  } catch (error: any) {
    console.error("❌ Pause test failed:", error.message);
    if (error.data) {
      console.error("Error data:", error.data);
    }
  }
  
  console.log("\n🎯 DEBUG COMPLETE!");
}

main().catch(console.error);
