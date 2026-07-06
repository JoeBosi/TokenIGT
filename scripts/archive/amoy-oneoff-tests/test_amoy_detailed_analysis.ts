import { ethers } from "hardhat";
import { Token } from "../../typechain-types";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔬 DETAILED ANALYSIS: Exact Code Parts Causing Amoy Failures");
  console.log("==========================================================");
  
  // Get deployed contract address
  const deploymentsDir = path.join(__dirname, "../../deployments/amoy");
  const proxyData = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "proxy.json"), "utf8"));
  const tokenAddress = proxyData.address;
  
  console.log("Token Address:", tokenAddress);
  
  // Connect to deployed contract
  const [deployer] = await ethers.getSigners();
  const token = await ethers.getContractAt("Token", tokenAddress, deployer) as Token;
  
  console.log("Deployer:", deployer.address);
  
  try {
    // ANALYSIS 1: FUNCTION SIGNATURES AND AMBIGUITY
    console.log("\n🔍 ANALYSIS 1: Function Signatures & Ambiguity");
    console.log("================================================");
    
    // Check contract interface
    const contractInterface = token.interface;
    const freezeFunctions = contractInterface.fragments.filter(f => f.name === 'freeze');
    const blockFunctions = contractInterface.fragments.filter(f => f.name === 'block');
    const mintFunctions = contractInterface.fragments.filter(f => f.name === 'mint');
    const burnFunctions = contractInterface.fragments.filter(f => f.name === 'burn');
    
    console.log("FREEZE FUNCTIONS FOUND:");
    freezeFunctions.forEach((func, index) => {
      console.log(`  ${index + 1}. ${func.name}(${func.inputs.map(i => i.type).join(', ')})`);
    });
    
    console.log("BLOCK FUNCTIONS FOUND:");
    blockFunctions.forEach((func, index) => {
      console.log(`  ${index + 1}. ${func.name}(${func.inputs.map(i => i.type).join(', ')})`);
    });
    
    console.log("MINT FUNCTIONS FOUND:");
    mintFunctions.forEach((func, index) => {
      console.log(`  ${index + 1}. ${func.name}(${func.inputs.map(i => i.type).join(', ')})`);
    });
    
    console.log("BURN FUNCTIONS FOUND:");
    burnFunctions.forEach((func, index) => {
      console.log(`  ${index + 1}. ${func.name}(${func.inputs.map(i => i.type).join(', ')})`);
    });
    
    // ANALYSIS 2: DETAILED FREEZE FUNCTION TESTING
    console.log("\n🔍 ANALYSIS 2: Detailed Freeze Function Testing");
    console.log("==================================================");
    
    const testAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    
    try {
      console.log("Testing freeze(address) - should call freezeAll...");
      await token.freeze(testAddress);
      console.log("✅ freeze(address) SUCCESS");
      
      const isFrozen = await token.isFrozen(testAddress);
      console.log(`Is frozen: ${isFrozen}`);
      
      if (isFrozen) {
        await token.unfreeze(testAddress);
        console.log("✅ unfreeze SUCCESS");
      }
      
    } catch (freezeError) {
      console.error("❌ freeze(address) FAILED:", freezeError.message);
      
      // Try freeze(address, uint256) explicitly
      try {
        console.log("Testing freeze(address, uint256) explicitly...");
        await token["freeze(address,uint256)"](testAddress, ethers.parseEther("5"));
        console.log("✅ freeze(address,uint256) SUCCESS");
        
        const isFrozen = await token.isFrozen(testAddress);
        console.log(`Is frozen: ${isFrozen}`);
        
        if (isFrozen) {
          await token.unfreeze(testAddress);
          console.log("✅ unfreeze SUCCESS");
        }
        
      } catch (freezeUintError) {
        console.error("❌ freeze(address,uint256) ALSO FAILED:", freezeUintError.message);
      }
    }
    
    // ANALYSIS 3: DETAILED BLOCK FUNCTION TESTING
    console.log("\n🔍 ANALYSIS 3: Detailed Block Function Testing");
    console.log("==============================================");
    
    try {
      console.log("Testing block function...");
      await token.block(testAddress);
      console.log("✅ block SUCCESS");
      
      const isBlocked = await token.isBlocked(testAddress);
      console.log(`Is blocked: ${isBlocked}`);
      
      if (isBlocked) {
        await token.unblock(testAddress);
        console.log("✅ unblock SUCCESS");
      }
      
    } catch (blockError) {
      console.error("❌ block FAILED:", blockError.message);
      
      // Check if it's a role issue
      const BLOCKER_ROLE = await token.BLOCKER_ROLE();
      const hasBlockerRole = await token.hasRole(BLOCKER_ROLE, deployer.address);
      console.log(`Has BLOCKER_ROLE: ${hasBlockerRole}`);
      
      if (!hasBlockerRole) {
        console.log("🔍 ISSUE: Deployer lacks BLOCKER_ROLE - this could be the problem");
      }
    }
    
    // ANALYSIS 4: DETAILED MINT FUNCTION TESTING
    console.log("\n🔍 ANALYSIS 4: Detailed Mint Function Testing");
    console.log("============================================");
    
    try {
      const mintAmount = ethers.parseEther("10");
      const mintRecipient = "0x35744Db4a90e39648C45921dd039168EeAa2B5cf";
      
      console.log("Testing mint function...");
      console.log(`Minting ${ethers.formatEther(mintAmount)} to ${mintRecipient}`);
      
      const supplyBefore = await token.totalSupply();
      const recipientBalanceBefore = await token.balanceOf(mintRecipient);
      
      await token.mint(mintRecipient, mintAmount);
      
      const supplyAfter = await token.totalSupply();
      const recipientBalanceAfter = await token.balanceOf(mintRecipient);
      
      const supplyChange = supplyAfter - supplyBefore;
      const recipientChange = recipientBalanceAfter - recipientBalanceBefore;
      
      console.log(`Supply change: ${ethers.formatEther(supplyChange)}`);
      console.log(`Recipient balance change: ${ethers.formatEther(recipientChange)}`);
      console.log(`Expected: ${ethers.formatEther(mintAmount)}`);
      
      if (supplyChange === mintAmount && recipientChange === mintAmount) {
        console.log("✅ mint SUCCESS");
      } else {
        console.log("❌ mint FAILED - amount mismatch");
        console.log("🔍 This suggests the mint is being intercepted or modified");
      }
      
    } catch (mintError) {
      console.error("❌ mint FAILED:", mintError.message);
      
      // Check if it's a role issue
      const MINTER_ROLE = await token.MINTER_ROLE();
      const hasMinterRole = await token.hasRole(MINTER_ROLE, deployer.address);
      console.log(`Has MINTER_ROLE: ${hasMinterRole}`);
      
      if (!hasMinterRole) {
        console.log("🔍 ISSUE: Deployer lacks MINTER_ROLE");
      } else {
        console.log("🔍 ISSUE: Mint has role but still fails - likely _update hook problem");
      }
    }
    
    // ANALYSIS 5: DETAILED BURN FUNCTION TESTING
    console.log("\n🔍 ANALYSIS 5: Detailed Burn Function Testing");
    console.log("============================================");
    
    try {
      const burnAmount = ethers.parseEther("5");
      
      console.log("Testing burn function...");
      console.log(`Burning ${ethers.formatEther(burnAmount)} from deployer`);
      
      const deployerBalanceBefore = await token.balanceOf(deployer.address);
      const supplyBefore = await token.totalSupply();
      
      await token.burn(deployer.address, burnAmount);
      
      const deployerBalanceAfter = await token.balanceOf(deployer.address);
      const supplyAfter = await token.totalSupply();
      
      const balanceChange = deployerBalanceBefore - deployerBalanceAfter;
      const supplyChange = supplyBefore - supplyAfter;
      
      console.log(`Balance change: ${ethers.formatEther(balanceChange)}`);
      console.log(`Supply change: ${ethers.formatEther(supplyChange)}`);
      console.log(`Expected: ${ethers.formatEther(burnAmount)}`);
      
      if (balanceChange === burnAmount && supplyChange === burnAmount) {
        console.log("✅ burn SUCCESS");
      } else {
        console.log("❌ burn FAILED - amount mismatch");
        console.log("🔍 This suggests the burn is being intercepted or modified");
      }
      
    } catch (burnError) {
      console.error("❌ burn FAILED:", burnError.message);
      
      // Check if it's a role issue
      const BURNER_ROLE = await token.BURNER_ROLE();
      const hasBurnerRole = await token.hasRole(BURNER_ROLE, deployer.address);
      console.log(`Has BURNER_ROLE: ${hasBurnerRole}`);
      
      if (!hasBurnerRole) {
        console.log("🔍 ISSUE: Deployer lacks BURNER_ROLE");
      } else {
        console.log("🔍 ISSUE: Burn has role but still fails - likely _update hook problem");
      }
    }
    
    // ANALYSIS 6: FEE SYSTEM DETAILED TESTING
    console.log("\n🔍 ANALYSIS 6: Fee System Detailed Testing");
    console.log("==========================================");
    
    try {
      const fee = await token.fee();
      const feeCollector = await token.feeCollector();
      
      console.log(`Current fee: ${fee} basis points`);
      console.log(`Fee collector: ${feeCollector}`);
      
      const transferAmount = ethers.parseEther("20");
      const recipientAddress = "0xB15a4A995050b5DdE912c1a948fF49b2a2E7d615";
      
      console.log(`Testing transfer of ${ethers.formatEther(transferAmount)} tokens...`);
      
      const recipientBalanceBefore = await token.balanceOf(recipientAddress);
      const collectorBalanceBefore = await token.balanceOf(feeCollector);
      
      const tx = await token.transfer(recipientAddress, transferAmount);
      const receipt = await tx.wait();
      
      const recipientBalanceAfter = await token.balanceOf(recipientAddress);
      const collectorBalanceAfter = await token.balanceOf(feeCollector);
      
      const recipientReceived = recipientBalanceAfter - recipientBalanceBefore;
      const collectorReceived = collectorBalanceAfter - collectorBalanceBefore;
      
      const expectedFee = transferAmount * fee / 10000n;
      const expectedReceived = transferAmount - expectedFee;
      
      console.log(`Recipient received: ${ethers.formatEther(recipientReceived)}`);
      console.log(`Expected recipient received: ${ethers.formatEther(expectedReceived)}`);
      console.log(`Collector received: ${ethers.formatEther(collectorReceived)}`);
      console.log(`Expected fee: ${ethers.formatEther(expectedFee)}`);
      
      if (recipientReceived === expectedReceived && collectorReceived === expectedFee) {
        console.log("✅ Fee system WORKING");
      } else {
        console.log("❌ Fee system BROKEN");
        console.log("🔍 Fee calculation or application is incorrect");
      }
      
      console.log(`Gas used: ${receipt?.gasUsed.toString()}`);
      
    } catch (feeError) {
      console.error("❌ Fee system test FAILED:", feeError.message);
    }
    
    // ANALYSIS 7: _UPDATE HOOK BEHAVIOR
    console.log("\n🔍 ANALYSIS 7: _Update Hook Behavior Analysis");
    console.log("=============================================");
    
    try {
      console.log("Testing if _update hook is interfering with mint/burn...");
      
      // Check if there are any restrictions on the deployer
      const isDeployerBlocked = await token.isBlocked(deployer.address);
      const isDeployerFrozen = await token.isFrozen(deployer.address);
      const isPaused = await token.paused();
      
      console.log(`Deployer blocked: ${isDeployerBlocked}`);
      console.log(`Deployer frozen: ${isDeployerFrozen}`);
      console.log(`Contract paused: ${isPaused}`);
      
      if (isDeployerBlocked || isDeployerFrozen || isPaused) {
        console.log("🔍 ISSUE: Deployer is restricted - this could cause mint/burn failures");
      }
      
    } catch (hookError) {
      console.error("❌ Hook analysis FAILED:", hookError.message);
    }
    
    console.log("\n🎯 DETAILED ANALYSIS COMPLETE!");
    console.log("Review the results above to identify exact failure points.");
    
  } catch (error) {
    console.error("❌ Detailed analysis failed:", error);
  }
}

main().catch(console.error);
