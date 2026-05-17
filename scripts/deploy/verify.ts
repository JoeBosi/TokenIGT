import { ethers, run } from "hardhat";

async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS;
  if (!proxyAddress) throw new Error("PROXY_ADDRESS not set");

  console.log("Verifying implementation at", proxyAddress);

  await run("verify:verify", {
    address: proxyAddress,
    constructorArguments: [],
  });
}

main().catch(console.error);
