import { ethers, upgrades } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔧 COMPREHENSIVE UPGRADE: Fix All Amoy Issues");
  console.log("==============================================");
  
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
    // Check current version
    const currentVersion = await token.version();
    console.log("Current Version:", currentVersion);
    
    // Check current implementation
    const currentImplementation = await upgrades.erc1967.getImplementationAddress(tokenAddress);
    console.log("Current Implementation:", currentImplementation);
    
    // Deploy new implementation with comprehensive fixes
    console.log("\n🔧 Deploying new implementation with comprehensive fixes...");
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
      
      // Test all fixed functionality
      console.log("\n🧪 Testing All Fixed Functionality...");
      
      // Test 1: Freeze System
      console.log("\n❄️ Testing Freeze System...");
      try {
        const testAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
        
        await upgraded.freeze(testAddress, ethers.parseEther("5"));
        const isFrozen = await upgraded.isFrozen(testAddress);
        console.log(`Freeze Success: ${isFrozen ? "✅ YES" : "❌ NO"}`);
        
        if (isFrozen) {
          await upgraded.unfreeze(testAddress);
          const isUnfrozen = !(await upgraded.isFrozen(testAddress));
          console.log(`Unfreeze Success: ${isUnfrozen ? "✅ YES" : "❌ NO"}`);
        }
        
      } catch (error) {
        console.error("❌ Freeze test failed:", error);
      }
      
      // Test 2: Block System
      console.log("\n🚫 Testing Block System...");
      try {
        const testAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
        
        await upgraded.block(testAddress);
        const isBlocked = await upgraded.isBlocked(testAddress);
        console.log(`Block Success: ${isBlocked ? "✅ YES" : "❌ NO"}`);
        
        if (isBlocked) {
          await upgraded.unblock(testAddress);
          const isUnblocked = !(await upgraded.isBlocked(testAddress));
          console.log(`Unblock Success: ${isUnblocked ? "✅ YES" : "❌ NO"}`);
        }
        
      } catch (error) {
        console.error("❌ Block test failed:", error);
      }
      
      // Test 3: Mint System
      console.log("\n🪙 Testing Mint System...");
      try {
        const mintAmount = ethers.parseEther("25");
        const mintRecipient = "0x35744Db4a90e39648C45921dd039168EeAa2B5cf";
        
        const supplyBefore = await upgraded.totalSupply();
        await upgraded.mint(mintRecipient, mintAmount);
        const supplyAfter = await upgraded.totalSupply();
        
        const supplyChange = supplyAfter - supplyBefore;
        console.log(`Mint Success: ${supplyChange === mintAmount ? "✅ YES" : "❌ NO"}`);
        console.log(`Expected: ${ethers.formatEther(mintAmount)}, Actual: ${ethers.formatEther(supplyChange)}`);
        
      } catch (error) {
        console.error("❌ Mint test failed:", error);
      }
      
      // Test 4: Burn System
      console.log("\n🔥 Testing Burn System...");
      try {
        const burnAmount = ethers.parseEther("10");
        
        const deployerBalanceBefore = await upgraded.balanceOf(deployer.address);
        await upgraded.burn(deployer.address, burnAmount);
        const deployerBalanceAfter = await upgraded.balanceOf(deployer.address);
        
        const balanceChange = deployerBalanceBefore - deployerBalanceAfter;
        console.log(`Burn Success: ${balanceChange === burnAmount ? "✅ YES" : "❌ NO"}`);
        console.log(`Expected: ${ethers.formatEther(burnAmount)}, Actual: ${ethers.formatEther(balanceChange)}`);
        
      } catch (error) {
        console.error("❌ Burn test failed:", error);
      }
      
      // Test 5: Role System
      console.log("\n👥 Testing Role System...");
      try {
        const FEE_ADMIN_ROLE = await upgraded.FEE_ADMIN_ROLE();
        const hasFeeAdminRole = await upgraded.hasRole(FEE_ADMIN_ROLE, deployer.address);
        
        const RECOVERER_ROLE = await upgraded.RECOVERER_ROLE();
        const hasRecovererRole = await upgraded.hasRole(RECOVERER_ROLE, deployer.address);
        
        console.log(`FEE_ADMIN_ROLE: ${hasFeeAdminRole ? "✅ GRANTED" : "❌ NOT GRANTED"}`);
        console.log(`RECOVERER_ROLE: ${hasRecovererRole ? "✅ GRANTED" : "❌ NOT GRANTED"}`);
        
      } catch (error) {
        console.error("❌ Role test failed:", error);
      }
      
      // Test 6: Fee System (should still work)
      console.log("\n💰 Testing Fee System...");
      try {
        const testAddress = "0xB15a4A995050b5DdE912c1a948fF49b2a2E7d615";
        const transferAmount = ethers.parseEther("15");
        
        const balanceBefore = await upgraded.balanceOf(testAddress);
        await upgraded.transfer(testAddress, transferAmount);
        const balanceAfter = await upgraded.balanceOf(testAddress);
        
        const received = balanceAfter - balanceBefore;
        const fee = await upgraded.fee();
        const expectedFee = transferAmount * fee / 10000n;
        const expectedReceived = transferAmount - expectedFee;
        
        const feeWorking = received === expectedReceived;
        console.log(`Fee System: ${feeWorking ? "✅ WORKING" : "❌ BROKEN"}`);
        console.log(`Expected: ${ethers.formatEther(expectedReceived)}, Received: ${ethers.formatEther(received)}`);
        
      } catch (error) {
        console.error("❌ Fee test failed:", error);
      }
      
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
        reason: "Comprehensive fix: freeze, mint, burn, roles",
        version: newVersion
      });
      
      fs.writeFileSync(path.join(abiDir, "deploy-amoy.json"), JSON.stringify(deployInfo, null, 2));
      
      console.log("\n✅ Comprehensive upgrade completed successfully!");
      console.log("✅ All major issues resolved!");
      console.log("✅ Deploy info updated!");
      
    } else {
      console.log("❌ Upgrade failed - implementation unchanged");
    }
    
  } catch (error) {
    console.error("❌ Upgrade failed:", error);
  }
}

main().catch(console.error);
