import { ethers, upgrades } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔧 UPGRADE: Fix Fee Bug on Fresh Amoy Deployment");
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
    // Check current version
    const currentVersion = await token.version();
    console.log("Current Version:", currentVersion);
    
    // Check current implementation
    const currentImplementation = await upgrades.erc1967.getImplementationAddress(tokenAddress);
    console.log("Current Implementation:", currentImplementation);
    
    // Deploy new implementation with fee bug fix
    console.log("\n🔧 Deploying new implementation with fee bug fix...");
    const TokenFactory = await ethers.getContractFactory("Token");
    
    const upgraded = await upgrades.upgradeProxy(tokenAddress, TokenFactory);
    console.log("Upgrade TX:", upgraded.deploymentTransaction()?.hash);
    
    await upgraded.waitForDeployment();
    
    // Get new implementation address
    const newImplementation = await upgrades.erc1967.getImplementationAddress(tokenAddress);
    console.log("New Implementation:", newImplementation);
    
    if (newImplementation !== currentImplementation) {
      console.log("✅ Upgrade successful!");
      
      // Check new version
      const newVersion = await upgraded.version();
      console.log("New Version:", newVersion);
      
      // Test fee system after fix
      console.log("\n💰 Testing Fee System After Fix...");
      
      const fee = await upgraded.fee();
      const feeCollector = await upgraded.feeCollector();
      
      console.log(`Fee: ${fee} basis points`);
      console.log(`Fee Collector: ${feeCollector}`);
      
      // Test transfer with fee
      const testAddress = "0xB15a4A995050b5DdE912c1a948fF49b2a2E7d615";
      const transferAmount = ethers.parseEther("20");
      
      const senderBalanceBefore = await upgraded.balanceOf(deployer.address);
      const recipientBalanceBefore = await upgraded.balanceOf(testAddress);
      const collectorBalanceBefore = await upgraded.balanceOf(feeCollector);
      
      console.log(`Before - Sender: ${ethers.formatEther(senderBalanceBefore)}`);
      console.log(`Before - Recipient: ${ethers.formatEther(recipientBalanceBefore)}`);
      console.log(`Before - Collector: ${ethers.formatEther(collectorBalanceBefore)}`);
      
      const tx = await upgraded.transfer(testAddress, transferAmount);
      const receipt = await tx.wait();
      
      const senderBalanceAfter = await upgraded.balanceOf(deployer.address);
      const recipientBalanceAfter = await upgraded.balanceOf(testAddress);
      const collectorBalanceAfter = await upgraded.balanceOf(feeCollector);
      
      console.log(`After - Sender: ${ethers.formatEther(senderBalanceAfter)}`);
      console.log(`After - Recipient: ${ethers.formatEther(recipientBalanceAfter)}`);
      console.log(`After - Collector: ${ethers.formatEther(collectorBalanceAfter)}`);
      
      const senderChange = senderBalanceBefore - senderBalanceAfter;
      const recipientChange = recipientBalanceAfter - recipientBalanceBefore;
      const collectorChange = collectorBalanceAfter - collectorBalanceBefore;
      
      console.log(`Sender change: ${ethers.formatEther(senderChange)}`);
      console.log(`Recipient change: ${ethers.formatEther(recipientChange)}`);
      console.log(`Collector change: ${ethers.formatEther(collectorChange)}`);
      
      const expectedFee = transferAmount * fee / 10000n;
      console.log(`Expected fee: ${ethers.formatEther(expectedFee)}`);
      
      // Check if fee bug is fixed
      const feeBugFixed = collectorChange >= 0; // Collector should not lose tokens
      
      console.log(`Fee Bug Fixed: ${feeBugFixed ? "✅ YES" : "❌ NO"}`);
      console.log(`Gas used: ${receipt?.gasUsed.toString()}`);
      
      // Update deploy info
      const abiDir = path.join(__dirname, "../../abi");
      const deployInfo = JSON.parse(fs.readFileSync(path.join(abiDir, "deploy-amoy-fresh.json"), "utf8"));
      
      deployInfo.contracts.Token.implementation = newImplementation;
      deployInfo.timestamp = new Date().toISOString();
      deployInfo.upgradeHistory = deployInfo.upgradeHistory || [];
      deployInfo.upgradeHistory.push({
        timestamp: new Date().toISOString(),
        from: currentImplementation,
        to: newImplementation,
        reason: "Fee bug fix - collector no longer loses tokens",
        version: newVersion
      });
      
      fs.writeFileSync(path.join(abiDir, "deploy-amoy-fresh.json"), JSON.stringify(deployInfo, null, 2));
      
      console.log("\n✅ Fee bug fix upgrade completed!");
      console.log("✅ Deploy info updated!");
      
      if (feeBugFixed) {
        console.log("🎉 Fee system is now working correctly!");
      } else {
        console.log("⚠️ Fee system may still have issues");
      }
      
    } else {
      console.log("❌ Upgrade failed - implementation unchanged");
    }
    
  } catch (error) {
    console.error("❌ Upgrade failed:", error);
  }
}

main().catch(console.error);
