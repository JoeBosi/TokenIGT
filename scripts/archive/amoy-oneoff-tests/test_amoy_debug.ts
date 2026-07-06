import { ethers } from "hardhat";
import { Token } from "../../typechain-types";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔍 DEBUG: IGE Token on Amoy testnet...");
  
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
    // 1. Check initial state
    console.log("\n📊 INITIAL STATE:");
    const name = await token.name();
    const symbol = await token.symbol();
    const totalSupply = await token.totalSupply();
    const deployerBalance = await token.balanceOf(deployer.address);
    
    console.log(`Name: ${name}`);
    console.log(`Symbol: ${symbol}`);
    console.log(`Total Supply: ${ethers.formatEther(totalSupply)} ${symbol}`);
    console.log(`Deployer Balance: ${ethers.formatEther(deployerBalance)} ${symbol}`);
    
    // 2. Test transfer to deployer himself (should work)
    console.log("\n🔄 TEST 1: Transfer to self");
    const transferAmount = ethers.parseEther("10");
    
    try {
      const balanceBefore = await token.balanceOf(deployer.address);
      console.log(`Balance Before: ${ethers.formatEther(balanceBefore)} ${symbol}`);
      
      const tx = await token.transfer(deployer.address, transferAmount);
      console.log(`Transfer TX Hash: ${tx.hash}`);
      
      const receipt = await tx.wait();
      console.log(`Transfer Confirmed: ${receipt?.hash}`);
      
      const balanceAfter = await token.balanceOf(deployer.address);
      console.log(`Balance After: ${ethers.formatEther(balanceAfter)} ${symbol}`);
      
      const balanceChange = balanceAfter - balanceBefore;
      const expectedFee = transferAmount * 10n / 10000n;
      const expectedReceived = transferAmount - expectedFee;
      
      console.log(`Balance Change: ${ethers.formatEther(balanceChange)} ${symbol}`);
      console.log(`Expected Fee: ${ethers.formatEther(expectedFee)} ${symbol}`);
      console.log(`Expected Received: ${ethers.formatEther(expectedReceived)} ${symbol}`);
      console.log(`Transfer Success: ${balanceChange === expectedReceived ? "YES" : "NO"}`);
      
    } catch (error) {
      console.error("❌ Transfer to self failed:", error);
    }
    
    // 3. Test transfer to external address
    console.log("\n🔄 TEST 2: Transfer to external address");
    const externalAddress = "0xB15a4A995050b5DdE912c1a948fF49b2a2E7d615";
    
    try {
      const balanceBefore = await token.balanceOf(externalAddress);
      console.log(`External Balance Before: ${ethers.formatEther(balanceBefore)} ${symbol}`);
      
      const tx = await token.transfer(externalAddress, transferAmount);
      console.log(`Transfer TX Hash: ${tx.hash}`);
      
      const receipt = await tx.wait();
      console.log(`Transfer Confirmed: ${receipt?.hash}`);
      
      const balanceAfter = await token.balanceOf(externalAddress);
      console.log(`External Balance After: ${ethers.formatEther(balanceAfter)} ${symbol}`);
      
      const balanceChange = balanceAfter - balanceBefore;
      console.log(`Balance Change: ${ethers.formatEther(balanceChange)} ${symbol}`);
      console.log(`Transfer Success: ${balanceChange > 0 ? "YES" : "NO"}`);
      
    } catch (error) {
      console.error("❌ Transfer to external failed:", error);
    }
    
    // 4. Test mint
    console.log("\n🪙 TEST 3: Mint functionality");
    const mintAmount = ethers.parseEther("100");
    const mintRecipient = "0x35744Db4a90e39648C45921dd039168EeAa2B5cf";
    
    try {
      const totalSupplyBefore = await token.totalSupply();
      const recipientBalanceBefore = await token.balanceOf(mintRecipient);
      
      console.log(`Total Supply Before: ${ethers.formatEther(totalSupplyBefore)} ${symbol}`);
      console.log(`Recipient Balance Before: ${ethers.formatEther(recipientBalanceBefore)} ${symbol}`);
      
      const tx = await token.mint(mintRecipient, mintAmount);
      console.log(`Mint TX Hash: ${tx.hash}`);
      
      const receipt = await tx.wait();
      console.log(`Mint Confirmed: ${receipt?.hash}`);
      
      const totalSupplyAfter = await token.totalSupply();
      const recipientBalanceAfter = await token.balanceOf(mintRecipient);
      
      console.log(`Total Supply After: ${ethers.formatEther(totalSupplyAfter)} ${symbol}`);
      console.log(`Recipient Balance After: ${ethers.formatEther(recipientBalanceAfter)} ${symbol}`);
      
      const supplyChange = totalSupplyAfter - totalSupplyBefore;
      const recipientChange = recipientBalanceAfter - recipientBalanceBefore;
      
      console.log(`Supply Change: ${ethers.formatEther(supplyChange)} ${symbol}`);
      console.log(`Recipient Change: ${ethers.formatEther(recipientChange)} ${symbol}`);
      console.log(`Mint Success: ${supplyChange === mintAmount && recipientChange === mintAmount ? "YES" : "NO"}`);
      
    } catch (error) {
      console.error("❌ Mint failed:", error);
    }
    
    // 5. Test pause/unpause
    console.log("\n⏸️ TEST 4: Pause/Unpause");
    
    try {
      await token.pause();
      const isPaused = await token.paused();
      console.log(`Pause Success: ${isPaused ? "YES" : "NO"}`);
      
      await token.unpause();
      const isUnpaused = !(await token.paused());
      console.log(`Unpause Success: ${isUnpaused ? "YES" : "NO"}`);
      
    } catch (error) {
      console.error("❌ Pause/Unpause failed:", error);
    }
    
    console.log("\n🎉 DEBUG TEST COMPLETE!");
    
  } catch (error) {
    console.error("❌ Debug test failed:", error);
  }
}

main().catch(console.error);
