import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔍 DEBUG: Fresh Amoy Deployment Issues");
  console.log("=======================================");
  
  // Get fresh deployment address
  const deploymentsDir = path.join(__dirname, "../../deployments/amoy-fresh");
  const proxyData = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "proxy.json"), "utf8"));
  const tokenAddress = proxyData.address;
  
  console.log("Token Address:", tokenAddress);
  
  // Connect to deployed contract
  const [deployer] = await ethers.getSigners();
  const token = await ethers.getContractAt("Token", tokenAddress, deployer);
  
  console.log("Deployer:", deployer.address);
  
  try {
    // Check basic state
    console.log("\n📊 Basic State Check:");
    const name = await token.name();
    const symbol = await token.symbol();
    const totalSupply = await token.totalSupply();
    const deployerBalance = await token.balanceOf(deployer.address);
    const version = await token.version();
    
    console.log(`Name: ${name}`);
    console.log(`Symbol: ${symbol}`);
    console.log(`Version: ${version}`);
    console.log(`Total Supply: ${ethers.formatEther(totalSupply)} ${symbol}`);
    console.log(`Deployer Balance: ${ethers.formatEther(deployerBalance)} ${symbol}`);
    
    // Check roles
    console.log("\n👥 Role Check:");
    const MINTER_ROLE = await token.MINTER_ROLE();
    const hasMinterRole = await token.hasRole(MINTER_ROLE, deployer.address);
    console.log(`Has MINTER_ROLE: ${hasMinterRole}`);
    
    // Debug mint issue step by step
    console.log("\n🪙 Debug Mint Issue:");
    
    // Check if deployer has enough balance
    console.log(`Deployer balance: ${ethers.formatEther(deployerBalance)}`);
    
    // Try to mint small amount
    const mintAmount = ethers.parseEther("1");
    const mintRecipient = "0x35744Db4a90e39648C45921dd039168EeAa2B5cf";
    
    console.log(`Attempting to mint ${ethers.formatEther(mintAmount)} to ${mintRecipient}`);
    
    try {
      // Check gas estimation first
      const gasEstimate = await token.mint.estimateGas(mintRecipient, mintAmount);
      console.log(`Gas estimate: ${gasEstimate.toString()}`);
      
      // Try actual mint
      const tx = await token.mint(mintRecipient, mintAmount);
      const receipt = await tx.wait();
      
      console.log(`✅ Mint successful! TX: ${tx.hash}`);
      console.log(`Gas used: ${receipt?.gasUsed.toString()}`);
      
      // Check results
      const newBalance = await token.balanceOf(mintRecipient);
      const newSupply = await token.totalSupply();
      
      console.log(`New recipient balance: ${ethers.formatEther(newBalance)}`);
      console.log(`New total supply: ${ethers.formatEther(newSupply)}`);
      
    } catch (mintError) {
      console.error("❌ Mint failed:", mintError);
      
      // Try to get more detailed error info
      if (mintError.data) {
        console.error("Error data:", mintError.data);
      }
      
      // Check if it's a revert reason
      try {
        await token.callStatic.mint(mintRecipient, mintAmount);
      } catch (staticError) {
        console.error("Static call error:", staticError);
      }
    }
    
    // Debug fee issue
    console.log("\n💰 Debug Fee Issue:");
    
    const fee = await token.fee();
    const feeCollector = await token.feeCollector();
    
    console.log(`Fee: ${fee} basis points`);
    console.log(`Fee Collector: ${feeCollector}`);
    
    // Check if collector is same as deployer
    const isCollectorDeployer = feeCollector.toLowerCase() === deployer.address.toLowerCase();
    console.log(`Collector is deployer: ${isCollectorDeployer}`);
    
    // Try a simple transfer and track balances
    const testAddress = "0xB15a4A995050b5DdE912c1a948fF49b2a2E7d615";
    const transferAmount = ethers.parseEther("10");
    
    console.log(`Testing transfer of ${ethers.formatEther(transferAmount)} tokens...`);
    
    const senderBalanceBefore = await token.balanceOf(deployer.address);
    const recipientBalanceBefore = await token.balanceOf(testAddress);
    const collectorBalanceBefore = await token.balanceOf(feeCollector);
    
    console.log(`Before - Sender: ${ethers.formatEther(senderBalanceBefore)}`);
    console.log(`Before - Recipient: ${ethers.formatEther(recipientBalanceBefore)}`);
    console.log(`Before - Collector: ${ethers.formatEther(collectorBalanceBefore)}`);
    
    const tx = await token.transfer(testAddress, transferAmount);
    const receipt = await tx.wait();
    
    const senderBalanceAfter = await token.balanceOf(deployer.address);
    const recipientBalanceAfter = await token.balanceOf(testAddress);
    const collectorBalanceAfter = await token.balanceOf(feeCollector);
    
    console.log(`After - Sender: ${ethers.formatEther(senderBalanceAfter)}`);
    console.log(`After - Recipient: ${ethers.formatEther(recipientBalanceAfter)}`);
    console.log(`After - Collector: ${ethers.formatEther(collectorBalanceAfter)}`);
    
    const senderChange = senderBalanceBefore - senderBalanceAfter;
    const recipientChange = recipientBalanceAfter - recipientBalanceBefore;
    const collectorChange = collectorBalanceAfter - collectorBalanceBefore;
    
    console.log(`Sender change: ${ethers.formatEther(senderChange)}`);
    console.log(`Recipient change: ${ethers.formatEther(recipientChange)}`);
    console.log(`Collector change: ${ethers.formatEther(collectorChange)}`);
    
    const expectedFee = transferAmount * fee / 10000n;
    console.log(`Expected fee: ${ethers.formatEther(expectedFee)}`);
    
    if (collectorChange < 0) {
      console.log("🚨 CRITICAL BUG: Collector is losing tokens instead of gaining them!");
      console.log("This suggests a bug in the fee calculation logic.");
    }
    
    console.log(`Gas used: ${receipt?.gasUsed.toString()}`);
    
  } catch (error) {
    console.error("❌ Debug failed:", error);
  }
}

main().catch(console.error);
