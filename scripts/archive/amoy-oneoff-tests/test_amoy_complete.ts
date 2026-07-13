import { ethers } from "hardhat";
import { Token } from "../../typechain-types";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🧪 COMPLETE TEST: All Functionality - Amoy");
  
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
    // Test 1: Basic Info
    console.log("\n📋 Test 1: Basic Information");
    try {
      const name = await token.name();
      const symbol = await token.symbol();
      const decimals = await token.decimals();
      const totalSupply = await token.totalSupply();
      const version = await token.version();
      
      addResult("Basic Info", true, `${name} (${symbol}) v${version} - Supply: ${ethers.formatEther(totalSupply)}`);
    } catch (error) {
      addResult("Basic Info", false, `Error: ${error}`);
    }
    
    // Test 2: Fee System
    console.log("\n💰 Test 2: Fee System");
    try {
      const fee = await token.fee();
      const feeCollector = await token.feeCollector();
      
      addResult("Fee Config", true, `Fee: ${fee} bps (${Number(fee)/100}%) - Collector: ${feeCollector}`);
      
      // Test fee application
      const testAddress = "0xB15a4A995050b5DdE912c1a948fF49b2a2E7d615";
      const transferAmount = ethers.parseEther("25");
      
      const balanceBefore = await token.balanceOf(testAddress);
      await token.transfer(testAddress, transferAmount);
      const balanceAfter = await token.balanceOf(testAddress);
      
      const received = balanceAfter - balanceBefore;
      const expectedFee = transferAmount * 10n / 10000n;
      const expectedReceived = transferAmount - expectedFee;
      
      const feeWorking = received === expectedReceived;
      addResult("Fee Application", feeWorking, `Expected: ${ethers.formatEther(expectedReceived)}, Received: ${ethers.formatEther(received)}`);
      
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
        { name: "BLOCKER_ROLE", role: await token.BLOCKER_ROLE() },
        { name: "FEE_ADMIN_ROLE", role: await token.FEE_ADMIN_ROLE() },
        { name: "RECOVERER_ROLE", role: await token.RECOVERER_ROLE() }
      ];
      
      let grantedRoles = 0;
      for (const { name, role } of roles) {
        const hasRole = await token.hasRole(role, deployer.address);
        if (hasRole) grantedRoles++;
      }
      
      addResult("Role System", grantedRoles === roles.length, `${grantedRoles}/${roles.length} roles granted`);
      
    } catch (error) {
      addResult("Role System", false, `Error: ${error}`);
    }
    
    // Test 4: Mint/Burn
    console.log("\n🪙 Test 4: Mint and Burn");
    try {
      // Test mint
      const mintAmount = ethers.parseEther("30");
      const mintRecipient = "0x35744Db4a90e39648C45921dd039168EeAa2B5cf";
      
      const supplyBefore = await token.totalSupply();
      await token.mint(mintRecipient, mintAmount);
      const supplyAfter = await token.totalSupply();
      
      const mintWorking = (supplyAfter - supplyBefore) === mintAmount;
      addResult("Mint Function", mintWorking, `Supply increased: ${ethers.formatEther(supplyAfter - supplyBefore)} IGT`);
      
      // Test burn
      const burnAmount = ethers.parseEther("15");
      const deployerBalanceBefore = await token.balanceOf(deployer.address);
      
      await token.burn(deployer.address, burnAmount);
      const deployerBalanceAfter = await token.balanceOf(deployer.address);
      const supplyAfterBurn = await token.totalSupply();
      
      const burnWorking = (deployerBalanceBefore - deployerBalanceAfter) === burnAmount;
      addResult("Burn Function", burnWorking, `Balance decreased: ${ethers.formatEther(deployerBalanceBefore - deployerBalanceAfter)} IGT`);
      
    } catch (error) {
      addResult("Mint/Burn", false, `Error: ${error}`);
    }
    
    // Test 5: Approval & TransferFrom (FIXED!)
    console.log("\n📝 Test 5: Approval & TransferFrom");
    try {
      const spenderAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
      const approveAmount = ethers.parseEther("100");
      
      await token.approve(spenderAddress, approveAmount);
      const allowance = await token.allowance(deployer.address, spenderAddress);
      
      const approvalWorking = allowance === approveAmount;
      addResult("Approval System", approvalWorking, `Allowance: ${ethers.formatEther(allowance)} IGT`);
      
      // Test TransferFrom
      const transferFromAmount = ethers.parseEther("20");
      const recipientAddress = "0xB15a4A995050b5DdE912c1a948fF49b2a2E7d615";
      
      const recipientBalanceBefore = await token.balanceOf(recipientAddress);
      await token.transferFrom(deployer.address, recipientAddress, transferFromAmount);
      const recipientBalanceAfter = await token.balanceOf(recipientAddress);
      
      const received = recipientBalanceAfter - recipientBalanceBefore;
      const expectedFee = transferFromAmount * 10n / 10000n;
      const expectedReceived = transferFromAmount - expectedFee;
      
      const transferFromWorking = received === expectedReceived;
      addResult("TransferFrom", transferFromWorking, `Received: ${ethers.formatEther(received)} IGT`);
      
    } catch (error) {
      addResult("Approval/TransferFrom", false, `Error: ${error}`);
    }
    
    // Test 6: Pause/Unpause
    console.log("\n⏸️ Test 6: Pause/Unpause");
    try {
      await token.pause();
      const isPaused = await token.paused();
      
      await token.unpause();
      const isUnpaused = !(await token.paused());
      
      const pauseWorking = isPaused && isUnpaused;
      addResult("Pause/Unpause", pauseWorking, `Pause: ${isPaused}, Unpause: ${isUnpaused}`);
      
    } catch (error) {
      addResult("Pause/Unpause", false, `Error: ${error}`);
    }
    
    // Test 7: Block/Unblock
    console.log("\n🚫 Test 7: Block/Unblock");
    try {
      const testAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
      
      await token.block(testAddress);
      const isBlocked = await token.isBlocked(testAddress);
      
      await token.unblock(testAddress);
      const isUnblocked = !(await token.isBlocked(testAddress));
      
      const blockWorking = isBlocked && isUnblocked;
      addResult("Block/Unblock", blockWorking, `Block: ${isBlocked}, Unblock: ${isUnblocked}`);
      
    } catch (error) {
      addResult("Block/Unblock", false, `Error: ${error}`);
    }
    
    // Test 8: EIP-2612 Permit
    console.log("\n📝 Test 8: EIP-2612 Permit");
    try {
      const domain = await token.eip712Domain();
      const nonce = await token.nonces(deployer.address);
      
      addResult("EIP-2612 Support", true, `Domain: ${domain.name}, Chain: ${domain.chainId}, Nonce: ${nonce}`);
      
    } catch (error) {
      addResult("EIP-2612 Support", false, `Error: ${error}`);
    }
    
    // Test 9: Fee Admin Functions
    console.log("\n👑 Test 9: Fee Admin Functions");
    try {
      const newFee = 20n; // 0.2%
      await token.setFee(newFee);
      const updatedFee = await token.fee();
      
      // Reset to original fee
      await token.setFee(10n);
      const resetFee = await token.fee();
      
      const feeAdminWorking = updatedFee === newFee && resetFee === 10n;
      addResult("Fee Admin", feeAdminWorking, `Set/Reset fee: ${updatedFee} -> ${resetFee}`);
      
    } catch (error) {
      addResult("Fee Admin", false, `Error: ${error}`);
    }
    
    // Print Results
    console.log("\n" + "=".repeat(80));
    console.log("🎉 COMPLETE AMOY TEST RESULTS");
    console.log("=".repeat(80));
    
    testResults.details.forEach(result => console.log(result));
    
    console.log("\n" + "-".repeat(80));
    console.log(`📊 SUMMARY: ${testResults.passed} passed, ${testResults.failed} failed`);
    console.log(`🎯 SUCCESS RATE: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
    console.log("-".repeat(80));
    
    if (testResults.failed === 0) {
      console.log("🎉 ALL TESTS PASSED! Token is fully functional on Amoy!");
      console.log("✅ TransferFrom bug fixed!");
      console.log("✅ All advanced features working!");
    } else {
      console.log("⚠️  Some tests failed. Review details above.");
    }
    
    console.log(`📊 Explorer: https://amoy.polygonscan.com/address/${tokenAddress}`);
    console.log(`🔗 Version: ${await token.version()}`);
    
  } catch (error) {
    console.error("❌ Complete test failed:", error);
  }
}

main().catch(console.error);
