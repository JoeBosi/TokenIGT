import { ethers } from "hardhat";
import { Token } from "../../typechain-types";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔍 STEP 2: Advanced Functions Test - Amoy");
  
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
    // Test 1: Mint functionality
    console.log("\n🪙 Testing Mint Function...");
    const mintAmount = ethers.parseEther("50");
    const mintRecipient = "0x35744Db4a90e39648C45921dd039168EeAa2B5cf";
    
    const supplyBefore = await token.totalSupply();
    const recipientBalanceBefore = await token.balanceOf(mintRecipient);
    
    console.log(`  Supply Before: ${ethers.formatEther(supplyBefore)} IGT`);
    console.log(`  Recipient Balance Before: ${ethers.formatEther(recipientBalanceBefore)} IGT`);
    
    // Check if deployer has MINTER_ROLE
    const MINTER_ROLE = await token.MINTER_ROLE();
    const hasMinterRole = await token.hasRole(MINTER_ROLE, deployer.address);
    console.log(`  MINTER_ROLE: ${hasMinterRole ? "GRANTED" : "NOT GRANTED"}`);
    
    if (hasMinterRole) {
      const tx = await token.mint(mintRecipient, mintAmount);
      const receipt = await tx.wait();
      console.log(`  Mint TX: ${tx.hash}`);
      console.log(`  Gas Used: ${receipt?.gasUsed.toString()}`);
      
      const supplyAfter = await token.totalSupply();
      const recipientBalanceAfter = await token.balanceOf(mintRecipient);
      
      console.log(`  Supply After: ${ethers.formatEther(supplyAfter)} IGT`);
      console.log(`  Recipient Balance After: ${ethers.formatEther(recipientBalanceAfter)} IGT`);
      
      const supplyChange = supplyAfter - supplyBefore;
      const recipientChange = recipientBalanceAfter - recipientBalanceBefore;
      
      console.log(`  Supply Change: ${ethers.formatEther(supplyChange)} IGT`);
      console.log(`  Recipient Change: ${ethers.formatEther(recipientChange)} IGT`);
      console.log(`  Mint Success: ${supplyChange === mintAmount && recipientChange === mintAmount ? "YES" : "NO"}`);
    } else {
      console.log("  ❌ Cannot test mint - no MINTER_ROLE");
    }
    
    // Test 2: Burn functionality
    console.log("\n🔥 Testing Burn Function...");
    const burnAmount = ethers.parseEther("10");
    
    // Check if deployer has BURNER_ROLE
    const BURNER_ROLE = await token.BURNER_ROLE();
    const hasBurnerRole = await token.hasRole(BURNER_ROLE, deployer.address);
    console.log(`  BURNER_ROLE: ${hasBurnerRole ? "GRANTED" : "NOT GRANTED"}`);
    
    if (hasBurnerRole) {
      const deployerBalanceBefore = await token.balanceOf(deployer.address);
      const supplyBeforeBurn = await token.totalSupply();
      
      console.log(`  Deployer Balance Before: ${ethers.formatEther(deployerBalanceBefore)} IGT`);
      console.log(`  Supply Before: ${ethers.formatEther(supplyBeforeBurn)} IGT`);
      
      const tx = await token.burn(deployer.address, burnAmount);
      const receipt = await tx.wait();
      console.log(`  Burn TX: ${tx.hash}`);
      console.log(`  Gas Used: ${receipt?.gasUsed.toString()}`);
      
      const deployerBalanceAfter = await token.balanceOf(deployer.address);
      const supplyAfterBurn = await token.totalSupply();
      
      console.log(`  Deployer Balance After: ${ethers.formatEther(deployerBalanceAfter)} IGT`);
      console.log(`  Supply After: ${ethers.formatEther(supplyAfterBurn)} IGT`);
      
      const balanceChange = deployerBalanceBefore - deployerBalanceAfter;
      const supplyChange = supplyBeforeBurn - supplyAfterBurn;
      
      console.log(`  Balance Change: ${ethers.formatEther(balanceChange)} IGT`);
      console.log(`  Supply Change: ${ethers.formatEther(supplyChange)} IGT`);
      console.log(`  Burn Success: ${balanceChange === burnAmount && supplyChange === burnAmount ? "YES" : "NO"}`);
    } else {
      console.log("  ❌ Cannot test burn - no BURNER_ROLE");
    }
    
    // Test 3: Approval and TransferFrom
    console.log("\n📝 Testing Approval & TransferFrom...");
    const spenderAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    const approveAmount = ethers.parseEther("100");
    
    const allowanceBefore = await token.allowance(deployer.address, spenderAddress);
    console.log(`  Allowance Before: ${ethers.formatEther(allowanceBefore)} IGT`);
    
    const tx = await token.approve(spenderAddress, approveAmount);
    const receipt = await tx.wait();
    console.log(`  Approve TX: ${tx.hash}`);
    console.log(`  Gas Used: ${receipt?.gasUsed.toString()}`);
    
    const allowanceAfter = await token.allowance(deployer.address, spenderAddress);
    console.log(`  Allowance After: ${ethers.formatEther(allowanceAfter)} IGT`);
    console.log(`  Approval Success: ${allowanceAfter === approveAmount ? "YES" : "NO"}`);
    
    // Test TransferFrom (using deployer as spender)
    if (allowanceAfter === approveAmount) {
      console.log("\n🔄 Testing TransferFrom...");
      const transferFromAmount = ethers.parseEther("20");
      const recipientAddress = "0xB15a4A995050b5DdE912c1a948fF49b2a2E7d615";
      
      const recipientBalanceBefore = await token.balanceOf(recipientAddress);
      console.log(`  Recipient Balance Before: ${ethers.formatEther(recipientBalanceBefore)} IGT`);
      
      const tx = await token.transferFrom(deployer.address, recipientAddress, transferFromAmount);
      const receipt = await tx.wait();
      console.log(`  TransferFrom TX: ${tx.hash}`);
      console.log(`  Gas Used: ${receipt?.gasUsed.toString()}`);
      
      const recipientBalanceAfter = await token.balanceOf(recipientAddress);
      console.log(`  Recipient Balance After: ${ethers.formatEther(recipientBalanceAfter)} IGT`);
      
      const received = recipientBalanceAfter - recipientBalanceBefore;
      const expectedFee = transferFromAmount * 10n / 10000n;
      const expectedReceived = transferFromAmount - expectedFee;
      
      console.log(`  Received: ${ethers.formatEther(received)} IGT`);
      console.log(`  Expected: ${ethers.formatEther(expectedReceived)} IGT`);
      console.log(`  TransferFrom Success: ${received === expectedReceived ? "YES" : "NO"}`);
    }
    
    // Test 4: Pause/Unpause
    console.log("\n⏸️ Testing Pause/Unpause...");
    const PAUSER_ROLE = await token.PAUSER_ROLE();
    const hasPauserRole = await token.hasRole(PAUSER_ROLE, deployer.address);
    console.log(`  PAUSER_ROLE: ${hasPauserRole ? "GRANTED" : "NOT GRANTED"}`);
    
    if (hasPauserRole) {
      const tx = await token.pause();
      const receipt = await tx.wait();
      console.log(`  Pause TX: ${tx.hash}`);
      
      const isPaused = await token.paused();
      console.log(`  Is Paused: ${isPaused ? "YES" : "NO"}`);
      console.log(`  Pause Success: ${isPaused ? "YES" : "NO"}`);
      
      const tx2 = await token.unpause();
      const receipt2 = await tx2.wait();
      console.log(`  Unpause TX: ${tx2.hash}`);
      
      const isUnpaused = !(await token.paused());
      console.log(`  Is Unpaused: ${isUnpaused ? "YES" : "NO"}`);
      console.log(`  Unpause Success: ${isUnpaused ? "YES" : "NO"}`);
    } else {
      console.log("  ❌ Cannot test pause - no PAUSER_ROLE");
    }
    
    console.log("\n✅ Step 2 Advanced Functions Test Complete!");
    
  } catch (error) {
    console.error("❌ Step 2 failed:", error);
  }
}

main().catch(console.error);
