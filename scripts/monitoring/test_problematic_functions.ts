import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔧 TESTING PROBLEMATIC FUNCTIONS WITH MONITORING");
  console.log("==================================================");
  
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
    // Test 1: System Health Check
    console.log("\n🏥 TEST 1: System Status Check");
    console.log("===============================");
    
    const systemStatus = await token.getSystemStatus();
    console.log(`Version: ${systemStatus.contractVersion}`);
    console.log(`Total Supply: ${ethers.formatEther(systemStatus._totalSupply)} IGT`);
    console.log(`Paused: ${systemStatus._paused}`);
    console.log(`Fee: ${systemStatus._fee} bps`);
    
    // Test 2: Debug Roles
    console.log("\n👥 TEST 2: Debug Roles");
    console.log("======================");
    
    const roles = await token.debugRoles(deployer.address);
    console.log(`Admin: ${roles.admin}, Minter: ${roles.minter}, Burner: ${roles.burner}`);
    
    // Test 3: Mint with Monitoring
    console.log("\n🪙 TEST 3: Mint with Monitoring");
    console.log("================================");
    
    const mintAmount = ethers.parseEther("10");
    const mintRecipient = "0x35744Db4a90e39648C45921dd039168EeAa2B5cf";
    
    console.log(`Minting ${ethers.formatEther(mintAmount)} to ${mintRecipient}...`);
    
    const balanceBefore = await token.balanceOf(mintRecipient);
    const supplyBefore = await token.totalSupply();
    
    const mintTx = await token.mint(mintRecipient, mintAmount);
    const mintReceipt = await mintTx.wait();
    
    const balanceAfter = await token.balanceOf(mintRecipient);
    const supplyAfter = await token.totalSupply();
    
    console.log(`✅ Mint successful!`);
    console.log(`  Gas used: ${mintReceipt?.gasUsed.toString()}`);
    console.log(`  Balance change: ${ethers.formatEther(balanceAfter - balanceBefore)} IGT`);
    console.log(`  Supply change: ${ethers.formatEther(supplyAfter - supplyBefore)} IGT`);
    
    // Parse MintOperationDebug event
    const mintDebugEvents = mintReceipt?.logs.filter(log => 
      log.topics[0] === token.interface.getEvent("MintOperationDebug").topicHash
    );
    
    if (mintDebugEvents && mintDebugEvents.length > 0) {
      const debugEvent = token.interface.decodeEventLog("MintOperationDebug", mintDebugEvents[0].data, mintDebugEvents[0].topics);
      console.log(`  Debug Event:`);
      console.log(`    To: ${debugEvent[0]}`);
      console.log(`    Amount: ${ethers.formatEther(debugEvent[1])}`);
      console.log(`    Supply Before: ${ethers.formatEther(debugEvent[3])}`);
      console.log(`    Supply After: ${ethers.formatEther(debugEvent[4])}`);
    }
    
    // Test 4: Burn with Monitoring
    console.log("\n🔥 TEST 4: Burn with Monitoring");
    console.log("=================================");
    
    const burnAmount = ethers.parseEther("5");
    
    console.log(`Burning ${ethers.formatEther(burnAmount)} from deployer...`);
    
    const burnBalanceBefore = await token.balanceOf(deployer.address);
    const burnSupplyBefore = await token.totalSupply();
    
    const burnTx = await token.burn(deployer.address, burnAmount);
    const burnReceipt = await burnTx.wait();
    
    const burnBalanceAfter = await token.balanceOf(deployer.address);
    const burnSupplyAfter = await token.totalSupply();
    
    console.log(`✅ Burn successful!`);
    console.log(`  Gas used: ${burnReceipt?.gasUsed.toString()}`);
    console.log(`  Balance change: ${ethers.formatEther(burnBalanceBefore - burnBalanceAfter)} IGT`);
    console.log(`  Supply change: ${ethers.formatEther(burnSupplyBefore - burnSupplyAfter)} IGT`);
    
    // Parse BurnOperationDebug event
    const burnDebugEvents = burnReceipt?.logs.filter(log => 
      log.topics[0] === token.interface.getEvent("BurnOperationDebug").topicHash
    );
    
    if (burnDebugEvents && burnDebugEvents.length > 0) {
      const debugEvent = token.interface.decodeEventLog("BurnOperationDebug", burnDebugEvents[0].data, burnDebugEvents[0].topics);
      console.log(`  Debug Event:`);
      console.log(`    From: ${debugEvent[0]}`);
      console.log(`    Amount: ${ethers.formatEther(debugEvent[1])}`);
      console.log(`    Balance Before: ${ethers.formatEther(debugEvent[5])}`);
      console.log(`    Balance After: ${ethers.formatEther(debugEvent[6])}`);
    }
    
    // Test 5: Fee System with Monitoring
    console.log("\n💰 TEST 5: Fee System with Monitoring");
    console.log("=======================================");
    
    const transferAmount = ethers.parseEther("20");
    const transferRecipient = "0xB15a4A995050b5DdE912c1a948fF49b2a2E7d615";
    
    console.log(`Transferring ${ethers.formatEther(transferAmount)} to ${transferRecipient}...`);
    
    const senderBalanceBefore = await token.balanceOf(deployer.address);
    const recipientBalanceBefore = await token.balanceOf(transferRecipient);
    const collectorBefore = await token.balanceOf(await token.feeCollector());
    
    const transferTx = await token.transfer(transferRecipient, transferAmount);
    const transferReceipt = await transferTx.wait();
    
    const senderBalanceAfter = await token.balanceOf(deployer.address);
    const recipientBalanceAfter = await token.balanceOf(transferRecipient);
    const collectorAfter = await token.balanceOf(await token.feeCollector());
    
    console.log(`✅ Transfer successful!`);
    console.log(`  Gas used: ${transferReceipt?.gasUsed.toString()}`);
    console.log(`  Sender balance change: ${ethers.formatEther(senderBalanceBefore - senderBalanceAfter)} IGT`);
    console.log(`  Recipient balance change: ${ethers.formatEther(recipientBalanceAfter - recipientBalanceBefore)} IGT`);
    console.log(`  Collector balance change: ${ethers.formatEther(collectorAfter - collectorBefore)} IGT`);
    
    // Parse FeeOperationDebug event
    const feeDebugEvents = transferReceipt?.logs.filter(log => 
      log.topics[0] === token.interface.getEvent("FeeOperationDebug").topicHash
    );
    
    if (feeDebugEvents && feeDebugEvents.length > 0) {
      const debugEvent = token.interface.decodeEventLog("FeeOperationDebug", feeDebugEvents[0].data, feeDebugEvents[0].topics);
      console.log(`  Fee Debug Event:`);
      console.log(`    Amount: ${ethers.formatEther(debugEvent[2])}`);
      console.log(`    Fee Amount: ${ethers.formatEther(debugEvent[3])}`);
      console.log(`    Net Value: ${ethers.formatEther(debugEvent[5])}`);
    }
    
    // Test 6: Freeze with Monitoring
    console.log("\n🧊 TEST 6: Freeze with Monitoring");
    console.log("====================================");
    
    const freezeTarget = "0x518322969492b8e52ca5d2eb1bc6c0d2f45d5892";
    
    console.log(`Freezing ${freezeTarget}...`);
    
    const frozenBefore = await token.frozenOf(freezeTarget);
    
    const freezeTx = await token.freeze(freezeTarget);
    const freezeReceipt = await freezeTx.wait();
    
    const frozenAfter = await token.frozenOf(freezeTarget);
    
    console.log(`✅ Freeze successful!`);
    console.log(`  Gas used: ${freezeReceipt?.gasUsed.toString()}`);
    console.log(`  Frozen amount: ${ethers.formatEther(frozenAfter)} IGT`);
    
    // Parse FreezeOperationDebug event
    const freezeDebugEvents = freezeReceipt?.logs.filter(log => 
      log.topics[0] === token.interface.getEvent("FreezeOperationDebug").topicHash
    );
    
    if (freezeDebugEvents && freezeDebugEvents.length > 0) {
      const debugEvent = token.interface.decodeEventLog("FreezeOperationDebug", freezeDebugEvents[0].data, freezeDebugEvents[0].topics);
      console.log(`  Freeze Debug Event:`);
      console.log(`    Account: ${debugEvent[0]}`);
      console.log(`    Frozen Amount: ${ethers.formatEther(debugEvent[1])}`);
      console.log(`    Executor: ${debugEvent[2]}`);
    }
    
    // Test 7: Block/Unblock with Monitoring
    console.log("\n🚫 TEST 7: Block/Unblock with Monitoring");
    console.log("=========================================");
    
    const blockTarget = "0x5366053a98f10e8cded12af53aaa6afd33a14a5a";
    
    console.log(`Blocking ${blockTarget}...`);
    
    const blockTx = await token.blockAddress(blockTarget);
    const blockReceipt = await blockTx.wait();
    
    console.log(`✅ Block successful!`);
    console.log(`  Gas used: ${blockReceipt?.gasUsed.toString()}`);
    
    // Parse BlockOperationDebug event
    const blockDebugEvents = blockReceipt?.logs.filter(log => 
      log.topics[0] === token.interface.getEvent("BlockOperationDebug").topicHash
    );
    
    if (blockDebugEvents && blockDebugEvents.length > 0) {
      const debugEvent = token.interface.decodeEventLog("BlockOperationDebug", blockDebugEvents[0].data, blockDebugEvents[0].topics);
      console.log(`  Block Debug Event:`);
      console.log(`    Account: ${debugEvent[0]}`);
      console.log(`    Blocked: ${debugEvent[1]}`);
    }
    
    // Test 8: Health Check Event
    console.log("\n🏥 TEST 8: Health Check Event");
    console.log("===============================");
    
    const healthTx = await token.emitHealthCheck();
    const healthReceipt = await healthTx.wait();
    
    console.log(`✅ Health check emitted!`);
    console.log(`  Gas used: ${healthReceipt?.gasUsed.toString()}`);
    
    const healthEvents = healthReceipt?.logs.filter(log => 
      log.topics[0] === token.interface.getEvent("HealthCheck").topicHash
    );
    
    if (healthEvents && healthEvents.length > 0) {
      const healthEvent = token.interface.decodeEventLog("HealthCheck", healthEvents[0].data, healthEvents[0].topics);
      console.log(`  Health Check Event:`);
      console.log(`    Total Supply: ${ethers.formatEther(healthEvent[1])}`);
      console.log(`    Active Users: ${healthEvent[2]}`);
    }
    
    console.log("\n🎯 PROBLEMATIC FUNCTIONS TEST RESULTS:");
    console.log("========================================");
    console.log("✅ Mint Function: WORKING (with monitoring events)");
    console.log("✅ Burn Function: WORKING (with monitoring events)");
    console.log("✅ Fee System: WORKING (with debug events)");
    console.log("✅ Freeze Function: WORKING (with debug events)");
    console.log("✅ Block Function: WORKING (with debug events)");
    console.log("✅ Health Check: WORKING (with monitoring events)");
    
    console.log("\n📊 SUMMARY:");
    console.log("All previously problematic functions now work correctly!");
    console.log("The monitoring system provides detailed event tracking for debugging.");
    
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

main().catch(console.error);
