import { ethers, upgrades } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("Deploying IGE Token to local network...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // Get configuration from environment variables or use defaults
  const tokenName = process.env.TOKEN_NAME || "IGE Token";
  const tokenSymbol = process.env.TOKEN_SYMBOL || "IGT";
  const initialSupply = process.env.INITIAL_SUPPLY || "10000000000000000000000"; // 10,000 tokens
  const initialHolder = process.env.INITIAL_HOLDER_ADDRESS || deployer.address;
  const initialFee = process.env.TRANSACTION_FEE_BASIS_POINTS || "10"; // 0.10%
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

  // Deploy the token with UUPS proxy
  const Token = await ethers.getContractFactory("Token");
  const token = await upgrades.deployProxy(
    Token,
    [tokenName, tokenSymbol, initialSupply, initialHolder, initialFee, feeCollector, defaultAdmin],
    { kind: "uups" }
  );

  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();

  console.log("\n✅ Token deployed successfully!");
  console.log("- Proxy Address:", tokenAddress);

  // Get implementation address
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(tokenAddress);
  console.log("- Implementation Address:", implementationAddress);

  // Verify deployment
  const name = await token.name();
  const symbol = await token.symbol();
  const totalSupply = await token.totalSupply();
  const fee = await token.fee();

  console.log("\nToken Details:");
  console.log("- Name:", name);
  console.log("- Symbol:", symbol);
  console.log("- Total Supply:", ethers.formatEther(totalSupply), "tokens");
  console.log("- Fee:", fee.toString(), "basis points");

  // Save deployment information
  const deploymentsDir = path.join(__dirname, "../../deployments/local");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentInfo = {
    network: "local",
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    proxy: tokenAddress,
    implementation: implementationAddress,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    config: {
      name: tokenName,
      symbol: tokenSymbol,
      initialSupply,
      initialHolder,
      initialFee,
      feeCollector,
      defaultAdmin,
    },
  };

  fs.writeFileSync(
    path.join(deploymentsDir, "proxy.json"),
    JSON.stringify({ address: tokenAddress }, null, 2)
  );

  fs.writeFileSync(
    path.join(deploymentsDir, "implementation.json"),
    JSON.stringify({ address: implementationAddress }, null, 2)
  );

  fs.writeFileSync(
    path.join(deploymentsDir, "deployment.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );

  // Save roles information
  const rolesInfo = {
    DEFAULT_ADMIN_ROLE: await token.DEFAULT_ADMIN_ROLE(),
    UPGRADER_ROLE: await token.UPGRADER_ROLE(),
    PAUSER_ROLE: await token.PAUSER_ROLE(),
    MINTER_ROLE: await token.MINTER_ROLE(),
    BURNER_ROLE: await token.BURNER_ROLE(),
    FREEZER_ROLE: await token.FREEZER_ROLE(),
    BLOCKER_ROLE: await token.BLOCKER_ROLE(),
    FEE_ADMIN_ROLE: await token.FEE_ADMIN_ROLE(),
    RECOVERER_ROLE: await token.RECOVERER_ROLE(),
    assignments: {
      DEFAULT_ADMIN_ROLE: defaultAdmin,
    },
  };

  fs.writeFileSync(
    path.join(deploymentsDir, "roles.json"),
    JSON.stringify(rolesInfo, null, 2)
  );

  console.log("\n📝 Deployment information saved to deployments/local/");

  // Save ABI
  const artifactsDir = path.join(__dirname, "../../artifacts/contracts");
  const abiDir = path.join(__dirname, "../../abi");
  if (!fs.existsSync(abiDir)) {
    fs.mkdirSync(abiDir, { recursive: true });
  }

  const artifact = JSON.parse(
    fs.readFileSync(path.join(artifactsDir, "Token.sol", "Token.json"), "utf8")
  );
  fs.writeFileSync(path.join(abiDir, "Token.json"), JSON.stringify(artifact.abi, null, 2));

  console.log("📄 ABI saved to abi/Token.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
