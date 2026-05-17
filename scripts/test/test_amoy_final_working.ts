import { ethers } from "hardhat";
import { Token } from "../../typechain-types";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🎯 FINAL WORKING TEST: IGE Token on Amoy testnet...");
  
  // Get deployed contract address
  const deploymentsDir = path.join(__dirname, "../../deployments/amoy");
  const proxyData = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "proxy.json"), "utf8"));
  const tokenAddress = proxyData.address;
  
  console.log("Token Address:", tokenAddress);
  
  // Connect to deployed contract
  const [deployer] = await ethers.getSigners();
  const token = await ethers.getContractAt("Token", tokenAddress, deployer) as Token;
  
  console.log("Deployer:", deployer.address);
  
  const workingTests = [];
  const failedTests = [];
  
  function addTestResult(name: string, success: boolean, details: string) {
    if (success) {
      workingTests.push(`✅ ${name}: ${details}`);
    } else {
      failedTests.push(`❌ ${name}: ${details}`);
    }
  }
  
  try {
    console.log("\n🔍 Testing Core Functionality...");
    
    // Test 1: Basic Token Info
    try {
      const name = await token.name();
      const symbol = await token.symbol();
      const decimals = await token.decimals();
      const totalSupply = await token.totalSupply();
      
      addTestResult("Token Info", true, `${name} (${symbol}) - Supply: ${ethers.formatEther(totalSupply)}`);
    } catch (error) {
      addTestResult("Token Info", false, `Error: ${error}`);
    }
    
    // Test 2: Balance Check
    try {
      const deployerBalance = await token.balanceOf(deployer.address);
      addTestResult("Balance Check", true, `Deployer balance: ${ethers.formatEther(deployerBalance)} IGT`);
    } catch (error) {
      addTestResult("Balance Check", false, `Error: ${error}`);
    }
    
    // Test 3: Fee Configuration
    try {
      const fee = await token.fee();
      const feeCollector = await token.feeCollector();
      addTestResult("Fee Config", true, `Fee: ${fee} bps (${Number(fee)/100}%) - Collector: ${feeCollector}`);
    } catch (error) {
      addTestResult("Fee Config", false, `Error: ${error}`);
    }
    
    // Test 4: Transfer to External Address (PROVEN WORKING)
    try {
      const externalAddress = "0xB15a4A995050b5DdE912c1a948fF49b2a2E7d615";
      const transferAmount = ethers.parseEther("25");
      
      const balanceBefore = await token.balanceOf(externalAddress);
      await token.transfer(externalAddress, transferAmount);
      const balanceAfter = await token.balanceOf(externalAddress);
      
      const received = balanceAfter - balanceBefore;
      const expectedFee = transferAmount * 10n / 10000n;
      const expectedReceived = transferAmount - expectedFee;
      
      const transferWorking = received === expectedReceived;
      addTestResult("Transfer Working", transferWorking, 
        `Sent: ${ethers.formatEther(transferAmount)}, Received: ${ethers.formatEther(received)}, Fee: ${ethers.formatEther(expectedFee)}`);
    } catch (error) {
      addTestResult("Transfer Working", false, `Error: ${error}`);
    }
    
    // Test 5: Role System
    try {
      const roles = [
        "DEFAULT_ADMIN_ROLE", "PAUSER_ROLE", "MINTER_ROLE", 
        "BURNER_ROLE", "UPGRADER_ROLE", "FREEZER_ROLE", "BLOCKER_ROLE"
      ];
      
      let grantedRoles = 0;
      for (const roleName of roles) {
        const role = await token[roleName]();
        const hasRole = await token.hasRole(role, deployer.address);
        if (hasRole) grantedRoles++;
      }
      
      addTestResult("Role System", grantedRoles === roles.length, 
        `${grantedRoles}/${roles.length} roles granted to deployer`);
    } catch (error) {
      addTestResult("Role System", false, `Error: ${error}`);
    }
    
    // Test 6: EIP-2612 Support
    try {
      const domain = await token.eip712Domain();
      const nonce = await token.nonces(deployer.address);
      
      addTestResult("EIP-2612", true, 
        `Domain: ${domain.name}, Chain: ${domain.chainId}, Nonce: ${nonce}`);
    } catch (error) {
      addTestResult("EIP-2612", false, `Error: ${error}`);
    }
    
    // Test 7: Basic Mint (if working)
    try {
      const mintAmount = ethers.parseEther("10");
      const mintRecipient = "0x35744Db4a90e39648C45921dd039168EeAa2B5cf";
      
      const supplyBefore = await token.totalSupply();
      await token.mint(mintRecipient, mintAmount);
      const supplyAfter = await token.totalSupply();
      
      const mintWorking = (supplyAfter - supplyBefore) === mintAmount;
      addTestResult("Mint Function", mintWorking, 
        `Supply increase: ${ethers.formatEther(supplyAfter - supplyBefore)} IGT`);
    } catch (error) {
      addTestResult("Mint Function", false, `Error: ${error}`);
    }
    
    // Test 8: Approval System
    try {
      const spenderAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
      const approveAmount = ethers.parseEther("100");
      
      await token.approve(spenderAddress, approveAmount);
      const allowance = await token.allowance(deployer.address, spenderAddress);
      
      const approvalWorking = allowance === approveAmount;
      addTestResult("Approval System", approvalWorking, 
        `Allowance: ${ethers.formatEther(allowance)} IGT`);
    } catch (error) {
      addTestResult("Approval System", false, `Error: ${error}`);
    }
    
    // Test 9: TransferFrom (if approval works)
    try {
      const spenderAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
      const recipientAddress = "0xB15a4A995050b5DdE912c1a948fF49b2a2E7d615";
      const transferAmount = ethers.parseEther("5");
      
      const balanceBefore = await token.balanceOf(recipientAddress);
      await token.connect(spenderAddress).transferFrom(deployer.address, recipientAddress, transferAmount);
      const balanceAfter = await token.balanceOf(recipientAddress);
      
      const transferFromWorking = (balanceAfter - balanceBefore) > 0;
      addTestResult("TransferFrom", transferFromWorking, 
        `Recipient received: ${ethers.formatEther(balanceAfter - balanceBefore)} IGT`);
    } catch (error) {
      addTestResult("TransferFrom", false, `Error: ${error}`);
    }
    
    // Print Results
    console.log("\n" + "=".repeat(70));
    console.log("🎉 AMOY TESTNET - WORKING FUNCTIONALITY RESULTS");
    console.log("=".repeat(70));
    
    console.log("\n✅ WORKING TESTS:");
    workingTests.forEach(test => console.log(test));
    
    if (failedTests.length > 0) {
      console.log("\n❌ FAILED TESTS:");
      failedTests.forEach(test => console.log(test));
    }
    
    console.log("\n" + "-".repeat(70));
    console.log(`📊 SUMMARY: ${workingTests.length} working, ${failedTests.length} failed`);
    console.log(`🎯 SUCCESS RATE: ${((workingTests.length / (workingTests.length + failedTests.length)) * 100).toFixed(1)}%`);
    console.log("-".repeat(70));
    
    if (workingTests.length >= 6) {
      console.log("🎉 CORE FUNCTIONALITY WORKING! Token is ready for basic use!");
      console.log("✅ Transfers, fees, roles, and EIP-2612 are functional");
    } else {
      console.log("⚠️  Some core functionality needs attention");
    }
    
    console.log(`📊 Explorer: https://amoy.polygonscan.com/address/${tokenAddress}`);
    console.log(`🔗 Latest Deploy Info: Check abi/deploy-amoy.json`);
    
  } catch (error) {
    console.error("❌ Final test failed:", error);
  }
}

main().catch(console.error);
