import { ethers, upgrades } from "hardhat";
import fs from "fs";
import path from "path";

/**
 * Deploy del Token v2.0.0 su Polygon MAINNET (UUPS proxy).
 * ATTENZIONE: eseguire solo a fine fase di sviluppo/testing, dopo audit,
 * con indirizzi di governance (multisig) configurati in .env.
 */
async function main() {
  console.log("Deploying IGE Token v2.0.0 to Polygon mainnet...");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const defaultAdmin = process.env.DEFAULT_ADMIN_ADDRESS;
  const feeCollector = process.env.FEE_COLLECTOR_ADDRESS;
  const custodyTreasury = process.env.CUSTODY_TREASURY_ADDRESS;

  if (!defaultAdmin || !feeCollector || !custodyTreasury) {
    throw new Error(
      "DEFAULT_ADMIN_ADDRESS, FEE_COLLECTOR_ADDRESS e CUSTODY_TREASURY_ADDRESS sono obbligatori su mainnet"
    );
  }

  const tokenName = process.env.TOKEN_NAME || "IGE Token";
  const tokenSymbol = process.env.TOKEN_SYMBOL || "IGT";
  const initialSupply = process.env.INITIAL_SUPPLY || "10000000000000000000000";
  const initialHolder = process.env.INITIAL_HOLDER_ADDRESS || deployer.address;
  const transferFeeBps = process.env.TRANSFER_FEE_BASIS_POINTS || "1";
  const custodyFeeBps = process.env.CUSTODY_FEE_BASIS_POINTS || "50";

  if (Number(transferFeeBps) > 100) throw new Error("TRANSFER_FEE_BASIS_POINTS > 100 (cap contrattuale)");
  if (Number(custodyFeeBps) > 200) throw new Error("CUSTODY_FEE_BASIS_POINTS > 200 (cap contrattuale)");

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

  console.log("Proxy:", tokenAddress);
  console.log("Implementation:", implementationAddress);

  const deploymentsDir = path.join(__dirname, "../../deployments/polygon");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  fs.writeFileSync(path.join(deploymentsDir, "proxy.json"), JSON.stringify({ address: tokenAddress }, null, 2));
  fs.writeFileSync(
    path.join(deploymentsDir, "implementation.json"),
    JSON.stringify({ address: implementationAddress }, null, 2)
  );

  console.log(`📊 Explorer: https://polygonscan.com/address/${tokenAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
