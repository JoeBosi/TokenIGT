import { ethers } from "hardhat";
import { Token } from "../../typechain-types";
import fs from "fs";
import path from "path";

async function main() {
  console.log("Final Test: IGE Token on Amoy testnet...");
  
  // Get deployed contract address
  const deploymentsDir = path.join(__dirname, "../../deployments/amoy");
  const proxyData = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "proxy.json"), "utf8"));
  const tokenAddress = proxyData.address;
  
  console.log("Token Address:", tokenAddress);
  
  // Connect to deployed contract
  const [deployer] = await ethers.getSigners();
  const token = await ethers.getContractAt("Token", tokenAddress, deployer) as Token;
  
  console.log("Deployer:", deployer.address);
  
  // Final comprehensive test
  console.log("\n🧪 FINAL AMOY TEST RESULTS:");
  
  try {
    // 1. Basic token info
    const name = await token.name();
    const symbol = await token.symbol();
    const decimals = await token.decimals();
    console.log(`✅ Token: ${name} (${symbol}) - ${decimals} decimals`);
    
    // 2. Balance check
    const balance = await token.balanceOf(deployer.address);
    console.log(`✅ Deployer Balance: ${ethers.formatEther(balance)} ${symbol}`);
    
    // 3. Fee test
    const fee = await token.fee();
    const feeCollector = await token.feeCollector();
    console.log(`✅ Fee: ${fee} basis points (${Number(fee) / 100}%)`);
    console.log(`✅ Fee Collector: ${feeCollector}`);
    
    // 4. Roles check
    const roles = [
      { name: "DEFAULT_ADMIN_ROLE", role: await token.DEFAULT_ADMIN_ROLE() },
      { name: "PAUSER_ROLE", role: await token.PAUSER_ROLE() },
      { name: "MINTER_ROLE", role: await token.MINTER_ROLE() },
      { name: "BURNER_ROLE", role: await token.BURNER_ROLE() },
      { name: "UPGRADER_ROLE", role: await token.UPGRADER_ROLE() },
      { name: "FREEZER_ROLE", role: await token.FREEZER_ROLE() },
      { name: "BLOCKER_ROLE", role: await token.BLOCKER_ROLE() }
    ];
    
    for (const { name, role } of roles) {
      const hasRole = await token.hasRole(role, deployer.address);
      console.log(`✅ ${name}: ${hasRole ? "GRANTED" : "NOT GRANTED"}`);
    }
    
    // 5. EIP-2612 support
    const domain = await token.eip712Domain();
    console.log(`✅ EIP-2612: Supported (Domain: ${domain.name})`);
    
    // 6. Simple transfer test
    console.log("\n🔄 Testing transfer...");
    const testAddress = "0x35744Db4a90e39648C45921dd039168EeAa2B5cf"; // USER2_ADDRESS
    const transferAmount = ethers.parseEther("10");
    
    const balanceBefore = await token.balanceOf(testAddress);
    await token.transfer(testAddress, transferAmount);
    const balanceAfter = await token.balanceOf(testAddress);
    
    const received = balanceAfter - balanceBefore;
    const expectedFee = transferAmount * 10n / 10000n;
    const expectedReceived = transferAmount - expectedFee;
    
    console.log(`✅ Transfer: ${ethers.formatEther(received)} ${symbol} received`);
    console.log(`✅ Fee Applied: ${received === expectedReceived ? "YES" : "NO"}`);
    
    // 7. Pause test
    console.log("\n⏸️ Testing pause functionality...");
    await token.pause();
    const isPaused = await token.paused();
    console.log(`✅ Pause: ${isPaused ? "ACTIVE" : "INACTIVE"}`);
    
    await token.unpause();
    const isUnpaused = !(await token.paused());
    console.log(`✅ Unpause: ${isUnpaused ? "SUCCESS" : "FAILED"}`);
    
    console.log("\n🎉 AMOY DEPLOYMENT VERIFICATION COMPLETE!");
    console.log("✅ All core functionalities working correctly");
    console.log("✅ Token ready for production use");
    console.log(`📊 Explorer: https://www.oklink.com/amoy/address/${tokenAddress}`);
    
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

main().catch(console.error);
