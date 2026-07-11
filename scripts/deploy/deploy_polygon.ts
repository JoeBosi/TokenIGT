import { ethers, upgrades, network } from "hardhat";
import * as readline from "readline";
import fs from "fs";
import path from "path";

const POLYGON_CHAIN_ID = 137n;

function askConfirmation(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer);
  }));
}

/**
 * Deploy del Token su Polygon MAINNET (UUPS proxy).
 * ATTENZIONE: eseguire solo a fine fase di sviluppo/testing, dopo audit,
 * con indirizzi di governance (multisig) configurati in .env.
 *
 * SICUREZZA: nessun default silenzioso sui parametri economici. Tutti i valori
 * (supply, holder iniziale, fee, collector, treasury, admin) sono OBBLIGATORI
 * in .env — un valore mancante interrompe il deploy invece di usare un
 * fallback che potrebbe minare l'intera supply su una EOA calda per errore.
 */
async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== POLYGON_CHAIN_ID) {
    throw new Error(`Rete sbagliata: connesso a chainId ${chainId}, atteso Polygon mainnet (${POLYGON_CHAIN_ID})`);
  }

  const [deployer] = await ethers.getSigners();

  const required = {
    TOKEN_NAME: process.env.TOKEN_NAME,
    TOKEN_SYMBOL: process.env.TOKEN_SYMBOL,
    INITIAL_SUPPLY: process.env.INITIAL_SUPPLY,
    INITIAL_HOLDER_ADDRESS: process.env.INITIAL_HOLDER_ADDRESS,
    TRANSFER_FEE_BASIS_POINTS: process.env.TRANSFER_FEE_BASIS_POINTS,
    FEE_COLLECTOR_ADDRESS: process.env.FEE_COLLECTOR_ADDRESS,
    CUSTODY_FEE_BASIS_POINTS: process.env.CUSTODY_FEE_BASIS_POINTS,
    CUSTODY_TREASURY_ADDRESS: process.env.CUSTODY_TREASURY_ADDRESS,
    DEFAULT_ADMIN_ADDRESS: process.env.DEFAULT_ADMIN_ADDRESS,
  };
  const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`Parametri mancanti in .env (obbligatori su mainnet, nessun fallback): ${missing.join(", ")}`);
  }

  const {
    TOKEN_NAME: tokenName,
    TOKEN_SYMBOL: tokenSymbol,
    INITIAL_SUPPLY: initialSupply,
    INITIAL_HOLDER_ADDRESS: initialHolder,
    TRANSFER_FEE_BASIS_POINTS: transferFeeBps,
    FEE_COLLECTOR_ADDRESS: feeCollector,
    CUSTODY_FEE_BASIS_POINTS: custodyFeeBps,
    CUSTODY_TREASURY_ADDRESS: custodyTreasury,
    DEFAULT_ADMIN_ADDRESS: defaultAdmin,
  } = required as Record<string, string>;

  if (Number(transferFeeBps) > 100) throw new Error("TRANSFER_FEE_BASIS_POINTS > 100 (cap contrattuale)");
  if (Number(custodyFeeBps) > 200) throw new Error("CUSTODY_FEE_BASIS_POINTS > 200 (cap contrattuale)");
  if (feeCollector.toLowerCase() === custodyTreasury.toLowerCase()) {
    console.warn("⚠️  FEE_COLLECTOR_ADDRESS == CUSTODY_TREASURY_ADDRESS: consentito ma non consigliato.");
  }

  console.log("\n⚠️  DEPLOY SU POLYGON MAINNET");
  console.log("Deployer:", deployer.address);
  console.log("Config:", {
    tokenName,
    tokenSymbol,
    initialSupply: ethers.formatEther(initialSupply) + " token",
    initialHolder,
    transferFeeBps,
    feeCollector,
    custodyFeeBps,
    custodyTreasury,
    defaultAdmin,
  });

  if (process.env.CONFIRM_MAINNET !== "yes") {
    const answer = await askConfirmation('\nDigitare "DEPLOY MAINNET" per confermare: ');
    if (answer.trim() !== "DEPLOY MAINNET") {
      throw new Error("Conferma non fornita. Deploy annullato.");
    }
  }

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
  const deployedVersion = await (token as any).version();
  const deployTx = token.deploymentTransaction();
  const deployBlock = deployTx ? (await deployTx.wait())?.blockNumber : undefined;

  console.log("\nProxy:", tokenAddress);
  console.log("Implementation:", implementationAddress);
  console.log("Version:", deployedVersion);
  console.log("Deploy block:", deployBlock);

  const deploymentsDir = path.join(__dirname, "../../deployments/polygon");
  fs.mkdirSync(deploymentsDir, { recursive: true });

  fs.writeFileSync(path.join(deploymentsDir, "proxy.json"), JSON.stringify({ address: tokenAddress }, null, 2));
  fs.writeFileSync(
    path.join(deploymentsDir, "implementation.json"),
    JSON.stringify({ address: implementationAddress }, null, 2)
  );
  fs.writeFileSync(
    path.join(deploymentsDir, "deployment.json"),
    JSON.stringify(
      {
        network: "polygon",
        chainId: Number(chainId),
        version: deployedVersion,
        proxy: tokenAddress,
        implementation: implementationAddress,
        deployBlock,
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
      },
      null,
      2
    )
  );

  console.log(`\n📊 Explorer: https://polygonscan.com/address/${tokenAddress}`);
  console.log("Prossimo passo: PROXY_ADDRESS=" + tokenAddress + " pnpm hardhat run scripts/deploy/verify.ts --network polygon");
}

main()
  .then(() => process.exitCode = 0)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
