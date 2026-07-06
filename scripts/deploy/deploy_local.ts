import { ethers, upgrades } from "hardhat";
import fs from "fs";
import path from "path";

/**
 * Deploy locale del Token v2.0.0 (UUPS proxy) per sviluppo e smoke test.
 */
async function main() {
  console.log("Deploying IGE Token v2.0.0 to local network...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const tokenName = process.env.TOKEN_NAME || "IGE Token";
  const tokenSymbol = process.env.TOKEN_SYMBOL || "IGT";
  const initialSupply = process.env.INITIAL_SUPPLY || "10000000000000000000000"; // 10,000 tokens
  const initialHolder = process.env.INITIAL_HOLDER_ADDRESS || deployer.address;
  const transferFeeBps = process.env.TRANSFER_FEE_BASIS_POINTS || process.env.TRANSACTION_FEE_BASIS_POINTS || "1";
  const feeCollector = process.env.FEE_COLLECTOR_ADDRESS || deployer.address;
  const custodyFeeBps = process.env.CUSTODY_FEE_BASIS_POINTS || "50";
  const custodyTreasury = process.env.CUSTODY_TREASURY_ADDRESS || feeCollector;
  const defaultAdmin = process.env.DEFAULT_ADMIN_ADDRESS || deployer.address;

  console.log("Configuration:");
  console.log("- Name:", tokenName);
  console.log("- Symbol:", tokenSymbol);
  console.log("- Initial Supply:", ethers.formatEther(initialSupply), "tokens");
  console.log("- Initial Holder:", initialHolder);
  console.log("- Transfer Fee:", transferFeeBps, "bps");
  console.log("- Fee Collector:", feeCollector);
  console.log("- Custody Fee:", custodyFeeBps, "bps");
  console.log("- Custody Treasury:", custodyTreasury);
  console.log("- Default Admin:", defaultAdmin);

  const Token = await ethers.getContractFactory("Token");
  const token = await upgrades.deployProxy(
    Token,
    [
      tokenName,
      tokenSymbol,
      initialSupply,
      initialHolder,
      transferFeeBps,
      feeCollector,
      custodyFeeBps,
      custodyTreasury,
      defaultAdmin,
    ],
    { kind: "uups" }
  );

  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(tokenAddress);

  console.log("\n✅ Token deployed successfully!");
  console.log("- Proxy Address:", tokenAddress);
  console.log("- Implementation Address:", implementationAddress);

  console.log("\nToken Details:");
  console.log("- Name:", await token.name());
  console.log("- Symbol:", await token.symbol());
  console.log("- Total Supply:", ethers.formatEther(await token.totalSupply()), "tokens");
  console.log("- Transfer Fee:", (await token.transferFeeBps()).toString(), "bps");
  console.log("- Custody Fee:", (await token.custodyFeeBps()).toString(), "bps");
  console.log("- Custody Cycle:", (await token.currentCycle()).toString());
  console.log("- Version:", await token.version());

  // Save deployment information
  const deploymentsDir = path.join(__dirname, "../../deployments/local");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  fs.writeFileSync(path.join(deploymentsDir, "proxy.json"), JSON.stringify({ address: tokenAddress }, null, 2));
  fs.writeFileSync(
    path.join(deploymentsDir, "implementation.json"),
    JSON.stringify({ address: implementationAddress }, null, 2)
  );

  const rolesInfo = {
    DEFAULT_ADMIN_ROLE: await token.DEFAULT_ADMIN_ROLE(),
    UPGRADER_ROLE: await token.UPGRADER_ROLE(),
    PAUSER_ROLE: await token.PAUSER_ROLE(),
    MINTER_ROLE: await token.MINTER_ROLE(),
    BURNER_ROLE: await token.BURNER_ROLE(),
    FREEZER_ROLE: await token.FREEZER_ROLE(),
    BLOCKER_ROLE: await token.BLOCKER_ROLE(),
    FEE_MANAGER_ROLE: await token.FEE_MANAGER_ROLE(),
    RECOVERER_ROLE: await token.RECOVERER_ROLE(),
    assignments: {
      DEFAULT_ADMIN_ROLE: defaultAdmin,
      UPGRADER_ROLE: defaultAdmin,
      FEE_MANAGER_ROLE: defaultAdmin,
      RECOVERER_ROLE: defaultAdmin,
    },
  };

  fs.writeFileSync(path.join(deploymentsDir, "roles.json"), JSON.stringify(rolesInfo, null, 2));

  const deploymentInfo = {
    network: "local",
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    version: "2.0.0",
    proxy: tokenAddress,
    implementation: implementationAddress,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    config: {
      name: tokenName,
      symbol: tokenSymbol,
      initialSupply,
      initialHolder,
      transferFeeBps,
      feeCollector,
      custodyFeeBps,
      custodyTreasury,
      defaultAdmin,
    },
  };

  fs.writeFileSync(path.join(deploymentsDir, "deployment.json"), JSON.stringify(deploymentInfo, null, 2));

  console.log("\n📝 Deployment information saved to deployments/local/");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
