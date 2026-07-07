import { ethers, upgrades } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("Deploying IGE Token to Polygon mainnet...");
  
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const defaultAdmin = process.env.DEFAULT_ADMIN_ADDRESS;
  const upgrader = process.env.UPGRADER_ADDRESS;

  if (!defaultAdmin || !upgrader) {
    throw new Error("DEFAULT_ADMIN_ADDRESS and UPGRADER_ADDRESS must be contract addresses on mainnet");
  }

  const tokenName = process.env.TOKEN_NAME || "IGE Token";
  const tokenSymbol = process.env.TOKEN_SYMBOL || "IGT";
  const initialSupply = process.env.INITIAL_SUPPLY || "10000000000000000000000";
  const initialHolder = process.env.INITIAL_HOLDER_ADDRESS || deployer.address;
  const initialFee = process.env.TRANSACTION_FEE_BASIS_POINTS || "10";
  const feeCollector = process.env.FEE_COLLECTOR_ADDRESS || deployer.address;

  const Token = await ethers.getContractFactory("Token");
  const token = await upgrades.deployProxy(
    Token,
    [tokenName, tokenSymbol, initialSupply, initialHolder, initialFee, feeCollector, defaultAdmin],
    { kind: "uups" }
  );

  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(tokenAddress);

  console.log("Proxy:", tokenAddress);
  console.log("Implementation:", implementationAddress);

  const deploymentsDir = path.join(__dirname, "../../deployments/polygon");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  fs.writeFileSync(path.join(deploymentsDir, "proxy.json"), JSON.stringify({ address: tokenAddress }, null, 2));
  fs.writeFileSync(path.join(deploymentsDir, "implementation.json"), JSON.stringify({ address: implementationAddress }, null, 2));
}

main().catch(console.error);
