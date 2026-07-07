import { ethers, upgrades } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔍 CHECK: Upgrade Status - Amoy");
  
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
    
    // Check deployer roles
    const UPGRADER_ROLE = await token.UPGRADER_ROLE();
    const hasUpgraderRole = await token.hasRole(UPGRADER_ROLE, deployer.address);
    console.log("Has UPGRADER_ROLE:", hasUpgraderRole);
    
    if (!hasUpgraderRole) {
      console.log("❌ Deployer does not have UPGRADER_ROLE - granting it...");
      await token.grantRole(UPGRADER_ROLE, deployer.address);
      console.log("✅ UPGRADER_ROLE granted");
    }
    
    // Try upgrade again
    console.log("\n🔧 Attempting upgrade again...");
    const TokenFactory = await ethers.getContractFactory("Token");
    
    const upgraded = await upgrades.upgradeProxy(tokenAddress, TokenFactory);
    console.log("Upgrade completed");
    
    await upgraded.waitForDeployment();
    
    const newImplementation = await upgrades.erc1967.getImplementationAddress(tokenAddress);
    console.log("New Implementation:", newImplementation);
    
    if (newImplementation !== currentImplementation) {
      console.log("✅ Upgrade successful!");
      
      // Test TransferFrom
      console.log("\n🧪 Testing TransferFrom after upgrade...");
      
      const spenderAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
      const approveAmount = ethers.parseEther("100");
      await upgraded.approve(spenderAddress, approveAmount);
      
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
      
    } else {
      console.log("❌ Upgrade failed - implementation unchanged");
    }
    
  } catch (error) {
    console.error("❌ Check failed:", error);
  }
}

main().catch(console.error);
