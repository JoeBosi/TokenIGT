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

  // Save complete deploy info to abi/ folder
  const abiDir = path.join(__dirname, "../../abi");
  if (!fs.existsSync(abiDir)) {
    fs.mkdirSync(abiDir, { recursive: true });
  }

  // Get contract artifacts for ABI
  const TokenArtifact = await ethers.getContractFactory("Token");
  const TokenV2Artifact = await ethers.getContractFactory("TokenV2");
  const TokenV3Artifact = await ethers.getContractFactory("TokenV3");
  const ERC1967ProxyArtifact = await ethers.getContractFactory("@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy");

  // Save ABIs
  fs.writeFileSync(path.join(abiDir, "Token.json"), JSON.stringify(TokenArtifact.interface.formatJson(), null, 2));
  fs.writeFileSync(path.join(abiDir, "TokenV2.json"), JSON.stringify(TokenV2Artifact.interface.formatJson(), null, 2));
  fs.writeFileSync(path.join(abiDir, "TokenV3.json"), JSON.stringify(TokenV3Artifact.interface.formatJson(), null, 2));
  fs.writeFileSync(path.join(abiDir, "ERC1967Proxy.json"), JSON.stringify(ERC1967ProxyArtifact.interface.formatJson(), null, 2));

  // Save complete deploy info for local
  const deployInfo = {
    network: "local",
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
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
    explorer: "Local network - no explorer available"
  };

  fs.writeFileSync(path.join(abiDir, "deploy-local.json"), JSON.stringify(deployInfo, null, 2));

  console.log("✅ Deploy info saved to abi/ folder");
  console.log("📄 All ABIs saved to abi/ folder");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
