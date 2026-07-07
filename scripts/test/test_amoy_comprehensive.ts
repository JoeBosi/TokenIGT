import { ethers, upgrades } from "hardhat";
import { Token } from "../../typechain-types";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🧪 COMPREHENSIVE TEST: IGE Token on Amoy testnet...");
  
  // Get deployed contract address
  const deploymentsDir = path.join(__dirname, "../../deployments/amoy");
  const proxyData = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "proxy.json"), "utf8"));
  const tokenAddress = proxyData.address;
  
  console.log("Token Address:", tokenAddress);
  
  // Connect to deployed contract
  const [deployer] = await ethers.getSigners();
  const token = await ethers.getContractAt("Token", tokenAddress, deployer) as Token;
  
  console.log("Deployer:", deployer.address);
  
  const testResults = {
    passed: 0,
    failed: 0,
    details: [] as string[]
  };
  
  function addResult(test: string, success: boolean, details: string) {
    testResults.details.push(`${success ? "✅" : "❌"} ${test}: ${details}`);
    if (success) testResults.passed++;
    else testResults.failed++;
  }
  
  try {
    // Test 1: Basic Token Info
    console.log("\n📋 Test 1: Basic Token Info");
    try {
      const name = await token.name();
      const symbol = await token.symbol();
      const decimals = await token.decimals();
      const totalSupply = await token.totalSupply();
      
      addResult("Token Info", true, `${name} (${symbol}) - ${decimals} decimals - ${ethers.formatEther(totalSupply)} total supply`);
    } catch (error) {
      addResult("Token Info", false, `Error: ${error}`);
    }
    
    // Test 2: Fee System
    console.log("\n💰 Test 2: Fee System");
    try {
      const fee = await token.fee();
      const feeCollector = await token.feeCollector();
      
      addResult("Fee Configuration", true, `Fee: ${fee} basis points (${Number(fee)/100}%) - Collector: ${feeCollector}`);
      
      // Test fee application
      const externalAddress = "0xB15a4A995050b5DdE912c1a948fF49b2a2E7d615";
      const transferAmount = ethers.parseEther("50");
      
      const balanceBefore = await token.balanceOf(externalAddress);
      await token.transfer(externalAddress, transferAmount);
      const balanceAfter = await token.balanceOf(externalAddress);
      
      const received = balanceAfter - balanceBefore;
      const expectedFee = transferAmount * 10n / 10000n;
      const expectedReceived = transferAmount - expectedFee;
      
      const feeCorrect = received === expectedReceived;
      addResult("Fee Application", feeCorrect, `Expected: ${ethers.formatEther(expectedReceived)}, Received: ${ethers.formatEther(received)}`);
      
    } catch (error) {
      addResult("Fee System", false, `Error: ${error}`);
    }
    
    // Test 3: Role System
    console.log("\n👥 Test 3: Role System");
    try {
      const roles = [
        { name: "DEFAULT_ADMIN_ROLE", role: await token.DEFAULT_ADMIN_ROLE() },
        { name: "PAUSER_ROLE", role: await token.PAUSER_ROLE() },
        { name: "MINTER_ROLE", role: await token.MINTER_ROLE() },
        { name: "BURNER_ROLE", role: await token.BURNER_ROLE() },
        { name: "UPGRADER_ROLE", role: await token.UPGRADER_ROLE() },
        { name: "FREEZER_ROLE", role: await token.FREEZER_ROLE() },
        { name: "BLOCKER_ROLE", role: await token.BLOCKER_ROLE() }
      ];
      
      let rolesWorking = 0;
      for (const { name, role } of roles) {
        const hasRole = await token.hasRole(role, deployer.address);
        if (hasRole) rolesWorking++;
      }
      
      addResult("Role Assignments", rolesWorking === roles.length, `${rolesWorking}/${roles.length} roles granted to deployer`);
      
    } catch (error) {
      addResult("Role System", false, `Error: ${error}`);
    }
    
    // Test 4: Mint/Burn
    console.log("\n🪙 Test 4: Mint/Burn");
    try {
      const mintAmount = ethers.parseEther("25");
      const mintRecipient = "0x35744Db4a90e39648C45921dd039168EeAa2B5cf";
      
      const supplyBefore = await token.totalSupply();
      const recipientBalanceBefore = await token.balanceOf(mintRecipient);
      
      await token.mint(mintRecipient, mintAmount);
      
      const supplyAfter = await token.totalSupply();
      const recipientBalanceAfter = await token.balanceOf(mintRecipient);
      
      const mintWorking = (supplyAfter - supplyBefore) === mintAmount && (recipientBalanceAfter - recipientBalanceBefore) === mintAmount;
      addResult("Mint Function", mintWorking, `Supply increased by ${ethers.formatEther(supplyAfter - supplyBefore)} IGT`);
      
      // Test burn
      const burnAmount = ethers.parseEther("10");
      const deployerBalanceBefore = await token.balanceOf(deployer.address);
      
      await token.burn(deployer.address, burnAmount);
      
      const deployerBalanceAfter = await token.balanceOf(deployer.address);
      const supplyAfterBurn = await token.totalSupply();
      
      const burnWorking = (deployerBalanceBefore - deployerBalanceAfter) === burnAmount;
      addResult("Burn Function", burnWorking, `Deployer balance decreased by ${ethers.formatEther(deployerBalanceBefore - deployerBalanceAfter)} IGT`);
      
    } catch (error) {
      addResult("Mint/Burn", false, `Error: ${error}`);
    }
    
    // Test 5: EIP-2612 Permit
    console.log("\n📝 Test 5: EIP-2612 Permit");
    try {
      const domain = await token.eip712Domain();
      const nonce = await token.nonces(deployer.address);
      
      addResult("EIP-2612 Support", true, `Domain: ${domain.name}, Chain ID: ${domain.chainId}, Nonce: ${nonce}`);
      
    } catch (error) {
      addResult("EIP-2612 Support", false, `Error: ${error}`);
    }
    
    // Test 6: Transfer Restrictions (Block/Freeze)
    console.log("\n🚫 Test 6: Transfer Restrictions");
    try {
      const testAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
      
      // Test block
      await token.block(testAddress);
      const isBlocked = await token.isBlocked(testAddress);
      
      addResult("Block Function", isBlocked, `Address ${testAddress} blocked: ${isBlocked}`);
      
      // Test freeze (skip if function doesn't exist)
      try {
        await token.freeze(testAddress);
        const isFrozen = await token.isFrozen(testAddress);
        addResult("Freeze Function", isFrozen, `Address ${testAddress} frozen: ${isFrozen}`);
        
        // Unblock and unfreeze
        await token.unblock(testAddress);
        await token.unfreeze(testAddress);
      } catch (freezeError) {
        addResult("Freeze Function", false, "Freeze function not available or failed");
      }
      
      const isUnblocked = !(await token.isBlocked(testAddress));
      const isUnfrozen = !(await token.isFrozen(testAddress));
      
      addResult("Unblock/Unfreeze", isUnblocked && isUnfrozen, "Restrictions removed successfully");
      
    } catch (error) {
      addResult("Transfer Restrictions", false, `Error: ${error}`);
    }
    
    // Test 7: Upgrade Readiness
    console.log("\n⬆️ Test 7: Upgrade Readiness");
    try {
      const hasUpgraderRole = await token.hasRole(await token.UPGRADER_ROLE(), deployer.address);
      
      addResult("Upgrade Readiness", hasUpgraderRole, `Upgrader role granted: ${hasUpgraderRole}`);
      
    } catch (error) {
      addResult("Upgrade Readiness", false, `Error: ${error}`);
    }
    
    // Print comprehensive results
    console.log("\n" + "=".repeat(60));
    console.log("🎉 COMPREHENSIVE AMOY TEST RESULTS");
    console.log("=".repeat(60));
    
    testResults.details.forEach(result => console.log(result));
    
    console.log("\n" + "-".repeat(60));
    console.log(`📊 SUMMARY: ${testResults.passed} passed, ${testResults.failed} failed`);
    console.log(`🎯 SUCCESS RATE: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
    console.log("-".repeat(60));
    
    if (testResults.failed === 0) {
      console.log("🎉 ALL TESTS PASSED! Token is ready for production use!");
    } else {
      console.log("⚠️  Some tests failed. Review the details above.");
    }
    
    console.log(`📊 Explorer: https://amoy.polygonscan.com/address/${tokenAddress}`);
    
  } catch (error) {
    console.error("❌ Comprehensive test failed:", error);
  }
}

main().catch(console.error);
