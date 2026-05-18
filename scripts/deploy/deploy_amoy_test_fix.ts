import { ethers, upgrades } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🧪 TEST DEPLOY: Comprehensive Fixes on Amoy");
  console.log("===========================================");
  
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const tokenName = process.env.TOKEN_NAME || "IGE Token Test";
  const tokenSymbol = process.env.TOKEN_SYMBOL || "IGT-T";
  const initialSupply = process.env.INITIAL_SUPPLY || "1000000000000000000000"; // 1,000 tokens for testing
  const initialHolder = process.env.INITIAL_HOLDER_ADDRESS || deployer.address;
  const initialFee = process.env.TRANSACTION_FEE_BASIS_POINTS || "10";
  const feeCollector = process.env.FEE_COLLECTOR_ADDRESS || deployer.address;
  const defaultAdmin = process.env.DEFAULT_ADMIN_ADDRESS || deployer.address;

  console.log("Configuration:");
  console.log("- Name:", tokenName);
  console.log("- Symbol:", tokenSymbol);
  console.log("- Initial Supply:", ethers.formatEther(initialSupply), "tokens");
  console.log("- Initial Holder:", initialHolder);
  console.log("- Initial Fee:", initialFee, "basis points");
  console.log("- Fee Collector:", feeCollector);
  console.log("- Default Admin:", defaultAdmin);

  try {
    // Deploy the token with comprehensive fixes
    const TokenFactory = await ethers.getContractFactory("Token");
    const token = await upgrades.deployProxy(
      TokenFactory,
      [tokenName, tokenSymbol, initialSupply, initialHolder, initialFee, feeCollector, defaultAdmin],
      { kind: "uups" }
    );

    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(tokenAddress);

    console.log("\n✅ Test Token deployed successfully!");
    console.log("- Proxy Address:", tokenAddress);
    console.log("- Implementation Address:", implementationAddress);

    // Verify deployment
    const name = await token.name();
    const symbol = await token.symbol();
    const totalSupply = await token.totalSupply();
    const fee = await token.fee();
    const version = await token.version();

    console.log("\nToken Details:");
    console.log("- Name:", name);
    console.log("- Symbol:", symbol);
    console.log("- Total Supply:", ethers.formatEther(totalSupply), "tokens");
    console.log("- Fee:", fee.toString(), "basis points");
    console.log("- Version:", version);

    // Test all fixed functionality
    console.log("\n🧪 Testing Comprehensive Fixes...");
    
    // Test 1: Freeze System
    console.log("\n❄️ Testing Freeze System...");
    try {
      const testAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
      
      await token.freeze(testAddress, ethers.parseEther("5"));
      const isFrozen = await token.isFrozen(testAddress);
      console.log(`Freeze Success: ${isFrozen ? "✅ YES" : "❌ NO"}`);
      
      if (isFrozen) {
        await token.unfreeze(testAddress);
        const isUnfrozen = !(await token.isFrozen(testAddress));
        console.log(`Unfreeze Success: ${isUnfrozen ? "✅ YES" : "❌ NO"}`);
      }
      
    } catch (error) {
      console.error("❌ Freeze test failed:", error);
    }
    
    // Test 2: Block System
    console.log("\n🚫 Testing Block System...");
    try {
      const testAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
      
      await token.block(testAddress);
      const isBlocked = await token.isBlocked(testAddress);
      console.log(`Block Success: ${isBlocked ? "✅ YES" : "❌ NO"}`);
      
      if (isBlocked) {
        await token.unblock(testAddress);
        const isUnblocked = !(await token.isBlocked(testAddress));
        console.log(`Unblock Success: ${isUnblocked ? "✅ YES" : "❌ NO"}`);
      }
      
    } catch (error) {
      console.error("❌ Block test failed:", error);
    }
    
    // Test 3: Mint System
    console.log("\n🪙 Testing Mint System...");
    try {
      const mintAmount = ethers.parseEther("25");
      const mintRecipient = "0x35744Db4a90e39648C45921dd039168EeAa2B5cf";
      
      const supplyBefore = await token.totalSupply();
      await token.mint(mintRecipient, mintAmount);
      const supplyAfter = await token.totalSupply();
      
      const supplyChange = supplyAfter - supplyBefore;
      console.log(`Mint Success: ${supplyChange === mintAmount ? "✅ YES" : "❌ NO"}`);
      console.log(`Expected: ${ethers.formatEther(mintAmount)}, Actual: ${ethers.formatEther(supplyChange)}`);
      
    } catch (error) {
      console.error("❌ Mint test failed:", error);
    }
    
    // Test 4: Burn System
    console.log("\n🔥 Testing Burn System...");
    try {
      const burnAmount = ethers.parseEther("10");
      
      const deployerBalanceBefore = await token.balanceOf(deployer.address);
      await token.burn(deployer.address, burnAmount);
      const deployerBalanceAfter = await token.balanceOf(deployer.address);
      
      const balanceChange = deployerBalanceBefore - deployerBalanceAfter;
      console.log(`Burn Success: ${balanceChange === burnAmount ? "✅ YES" : "❌ NO"}`);
      console.log(`Expected: ${ethers.formatEther(burnAmount)}, Actual: ${ethers.formatEther(balanceChange)}`);
      
    } catch (error) {
      console.error("❌ Burn test failed:", error);
    }
    
    // Test 5: Role System
    console.log("\n👥 Testing Role System...");
    try {
      const FEE_ADMIN_ROLE = await token.FEE_ADMIN_ROLE();
      const hasFeeAdminRole = await token.hasRole(FEE_ADMIN_ROLE, deployer.address);
      
      const RECOVERER_ROLE = await token.RECOVERER_ROLE();
      const hasRecovererRole = await token.hasRole(RECOVERER_ROLE, deployer.address);
      
      console.log(`FEE_ADMIN_ROLE: ${hasFeeAdminRole ? "✅ GRANTED" : "❌ NOT GRANTED"}`);
      console.log(`RECOVERER_ROLE: ${hasRecovererRole ? "✅ GRANTED" : "❌ NOT GRANTED"}`);
      
    } catch (error) {
      console.error("❌ Role test failed:", error);
    }
    
    // Test 6: Fee System
    console.log("\n💰 Testing Fee System...");
    try {
      const testAddress = "0xB15a4A995050b5DdE912c1a948fF49b2a2E7d615";
      const transferAmount = ethers.parseEther("15");
      
      const balanceBefore = await token.balanceOf(testAddress);
      await token.transfer(testAddress, transferAmount);
      const balanceAfter = await token.balanceOf(testAddress);
      
      const received = balanceAfter - balanceBefore;
      const fee = await token.fee();
      const expectedFee = transferAmount * fee / 10000n;
      const expectedReceived = transferAmount - expectedFee;
      
      const feeWorking = received === expectedReceived;
      console.log(`Fee System: ${feeWorking ? "✅ WORKING" : "❌ BROKEN"}`);
      console.log(`Expected: ${ethers.formatEther(expectedReceived)}, Received: ${ethers.formatEther(received)}`);
      
    } catch (error) {
      console.error("❌ Fee test failed:", error);
    }
    
    // Save deploy info
    const deploymentsDir = path.join(__dirname, "../../deployments/amoy-test");
    if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

    fs.writeFileSync(path.join(deploymentsDir, "proxy.json"), JSON.stringify({ address: tokenAddress }, null, 2));
    fs.writeFileSync(path.join(deploymentsDir, "implementation.json"), JSON.stringify({ address: implementationAddress }, null, 2));

    // Save to abi/ folder
    const abiDir = path.join(__dirname, "../../abi");
    if (!fs.existsSync(abiDir)) fs.mkdirSync(abiDir, { recursive: true });

    // Save deploy info for test
    const deployInfo = {
      network: "amoy-test",
      chainId: 80002,
      deployer: deployer.address,
      timestamp: new Date().toISOString(),
      contracts: {
        Token: {
          proxy: tokenAddress,
          implementation: implementationAddress,
          type: "UUPS"
        }
      },
      constructorArgs: [tokenName, tokenSymbol, initialSupply, initialHolder, initialFee, feeCollector, defaultAdmin],
      explorer: `https://amoy.polygonscan.com/address/${tokenAddress}`,
      testResults: "Comprehensive fixes tested"
    };

    fs.writeFileSync(path.join(abiDir, "deploy-amoy-test.json"), JSON.stringify(deployInfo, null, 2));

    console.log("\n✅ Test deployment completed!");
    console.log("📊 Explorer:", `https://amoy.polygonscan.com/address/${tokenAddress}`);
    console.log("🔗 Deploy info saved to abi/deploy-amoy-test.json");
    
  } catch (error) {
    console.error("❌ Test deployment failed:", error);
  }
}

main().catch(console.error);
