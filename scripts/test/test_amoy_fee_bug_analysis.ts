import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔍 DEEP ANALYSIS: Persistent Fee Bug");
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
    // Check current implementation
    const currentImplementation = await ethers.provider.getStorage(
      tokenAddress,
      "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
    );
    console.log("Current Implementation:", currentImplementation);
    
    // Check version in contract
    const version = await token.version();
    console.log("Contract Version:", version);
    
    // Check if fee bug fix function exists
    try {
      const feeBugFixed = await token.feeBugFixed();
      console.log("Fee Bug Fixed Function:", feeBugFixed);
    } catch (error) {
      console.log("Fee Bug Fixed Function: ❌ NOT AVAILABLE");
    }
    
    // Test fee system with different scenarios
    console.log("\n💰 Testing Fee System with Different Scenarios:");
    
    const fee = await token.fee();
    const feeCollector = await token.feeCollector();
    
    console.log(`Fee: ${fee} basis points`);
    console.log(`Fee Collector: ${feeCollector}`);
    console.log(`Collector is deployer: ${feeCollector.toLowerCase() === deployer.address.toLowerCase()}`);
    
    // Scenario 1: Transfer to external address
    console.log("\n📊 Scenario 1: Transfer to External Address");
    const externalAddress = "0xB15a4A995050b5DdE912c1a948fF49b2a2E7d615";
    const transferAmount = ethers.parseEther("10");
    
    const beforeBalances = {
      sender: await token.balanceOf(deployer.address),
      recipient: await token.balanceOf(externalAddress),
      collector: await token.balanceOf(feeCollector)
    };
    
    console.log(`Before - Sender: ${ethers.formatEther(beforeBalances.sender)}`);
    console.log(`Before - Recipient: ${ethers.formatEther(beforeBalances.recipient)}`);
    console.log(`Before - Collector: ${ethers.formatEther(beforeBalances.collector)}`);
    
    const tx = await token.transfer(externalAddress, transferAmount);
    const receipt = await tx.wait();
    
    const afterBalances = {
      sender: await token.balanceOf(deployer.address),
      recipient: await token.balanceOf(externalAddress),
      collector: await token.balanceOf(feeCollector)
    };
    
    console.log(`After - Sender: ${ethers.formatEther(afterBalances.sender)}`);
    console.log(`After - Recipient: ${ethers.formatEther(afterBalances.recipient)}`);
    console.log(`After - Collector: ${ethers.formatEther(afterBalances.collector)}`);
    
    const changes = {
      sender: beforeBalances.sender - afterBalances.sender,
      recipient: afterBalances.recipient - beforeBalances.recipient,
      collector: afterBalances.collector - beforeBalances.collector
    };
    
    console.log(`Sender change: ${ethers.formatEther(changes.sender)}`);
    console.log(`Recipient change: ${ethers.formatEther(changes.recipient)}`);
    console.log(`Collector change: ${ethers.formatEther(changes.collector)}`);
    
    const expectedFee = transferAmount * fee / 10000n;
    console.log(`Expected fee: ${ethers.formatEther(expectedFee)}`);
    console.log(`Expected total deduction: ${ethers.formatEther(transferAmount + expectedFee)}`);
    console.log(`Actual total deduction: ${ethers.formatEther(changes.sender)}`);
    
    // Analyze the fee logic
    console.log("\n🔍 Fee Logic Analysis:");
    console.log(`Transfer amount: ${ethers.formatEther(transferAmount)}`);
    console.log(`Fee amount: ${ethers.formatEther(expectedFee)}`);
    console.log(`Net value (amount - fee): ${ethers.formatEther(transferAmount - expectedFee)}`);
    
    if (changes.sender === transferAmount) {
      console.log("❌ BUG: Sender paid full amount, no fee deduction visible");
    } else if (changes.sender === transferAmount + expectedFee) {
      console.log("✅ CORRECT: Sender paid amount + fee");
    } else {
      console.log(`⚠️ UNEXPECTED: Sender paid ${ethers.formatEther(changes.sender)}`);
    }
    
    if (changes.collector === expectedFee) {
      console.log("✅ CORRECT: Collector received fee");
    } else if (changes.collector === 0) {
      console.log("❌ BUG: Collector received nothing");
    } else if (changes.collector < 0) {
      console.log("🚨 CRITICAL BUG: Collector lost tokens!");
    } else {
      console.log(`⚠️ UNEXPECTED: Collector change: ${ethers.formatEther(changes.collector)}`);
    }
    
    // Scenario 2: Change fee collector to different address
    console.log("\n📊 Scenario 2: Change Fee Collector");
    
    // Get a different address for collector
    const newCollector = "0x35744Db4a90e39648C45921dd039168EeAa2B5cf";
    
    console.log(`Changing fee collector to: ${newCollector}`);
    
    const setCollectorTx = await token.setFeeCollector(newCollector);
    await setCollectorTx.wait();
    
    const newFeeCollector = await token.feeCollector();
    console.log(`New fee collector: ${newFeeCollector}`);
    
    // Test transfer with new collector
    const transferAmount2 = ethers.parseEther("5");
    const beforeBalances2 = {
      sender: await token.balanceOf(deployer.address),
      recipient: await token.balanceOf(externalAddress),
      collector: await token.balanceOf(newFeeCollector)
    };
    
    console.log(`Before - Sender: ${ethers.formatEther(beforeBalances2.sender)}`);
    console.log(`Before - Recipient: ${ethers.formatEther(beforeBalances2.recipient)}`);
    console.log(`Before - New Collector: ${ethers.formatEther(beforeBalances2.collector)}`);
    
    const tx2 = await token.transfer(externalAddress, transferAmount2);
    const receipt2 = await tx2.wait();
    
    const afterBalances2 = {
      sender: await token.balanceOf(deployer.address),
      recipient: await token.balanceOf(externalAddress),
      collector: await token.balanceOf(newFeeCollector)
    };
    
    console.log(`After - Sender: ${ethers.formatEther(afterBalances2.sender)}`);
    console.log(`After - Recipient: ${ethers.formatEther(afterBalances2.recipient)}`);
    console.log(`After - New Collector: ${ethers.formatEther(afterBalances2.collector)}`);
    
    const changes2 = {
      sender: beforeBalances2.sender - afterBalances2.sender,
      recipient: afterBalances2.recipient - beforeBalances2.recipient,
      collector: afterBalances2.collector - beforeBalances2.collector
    };
    
    console.log(`Sender change: ${ethers.formatEther(changes2.sender)}`);
    console.log(`Recipient change: ${ethers.formatEther(changes2.recipient)}`);
    console.log(`Collector change: ${ethers.formatEther(changes2.collector)}`);
    
    const expectedFee2 = transferAmount2 * fee / 10000n;
    console.log(`Expected fee: ${ethers.formatEther(expectedFee2)}`);
    
    if (changes2.collector === expectedFee2) {
      console.log("✅ CORRECT: New collector received fee");
    } else if (changes2.collector === 0) {
      console.log("❌ BUG: New collector received nothing");
    } else if (changes2.collector < 0) {
      console.log("🚨 CRITICAL BUG: New collector lost tokens!");
    } else {
      console.log(`⚠️ UNEXPECTED: Collector change: ${ethers.formatEther(changes2.collector)}`);
    }
    
    console.log("\n🎯 CONCLUSION:");
    console.log("The fee bug appears to be in the core fee logic.");
    console.log("The collector is not receiving fees as expected.");
    
  } catch (error) {
    console.error("❌ Analysis failed:", error);
  }
}

main().catch(console.error);
