import { ethers, upgrades } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("Deploying IGE Token to Amoy testnet...");
  
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const tokenName = process.env.TOKEN_NAME || "IGE Token";
  const tokenSymbol = process.env.TOKEN_SYMBOL || "IGT";
  const initialSupply = process.env.INITIAL_SUPPLY || "10000000000000000000000";
  const initialHolder = process.env.INITIAL_HOLDER_ADDRESS || deployer.address;
  const initialFee = process.env.TRANSACTION_FEE_BASIS_POINTS || "10";
  const feeCollector = process.env.FEE_COLLECTOR_ADDRESS || deployer.address;
  const defaultAdmin = process.env.DEFAULT_ADMIN_ADDRESS || deployer.address;

  const TokenFactory = await ethers.getContractFactory("Token");
  const token = await upgrades.deployProxy(
    TokenFactory,
    [tokenName, tokenSymbol, initialSupply, initialHolder, initialFee, feeCollector, defaultAdmin],
    { kind: "uups" }
  );

  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(tokenAddress);

  console.log("Proxy:", tokenAddress);
  console.log("Implementation:", implementationAddress);

  // Save to deployments/amoy
  const deploymentsDir = path.join(__dirname, "../../deployments/amoy");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  fs.writeFileSync(path.join(deploymentsDir, "proxy.json"), JSON.stringify({ address: tokenAddress }, null, 2));
  fs.writeFileSync(path.join(deploymentsDir, "implementation.json"), JSON.stringify({ address: implementationAddress }, null, 2));

  // Save to abi/ folder with complete deploy info
  const abiDir = path.join(__dirname, "../../abi");
  if (!fs.existsSync(abiDir)) fs.mkdirSync(abiDir, { recursive: true });

  // Get contract artifacts for ABI
  const TokenArtifact = await ethers.getContractFactory("Token");
  const TokenV2Artifact = await ethers.getContractFactory("TokenV2");
  const TokenV3Artifact = await ethers.getContractFactory("TokenV3");

  // Save ABIs
  fs.writeFileSync(path.join(abiDir, "Token.json"), JSON.stringify(TokenArtifact.interface.formatJson(), null, 2));
  fs.writeFileSync(path.join(abiDir, "TokenV2.json"), JSON.stringify(TokenV2Artifact.interface.formatJson(), null, 2));
  fs.writeFileSync(path.join(abiDir, "TokenV3.json"), JSON.stringify(TokenV3Artifact.interface.formatJson(), null, 2));

  // Save ERC1967Proxy ABI from OpenZeppelin (standard proxy ABI)
  const proxyABI = [
    "function admin() external view returns (address)",
    "function implementation() external view returns (address)",
    "function upgradeTo(address newImplementation) external",
    "function upgradeToAndCall(address newImplementation, bytes data) external payable"
  ];
  fs.writeFileSync(path.join(abiDir, "ERC1967Proxy.json"), JSON.stringify(proxyABI, null, 2));

  // Save complete deploy info for Amoy
  const deployInfo = {
    network: "amoy",
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
    constructorArgs: [
      process.env.TOKEN_NAME || "IGE Token",
      process.env.TOKEN_SYMBOL || "IGT",
      process.env.INITIAL_SUPPLY || "10000000000000000000000",
      process.env.INITIAL_HOLDER_ADDRESS || deployer.address,
      process.env.TRANSACTION_FEE_BASIS_POINTS || "10",
      process.env.FEE_COLLECTOR_ADDRESS || deployer.address,
      process.env.DEFAULT_ADMIN_ADDRESS || deployer.address
    ],
    explorer: `https://amoy.polygonscan.com/address/${tokenAddress}`
  };

  fs.writeFileSync(path.join(abiDir, "deploy-amoy.json"), JSON.stringify(deployInfo, null, 2));

  console.log("✅ Deploy info saved to abi/ folder");
  console.log(`📊 Explorer: ${deployInfo.explorer}`);
}

main().catch(console.error);
