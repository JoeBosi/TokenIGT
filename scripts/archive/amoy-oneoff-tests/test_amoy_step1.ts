import { ethers } from "hardhat";
import { Token } from "../../typechain-types";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔍 STEP 1: Basic Connection Test - Amoy");
  
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
    // Test 1: Basic connection
    const name = await token.name();
    const symbol = await token.symbol();
    const totalSupply = await token.totalSupply();
    const deployerBalance = await token.balanceOf(deployer.address);
    
    console.log("✅ Basic Connection Working:");
    console.log(`  Name: ${name}`);
    console.log(`  Symbol: ${symbol}`);
    console.log(`  Total Supply: ${ethers.formatEther(totalSupply)} ${symbol}`);
    console.log(`  Deployer Balance: ${ethers.formatEther(deployerBalance)} ${symbol}`);
    
    // Test 2: Fee configuration
    const fee = await token.fee();
    const feeCollector = await token.feeCollector();
    console.log("✅ Fee Configuration:");
    console.log(`  Fee: ${fee} basis points (${Number(fee)/100}%)`);
    console.log(`  Fee Collector: ${feeCollector}`);
    
    // Test 3: Roles check
    const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
    const hasAdminRole = await token.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
    console.log("✅ Role Check:");
    console.log(`  DEFAULT_ADMIN_ROLE: ${hasAdminRole ? "GRANTED" : "NOT GRANTED"}`);
    
    // Test 4: Simple transfer test
    console.log("\n🔄 Testing Simple Transfer...");
    const testAddress = "0xB15a4A995050b5DdE912c1a948fF49b2a2E7d615";
    const transferAmount = ethers.parseEther("10");
    
    const balanceBefore = await token.balanceOf(testAddress);
    console.log(`  Balance Before: ${ethers.formatEther(balanceBefore)} ${symbol}`);
    
    const tx = await token.transfer(testAddress, transferAmount);
    const receipt = await tx.wait();
    console.log(`  Transfer TX: ${tx.hash}`);
    console.log(`  Gas Used: ${receipt?.gasUsed.toString()}`);
    
    const balanceAfter = await token.balanceOf(testAddress);
    console.log(`  Balance After: ${ethers.formatEther(balanceAfter)} ${symbol}`);
    
    const received = balanceAfter - balanceBefore;
    const expectedFee = transferAmount * 10n / 10000n;
    const expectedReceived = transferAmount - expectedFee;
    
    console.log(`  Received: ${ethers.formatEther(received)} ${symbol}`);
    console.log(`  Expected: ${ethers.formatEther(expectedReceived)} ${symbol}`);
    console.log(`  Fee Applied: ${received === expectedReceived ? "YES" : "NO"}`);
    
    if (received === expectedReceived) {
      console.log("✅ Transfer working correctly with fee!");
    } else {
      console.log("❌ Transfer fee calculation issue detected");
    }
    
  } catch (error) {
    console.error("❌ Step 1 failed:", error);
  }
}

main().catch(console.error);
