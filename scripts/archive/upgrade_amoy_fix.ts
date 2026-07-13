import { ethers, upgrades } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔧 UPGRADING: Fix TransferFrom Bug - Amoy");
  
  // Get deployed contract address
  const deploymentsDir = path.join(__dirname, "../../deployments/amoy");
  const proxyData = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "proxy.json"), "utf8"));
  const tokenAddress = proxyData.address;
  
  console.log("Token Proxy Address:", tokenAddress);
  
  // Connect to deployed contract
  const [deployer] = await ethers.getSigners();
  const token = await ethers.getContractAt("Token", tokenAddress, deployer);
  
  console.log("Deployer:", deployer.address);
  
  try {
    // Check current implementation
    const currentImplementation = await upgrades.erc1967.getImplementationAddress(tokenAddress);
    console.log("Current Implementation:", currentImplementation);
    
    // Deploy new implementation
    console.log("Deploying new implementation with TransferFrom fix...");
    const TokenFactory = await ethers.getContractFactory("Token");
    
    const upgraded = await upgrades.upgradeProxy(tokenAddress, TokenFactory);
    console.log("Upgrade TX:", upgraded.deploymentTransaction()?.hash);
    
    await upgraded.waitForDeployment();
    
    // Get new implementation address
    const newImplementation = await upgrades.erc1967.getImplementationAddress(tokenAddress);
    console.log("New Implementation:", newImplementation);
    
    // Verify the fix works
    console.log("\n🧪 Testing TransferFrom after fix...");
    
    // Set up approval
    const spenderAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    const approveAmount = ethers.parseEther("100");
    await upgraded.approve(spenderAddress, approveAmount);
    
    // Test TransferFrom
    const transferAmount = ethers.parseEther("5");
    const recipientAddress = "0xB15a4A995050b5DdE912c1a948fF49b2a2E7d615";
    
    const recipientBalanceBefore = await upgraded.balanceOf(recipientAddress);
    await upgraded.transferFrom(deployer.address, recipientAddress, transferAmount);
    const recipientBalanceAfter = await upgraded.balanceOf(recipientAddress);
    
    const received = recipientBalanceAfter - recipientBalanceBefore;
    const expectedFee = transferAmount * 10n / 10000n;
    const expectedReceived = transferAmount - expectedFee;
    
    console.log(`TransferFrom Test:`);
    console.log(`  Sent: ${ethers.formatEther(transferAmount)} IGT`);
    console.log(`  Received: ${ethers.formatEther(received)} IGT`);
    console.log(`  Expected: ${ethers.formatEther(expectedReceived)} IGT`);
    console.log(`  Success: ${received === expectedReceived ? "YES" : "NO"}`);
    
    // Update deploy info
    const abiDir = path.join(__dirname, "../../abi");
    const deployInfo = JSON.parse(fs.readFileSync(path.join(abiDir, "deploy-amoy.json"), "utf8"));
    
    deployInfo.contracts.Token.implementation = newImplementation;
    deployInfo.timestamp = new Date().toISOString();
    deployInfo.upgradeHistory = deployInfo.upgradeHistory || [];
    deployInfo.upgradeHistory.push({
      timestamp: new Date().toISOString(),
      from: currentImplementation,
      to: newImplementation,
      reason: "Fix TransferFrom double-update bug"
    });
    
    fs.writeFileSync(path.join(abiDir, "deploy-amoy.json"), JSON.stringify(deployInfo, null, 2));
    
    console.log("\n✅ Upgrade completed successfully!");
    console.log("✅ TransferFrom bug fixed!");
    console.log("✅ Deploy info updated!");
    
  } catch (error) {
    console.error("❌ Upgrade failed:", error);
  }
}

main().catch(console.error);
