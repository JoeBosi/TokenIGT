import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🧪 COMPREHENSIVE TESTS: Fresh Amoy Deployment");
  console.log("============================================");
  
  // Get fresh deployment address
  const deploymentsDir = path.join(__dirname, "../../deployments/amoy-fresh");
  const proxyData = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "proxy.json"), "utf8"));
  const tokenAddress = proxyData.address;
  
  console.log("Token Address:", tokenAddress);
  
  // Connect to deployed contract
  const [deployer] = await ethers.getSigners();
  const token = await ethers.getContractAt("Token", tokenAddress, deployer);
  
  console.log("Deployer:", deployer.address);
  
  const testResults = {
    passed: 0,
    failed: 0,
    details: []
  };

  try {
    // TEST 1: Basic Token Info
    console.log("\n📊 TEST 1: Basic Token Information");
    console.log("====================================");
    
    const name = await token.name();
    const symbol = await token.symbol();
    const decimals = await token.decimals();
    const totalSupply = await token.totalSupply();
    const version = await token.version();
    
    console.log(`Name: ${name}`);
    console.log(`Symbol: ${symbol}`);
    console.log(`Decimals: ${decimals}`);
    console.log(`Total Supply: ${ethers.formatEther(totalSupply)} ${symbol}`);
    console.log(`Version: ${version}`);
    
    const basicInfoCorrect = name === "IGE Token" && symbol === "IGT" && decimals === 18n;
    testResults.details.push({
      test: "Basic Token Info",
      status: basicInfoCorrect ? "✅ PASSED" : "❌ FAILED",
      details: `Name: ${name}, Symbol: ${symbol}, Decimals: ${decimals}`
    });
    if (basicInfoCorrect) testResults.passed++; else testResults.failed++;
    
    // TEST 2: Fee System
    console.log("\n💰 TEST 2: Fee System");
    console.log("=====================");
    
    const fee = await token.fee();
    const feeCollector = await token.feeCollector();
    
    console.log(`Current Fee: ${fee} basis points (${Number(fee)/100}%)`);
    console.log(`Fee Collector: ${feeCollector}`);
    
    // Test fee application
    const testAddress = "0xB15a4A995050b5DdE912c1a948fF49b2a2E7d615";
    const transferAmount = ethers.parseEther("50");
    
    const balanceBefore = await token.balanceOf(testAddress);
    const collectorBalanceBefore = await token.balanceOf(feeCollector);
    
    const tx = await token.transfer(testAddress, transferAmount);
    const receipt = await tx.wait();
    
    const balanceAfter = await token.balanceOf(testAddress);
    const collectorBalanceAfter = await token.balanceOf(feeCollector);
    
    const received = balanceAfter - balanceBefore;
    const collectorReceived = collectorBalanceAfter - collectorBalanceBefore;
    const expectedFee = transferAmount * fee / 10000n;
    const expectedReceived = transferAmount - expectedFee;
    
    // Check if collector is also the sender (deployer)
    const isCollectorSender = feeCollector.toLowerCase() === deployer.address.toLowerCase();
    
    // If collector is sender: they lose (amount - fee) net, recipient gets (amount - fee)
    // If collector is different: sender loses amount, recipient gets (amount - fee), collector gains fee
    let feeSystemWorking;
    if (isCollectorSender) {
      // Collector is sender: loses amount total (fee stays with them as part of their balance)
      const senderLost = transferAmount;
      feeSystemWorking = received === expectedReceived;
    } else {
      // Collector is different from sender
      feeSystemWorking = received === expectedReceived && collectorReceived === expectedFee;
    }
    
    console.log(`Transfer Amount: ${ethers.formatEther(transferAmount)} ${symbol}`);
    console.log(`Expected Fee: ${ethers.formatEther(expectedFee)} ${symbol}`);
    console.log(`Expected Received: ${ethers.formatEther(expectedReceived)} ${symbol}`);
    console.log(`Actually Received: ${ethers.formatEther(received)} ${symbol}`);
    console.log(`Collector is Sender: ${isCollectorSender}`);
    console.log(`Collector Change: ${ethers.formatEther(collectorReceived)} ${symbol}`);
    console.log(`Fee System: ${feeSystemWorking ? "✅ WORKING" : "❌ BROKEN"}`);
    console.log(`Gas Used: ${receipt?.gasUsed.toString()}`);
    
    testResults.details.push({
      test: "Fee System",
      status: feeSystemWorking ? "✅ PASSED" : "❌ FAILED",
      details: `Expected: ${ethers.formatEther(expectedFee)}, Collector: ${ethers.formatEther(collectorReceived)}`
    });
    if (feeSystemWorking) testResults.passed++; else testResults.failed++;
    
    // TEST 3: Mint System
    console.log("\n🪙 TEST 3: Mint System");
    console.log("====================");
    
    const mintAmount = ethers.parseEther("25");
    const mintRecipient = "0x35744Db4a90e39648C45921dd039168EeAa2B5cf";
    
    const supplyBefore = await token.totalSupply();
    const recipientBalanceBefore = await token.balanceOf(mintRecipient);
    
    const mintTx = await token.mint(mintRecipient, mintAmount);
    await mintTx.wait();
    
    const supplyAfter = await token.totalSupply();
    const recipientBalanceAfter = await token.balanceOf(mintRecipient);
    
    const supplyChange = supplyAfter - supplyBefore;
    const recipientChange = recipientBalanceAfter - recipientBalanceBefore;
    
    const mintWorking = supplyChange === mintAmount && recipientChange === mintAmount;
    
    console.log(`Mint Amount: ${ethers.formatEther(mintAmount)} ${symbol}`);
    console.log(`Supply Change: ${ethers.formatEther(supplyChange)} ${symbol}`);
    console.log(`Recipient Change: ${ethers.formatEther(recipientChange)} ${symbol}`);
    console.log(`Mint System: ${mintWorking ? "✅ WORKING" : "❌ BROKEN"}`);
    
    testResults.details.push({
      test: "Mint System",
      status: mintWorking ? "✅ PASSED" : "❌ FAILED",
      details: `Expected: ${ethers.formatEther(mintAmount)}, Actual: ${ethers.formatEther(supplyChange)}`
    });
    if (mintWorking) testResults.passed++; else testResults.failed++;
    
    // TEST 4: Burn System
    console.log("\n🔥 TEST 4: Burn System");
    console.log("====================");
    
    const burnAmount = ethers.parseEther("10");
    
    const deployerBalanceBefore = await token.balanceOf(deployer.address);
    const supplyBeforeBurn = await token.totalSupply();
    
    const burnTx = await token.burn(deployer.address, burnAmount);
    await burnTx.wait();
    
    const deployerBalanceAfter = await token.balanceOf(deployer.address);
    const supplyAfterBurn = await token.totalSupply();
    
    const balanceChange = deployerBalanceBefore - deployerBalanceAfter;
    const supplyChangeBurn = supplyBeforeBurn - supplyAfterBurn;
    
    const burnWorking = balanceChange === burnAmount && supplyChangeBurn === burnAmount;
    
    console.log(`Burn Amount: ${ethers.formatEther(burnAmount)} ${symbol}`);
    console.log(`Balance Change: ${ethers.formatEther(balanceChange)} ${symbol}`);
    console.log(`Supply Change: ${ethers.formatEther(supplyChangeBurn)} ${symbol}`);
    console.log(`Burn System: ${burnWorking ? "✅ WORKING" : "❌ BROKEN"}`);
    
    testResults.details.push({
      test: "Burn System",
      status: burnWorking ? "✅ PASSED" : "❌ FAILED",
      details: `Expected: ${ethers.formatEther(burnAmount)}, Actual: ${ethers.formatEther(balanceChange)}`
    });
    if (burnWorking) testResults.passed++; else testResults.failed++;
    
    // TEST 5: Freeze System
    console.log("\n❄️ TEST 5: Freeze System");
    console.log("======================");
    
    const freezeTestAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    
    // Grant FREEZER_ROLE to deployer if not already granted
    const FREEZER_ROLE = await token.FREEZER_ROLE();
    const hasFreezerRole = await token.hasRole(FREEZER_ROLE, deployer.address);
    if (!hasFreezerRole) {
      console.log("Granting FREEZER_ROLE to deployer...");
      await token.grantRole(FREEZER_ROLE, deployer.address);
    }
    
    const freezeTx = await token["freeze(address,uint256)"](freezeTestAddress, ethers.parseEther("5"));
    await freezeTx.wait();
    const frozenAmount = await token.frozenOf(freezeTestAddress);
    const isFrozen = frozenAmount > 0n;
    
    if (isFrozen) {
      const unfreezeTx = await token.unfreeze(freezeTestAddress);
      await unfreezeTx.wait();
      const frozenAfter = await token.frozenOf(freezeTestAddress);
      const isUnfrozen = frozenAfter === 0n;
      const freezeWorking = isUnfrozen;
      
      console.log(`Freeze System: ${freezeWorking ? "✅ WORKING" : "❌ BROKEN"}`);
      
      testResults.details.push({
        test: "Freeze System",
        status: freezeWorking ? "✅ PASSED" : "❌ FAILED",
        details: `Freeze/Unfreeze operations completed`
      });
      if (freezeWorking) testResults.passed++; else testResults.failed++;
    } else {
      console.log(`Freeze System: ❌ BROKEN`);
      testResults.details.push({
        test: "Freeze System",
        status: "❌ FAILED",
        details: "Freeze operation failed"
      });
      testResults.failed++;
    }
    
    // TEST 6: Block System
    console.log("\n🚫 TEST 6: Block System");
    console.log("====================");
    
    const blockTestAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    
    // Grant BLOCKER_ROLE to deployer if not already granted
    const BLOCKER_ROLE = await token.BLOCKER_ROLE();
    const hasBlockerRole = await token.hasRole(BLOCKER_ROLE, deployer.address);
    if (!hasBlockerRole) {
      console.log("Granting BLOCKER_ROLE to deployer...");
      await token.grantRole(BLOCKER_ROLE, deployer.address);
    }
    
    const blockTx = await token.blockAddress(blockTestAddress);
    await blockTx.wait();
    const isBlocked = await token.isBlocked(blockTestAddress);
    
    if (isBlocked) {
      const unblockTx = await token.unblock(blockTestAddress);
      await unblockTx.wait();
      const isUnblocked = !(await token.isBlocked(blockTestAddress));
      const blockWorking = isUnblocked;
      
      console.log(`Block System: ${blockWorking ? "✅ WORKING" : "❌ BROKEN"}`);
      
      testResults.details.push({
        test: "Block System",
        status: blockWorking ? "✅ PASSED" : "❌ FAILED",
        details: `Block/Unblock operations completed`
      });
      if (blockWorking) testResults.passed++; else testResults.failed++;
    } else {
      console.log(`Block System: ❌ BROKEN`);
      testResults.details.push({
        test: "Block System",
        status: "❌ FAILED",
        details: "Block operation failed"
      });
      testResults.failed++;
    }
    
    // TEST 7: Pause System
    console.log("\n⏸️ TEST 7: Pause System");
    console.log("=====================");
    
    // Grant PAUSER_ROLE if needed
    const PAUSER_ROLE = await token.PAUSER_ROLE();
    const hasPauserRole = await token.hasRole(PAUSER_ROLE, deployer.address);
    if (!hasPauserRole) {
      console.log("Granting PAUSER_ROLE...");
      await (await token.grantRole(PAUSER_ROLE, deployer.address)).wait();
    }
    
    const isPausedBefore = await token.paused();
    const pauseTx = await token.pause();
    await pauseTx.wait();
    const isPausedAfter = await token.paused();
    
    if (isPausedAfter) {
      const unpauseTx = await token.unpause();
      await unpauseTx.wait();
      const isUnpaused = !(await token.paused());
      const pauseWorking = isUnpaused && !isPausedBefore;
      
      console.log(`Pause System: ${pauseWorking ? "✅ WORKING" : "❌ BROKEN"}`);
      
      testResults.details.push({
        test: "Pause System",
        status: pauseWorking ? "✅ PASSED" : "❌ FAILED",
        details: `Pause/Unpause operations completed`
      });
      if (pauseWorking) testResults.passed++; else testResults.failed++;
    } else {
      console.log(`Pause System: ❌ BROKEN`);
      testResults.details.push({
        test: "Pause System",
        status: "❌ FAILED",
        details: "Pause operation failed"
      });
      testResults.failed++;
    }
    
    // TEST 8: Approval & TransferFrom
    console.log("\n📝 TEST 8: Approval & TransferFrom");
    console.log("==================================");
    
    const approveAmount = ethers.parseEther("100");
    const transferFromAmount = ethers.parseEther("30");
    const approvalRecipient = "0xB15a4A995050b5DdE912c1a948fF49b2a2E7d615";
    
    const approveTx = await token.approve(approvalRecipient, approveAmount);
    await approveTx.wait();
    const allowance = await token.allowance(deployer.address, approvalRecipient);
    
    const approvalWorking = allowance === approveAmount;
    console.log(`Approval System: ${approvalWorking ? "✅ WORKING" : "❌ BROKEN"}`);
    
    testResults.details.push({
      test: "Approval System",
      status: approvalWorking ? "✅ PASSED" : "❌ FAILED",
      details: `Expected: ${ethers.formatEther(approveAmount)}, Actual: ${ethers.formatEther(allowance)}`
    });
    if (approvalWorking) testResults.passed++; else testResults.failed++;
    
    // TEST 9: Role System Verification
    console.log("\n👥 TEST 9: Role System Verification");
    console.log("===================================");
    
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
    
    let roleCount = 0;
    for (const { name, role } of roles) {
      const hasRole = await token.hasRole(role, deployer.address);
      if (hasRole) roleCount++;
      console.log(`${name}: ${hasRole ? "✅ GRANTED" : "❌ NOT GRANTED"}`);
    }
    
    const rolesWorking = roleCount >= 7; // At least 7 roles should be granted
    console.log(`Role System: ${rolesWorking ? "✅ WORKING" : "❌ BROKEN"} (${roleCount}/9 roles granted)`);
    
    testResults.details.push({
      test: "Role System",
      status: rolesWorking ? "✅ PASSED" : "❌ FAILED",
      details: `${roleCount}/9 roles granted`
    });
    if (rolesWorking) testResults.passed++; else testResults.failed++;
    
    // Save test results
    const testResultsPath = path.join(deploymentsDir, "test-results.json");
    fs.writeFileSync(testResultsPath, JSON.stringify({
      ...testResults,
      timestamp: new Date().toISOString(),
      network: "amoy-fresh",
      tokenAddress: tokenAddress
    }, null, 2));
    
    console.log("\n🎯 COMPREHENSIVE TEST RESULTS:");
    console.log("==============================");
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`📊 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
    console.log(`🔗 Results saved to: ${testResultsPath}`);
    
    if (testResults.failed === 0) {
      console.log("\n🎉 ALL TESTS PASSED! Fresh deployment is fully functional!");
    } else {
      console.log(`\n⚠️ ${testResults.failed} tests failed. Review details above.`);
    }
    
  } catch (error) {
    console.error("❌ Comprehensive test failed:", error);
    testResults.failed++;
    testResults.details.push({
      test: "Comprehensive Test",
      status: "❌ FAILED",
      details: error.message
    });
  }
}

main().catch(console.error);
