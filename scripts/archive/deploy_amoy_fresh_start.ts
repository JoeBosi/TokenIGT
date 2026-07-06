import { ethers, upgrades } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🚀 FRESH START: Deploy New Token on Amoy with Corrected Code");
  console.log("==========================================================");
  
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Configuration from .env
  const tokenName = process.env.TOKEN_NAME || "IGE Token Fresh";
  const tokenSymbol = process.env.TOKEN_SYMBOL || "IGT-F";
  const initialSupply = ethers.parseEther(process.env.INITIAL_SUPPLY || "10000");
  const initialHolder = process.env.INITIAL_HOLDER_ADDRESS || deployer.address;
  const initialFee = BigInt(process.env.TRANSACTION_FEE_BASIS_POINTS || "10");
  const feeCollector = process.env.FEE_COLLECTOR_ADDRESS || deployer.address;
  const defaultAdmin = process.env.DEFAULT_ADMIN_ADDRESS || deployer.address;

  console.log("Configuration:");
  console.log("- Name:", tokenName);
  console.log("- Symbol:", tokenSymbol);
  console.log("- Initial Supply:", ethers.formatEther(initialSupply), "tokens");
  console.log("- Initial Holder:", initialHolder);
  console.log("- Initial Fee:", initialFee.toString(), "basis points");
  console.log("- Fee Collector:", feeCollector);
  console.log("- Default Admin:", defaultAdmin);

  try {
    // Deploy the token with all corrections
    console.log("\n🔧 Deploying new token with corrected code...");
    const TokenFactory = await ethers.getContractFactory("Token");
    const token = await upgrades.deployProxy(
      TokenFactory,
      [tokenName, tokenSymbol, initialSupply, initialHolder, initialFee, feeCollector, defaultAdmin],
      { kind: "uups" }
    );

    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(tokenAddress);

    console.log("\n✅ Fresh Token deployed successfully!");
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

    // Save deploy info
    const deploymentsDir = path.join(__dirname, "../../deployments/amoy-fresh");
    if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

    fs.writeFileSync(path.join(deploymentsDir, "proxy.json"), JSON.stringify({ address: tokenAddress }, null, 2));
    fs.writeFileSync(path.join(deploymentsDir, "implementation.json"), JSON.stringify({ address: implementationAddress }, null, 2));

    // Save to abi/ folder
    const abiDir = path.join(__dirname, "../../abi");
    if (!fs.existsSync(abiDir)) fs.mkdirSync(abiDir, { recursive: true });

    // Save deploy info
    const deployInfo = {
      network: "amoy-fresh",
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
      constructorArgs: [tokenName, tokenSymbol, initialSupply.toString(), initialHolder, initialFee.toString(), feeCollector, defaultAdmin],
      explorer: `https://amoy.polygonscan.com/address/${tokenAddress}`,
      version: version,
      status: "fresh-deployment-with-fixes"
    };

    fs.writeFileSync(path.join(abiDir, "deploy-amoy-fresh.json"), JSON.stringify(deployInfo, null, 2));

    console.log("\n✅ Fresh deployment completed!");
    console.log("📊 Explorer:", `https://amoy.polygonscan.com/address/${tokenAddress}`);
    console.log("🔗 Deploy info saved to abi/deploy-amoy-fresh.json");
    console.log("📁 Deployments saved to deployments/amoy-fresh/");
    
    console.log("\n🎯 Ready for comprehensive testing!");
    
  } catch (error) {
    console.error("❌ Fresh deployment failed:", error);
  }
}

main().catch(console.error);
