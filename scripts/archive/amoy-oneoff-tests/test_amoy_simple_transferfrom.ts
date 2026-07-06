import { ethers } from "hardhat";
import { Token } from "../../typechain-types";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔍 SIMPLE TEST: TransferFrom After Upgrade - Amoy");
  
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
    // Check version to confirm upgrade
    const version = await token.version();
    console.log("Contract Version:", version);
    
    // Check balance
    const balance = await token.balanceOf(deployer.address);
    console.log("Deployer Balance:", ethers.formatEther(balance), "IGT");
    
    // Test 1: Simple approval
    console.log("\n📝 Step 1: Simple Approval");
    const approveAmount = ethers.parseEther("50");
    await token.approve(deployer.address, approveAmount);
    
    const allowance = await token.allowance(deployer.address, deployer.address);
    console.log("Allowance:", ethers.formatEther(allowance), "IGT");
    
    // Test 2: Self transferFrom (should work)
    console.log("\n🔄 Step 2: Self TransferFrom");
    const transferAmount = ethers.parseEther("10");
    
    try {
      const balanceBefore = await token.balanceOf(deployer.address);
      const tx = await token.transferFrom(deployer.address, deployer.address, transferAmount);
      const receipt = await tx.wait();
      
      console.log("✅ Self TransferFrom TX:", tx.hash);
      console.log("✅ Gas Used:", receipt?.gasUsed.toString());
      
      const balanceAfter = await token.balanceOf(deployer.address);
      const balanceChange = balanceAfter - balanceBefore;
      
      console.log("Balance Change:", ethers.formatEther(balanceChange), "IGT");
      console.log("Expected: 0 IGT (self transfer should net to zero)");
      
    } catch (error) {
      console.error("❌ Self TransferFrom failed:", error);
    }
    
    // Test 3: Transfer to external address
    console.log("\n🔄 Step 3: Transfer to External");
    const externalAddress = "0xB15a4A995050b5DdE912c1a948fF49b2a2E7d615";
    
    try {
      const externalBalanceBefore = await token.balanceOf(externalAddress);
      const tx = await token.transferFrom(deployer.address, externalAddress, transferAmount);
      const receipt = await tx.wait();
      
      console.log("✅ External TransferFrom TX:", tx.hash);
      console.log("✅ Gas Used:", receipt?.gasUsed.toString());
      
      const externalBalanceAfter = await token.balanceOf(externalAddress);
      const received = externalBalanceAfter - externalBalanceBefore;
      
      console.log("Received:", ethers.formatEther(received), "IGT");
      
      const expectedFee = transferAmount * 10n / 10000n;
      const expectedReceived = transferAmount - expectedFee;
      
      console.log("Expected:", ethers.formatEther(expectedReceived), "IGT");
      console.log("Success:", received === expectedReceived ? "YES" : "NO");
      
    } catch (error) {
      console.error("❌ External TransferFrom failed:", error);
      
      // Try with direct transfer for comparison
      console.log("\n🔄 Comparison: Direct Transfer");
      try {
        const directTx = await token.transfer(externalAddress, transferAmount);
        const directReceipt = await directTx.wait();
        
        console.log("✅ Direct Transfer TX:", directTx.hash);
        console.log("✅ Direct Transfer works!");
        
      } catch (directError) {
        console.error("❌ Direct Transfer also failed:", directError);
      }
    }
    
  } catch (error) {
    console.error("❌ Simple test failed:", error);
  }
}

main().catch(console.error);
