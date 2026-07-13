import { ethers } from "hardhat";
import { Token } from "../../typechain-types";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔍 DEBUG: TransferFrom Issue - Amoy");
  
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
    // Check current state
    const deployerBalance = await token.balanceOf(deployer.address);
    console.log(`Deployer Balance: ${ethers.formatEther(deployerBalance)} IGT`);
    
    // Set up approval
    const spenderAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    const approveAmount = ethers.parseEther("100");
    
    console.log(`Setting up approval for ${spenderAddress}...`);
    await token.approve(spenderAddress, approveAmount);
    
    const allowance = await token.allowance(deployer.address, spenderAddress);
    console.log(`Allowance: ${ethers.formatEther(allowance)} IGT`);
    
    // Try smaller transferFrom amount
    const transferAmount = ethers.parseEther("5");
    const recipientAddress = "0xB15a4A995050b5DdE912c1a948fF49b2a2E7d615";
    
    console.log(`Attempting TransferFrom: ${ethers.formatEther(transferAmount)} IGT`);
    console.log(`From: ${deployer.address}`);
    console.log(`To: ${recipientAddress}`);
    console.log(`Spender: ${spenderAddress}`);
    
    // Check if recipient is blocked/frozen
    const isRecipientBlocked = await token.isBlocked(recipientAddress);
    const isRecipientFrozen = await token.isFrozen(recipientAddress);
    const isPaused = await token.paused();
    
    console.log(`Recipient Blocked: ${isRecipientBlocked}`);
    console.log(`Recipient Frozen: ${isRecipientFrozen}`);
    console.log(`Contract Paused: ${isPaused}`);
    
    // Check if deployer is blocked/frozen
    const isDeployerBlocked = await token.isBlocked(deployer.address);
    const isDeployerFrozen = await token.isFrozen(deployer.address);
    
    console.log(`Deployer Blocked: ${isDeployerBlocked}`);
    console.log(`Deployer Frozen: ${isDeployerFrozen}`);
    
    // Try the transferFrom
    try {
      const tx = await token.transferFrom(deployer.address, recipientAddress, transferAmount);
      const receipt = await tx.wait();
      
      console.log(`✅ TransferFrom TX: ${tx.hash}`);
      console.log(`✅ Gas Used: ${receipt?.gasUsed.toString()}`);
      
      const recipientBalanceBefore = await token.balanceOf(recipientAddress);
      const recipientBalanceAfter = await token.balanceOf(recipientAddress);
      const received = recipientBalanceAfter - recipientBalanceBefore;
      
      console.log(`✅ Received: ${ethers.formatEther(received)} IGT`);
      
    } catch (error) {
      console.error(`❌ TransferFrom failed: ${error}`);
      
      // Try with deployer as recipient (self-transfer)
      console.log("\nTrying self-transferFrom...");
      try {
        const tx2 = await token.transferFrom(deployer.address, deployer.address, transferAmount);
        const receipt2 = await tx2.wait();
        console.log(`✅ Self TransferFrom TX: ${tx2.hash}`);
      } catch (selfError) {
        console.error(`❌ Self TransferFrom also failed: ${selfError}`);
      }
      
      // Try direct transfer for comparison
      console.log("\nTrying direct transfer for comparison...");
      try {
        const tx3 = await token.transfer(recipientAddress, transferAmount);
        const receipt3 = await tx3.wait();
        console.log(`✅ Direct Transfer TX: ${tx3.hash}`);
      } catch (directError) {
        console.error(`❌ Direct Transfer failed: ${directError}`);
      }
    }
    
  } catch (error) {
    console.error("❌ Debug failed:", error);
  }
}

main().catch(console.error);
