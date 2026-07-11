import { ethers, upgrades, network } from "hardhat";
import fs from "fs";
import path from "path";

const AMOY_CHAIN_ID = 80002n;

/**
 * Deploy FRESCO del Token su Amoy testnet (UUPS proxy).
 * Parametri letti da .env; vedi .env.example per la lista completa.
 */
async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== AMOY_CHAIN_ID) {
    throw new Error(`Rete sbagliata: connesso a chainId ${chainId}, atteso Amoy (${AMOY_CHAIN_ID})`);
  }

  console.log("Deploying IGE Token to Amoy testnet...");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const tokenName = process.env.TOKEN_NAME || "IGE Token";
  const tokenSymbol = process.env.TOKEN_SYMBOL || "IGT";
  const initialSupply = process.env.INITIAL_SUPPLY || "10000000000000000000000";
  const initialHolder = process.env.INITIAL_HOLDER_ADDRESS || deployer.address;
  const transferFeeBps = process.env.TRANSFER_FEE_BASIS_POINTS || "1";
  const feeCollector = process.env.FEE_COLLECTOR_ADDRESS || deployer.address;
  const custodyFeeBps = process.env.CUSTODY_FEE_BASIS_POINTS || "50";
  const custodyTreasury = process.env.CUSTODY_TREASURY_ADDRESS || feeCollector;
  const defaultAdmin = process.env.DEFAULT_ADMIN_ADDRESS || deployer.address;
  const adminTransferDelay = process.env.ADMIN_TRANSFER_DELAY_SECONDS || String(3 * 24 * 60 * 60); // 3 giorni

  if (Number(transferFeeBps) > 100) throw new Error("TRANSFER_FEE_BASIS_POINTS > 100 (cap contrattuale)");
  if (Number(custodyFeeBps) > 200) throw new Error("CUSTODY_FEE_BASIS_POINTS > 200 (cap contrattuale)");
  if (feeCollector.toLowerCase() === custodyTreasury.toLowerCase()) {
    console.warn("⚠️  FEE_COLLECTOR_ADDRESS == CUSTODY_TREASURY_ADDRESS: la fee di scambio non sarà osservabile se coincide col mittente (vedi AMOY_TEST_REPORT.md).");
  }

  const initArgs = [
    tokenName,
    tokenSymbol,
    initialSupply,
    initialHolder,
    transferFeeBps,
    feeCollector,
    custodyFeeBps,
    custodyTreasury,
    defaultAdmin,
    adminTransferDelay,
  ];

  console.log("Initialize args:", initArgs);

  const TokenFactory = await ethers.getContractFactory("Token");
  const token = await upgrades.deployProxy(TokenFactory, initArgs, { kind: "uups" });

  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(tokenAddress);

  const deployedVersion = await token.version();
  console.log("Proxy:", tokenAddress);
  console.log("Implementation:", implementationAddress);
  console.log("Version:", deployedVersion);

  // Save to deployments/amoy
  const deploymentsDir = path.join(__dirname, "../../deployments/amoy");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  fs.writeFileSync(path.join(deploymentsDir, "proxy.json"), JSON.stringify({ address: tokenAddress }, null, 2));
  fs.writeFileSync(
    path.join(deploymentsDir, "implementation.json"),
    JSON.stringify({ address: implementationAddress }, null, 2)
  );

  // Save ABIs
  const abiDir = path.join(__dirname, "../../abi");
  if (!fs.existsSync(abiDir)) fs.mkdirSync(abiDir, { recursive: true });
  fs.writeFileSync(path.join(abiDir, "Token.json"), JSON.stringify(TokenFactory.interface.formatJson(), null, 2));

  const deployTx = token.deploymentTransaction();
  const deployBlock = deployTx ? (await deployTx.wait())?.blockNumber : undefined;

  const deployInfo = {
    network: "amoy",
    chainId: 80002,
    version: deployedVersion,
    deployer: deployer.address,
    deployBlock,
    timestamp: new Date().toISOString(),
    contracts: {
      Token: {
        proxy: tokenAddress,
        implementation: implementationAddress,
        type: "UUPS",
      },
    },
    initializeArgs: initArgs,
    explorer: `https://amoy.polygonscan.com/address/${tokenAddress}`,
  };

  fs.writeFileSync(path.join(deploymentsDir, "deploy-info.json"), JSON.stringify(deployInfo, null, 2));

  console.log("✅ Deploy info saved to deployments/amoy/");
  console.log(`📊 Explorer: ${deployInfo.explorer}`);
  console.log("\nProssimi passi:");
  console.log(`  1. Aggiorna PROXY_ADDRESS=${tokenAddress} e IMPLEMENTATION_ADDRESS=${implementationAddress} in .env`);
  console.log("  2. pnpm hardhat run scripts/roles/grant_roles.ts --network amoy");
  console.log("  3. pnpm hardhat run scripts/deploy/verify.ts --network amoy");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
