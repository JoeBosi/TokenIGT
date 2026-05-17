import { ethers } from "hardhat";

async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS;
  if (!proxyAddress) throw new Error("PROXY_ADDRESS not set");

  const token = await ethers.getContractAt("Token", proxyAddress);

  const roles = {
    UPGRADER_ROLE: process.env.UPGRADER_ADDRESS,
    PAUSER_ROLE: process.env.PAUSER_ADDRESS,
    MINTER_ROLE: process.env.MINTER_ADDRESS,
    BURNER_ROLE: process.env.BURNER_ADDRESS,
    FREEZER_ROLE: process.env.FREEZER_ADDRESS,
    BLOCKER_ROLE: process.env.BLOCKER_ADDRESS,
    FEE_ADMIN_ROLE: process.env.FEE_ADMIN_ADDRESS,
    RECOVERER_ROLE: process.env.RECOVERER_ADDRESS,
  };

  for (const [roleName, address] of Object.entries(roles)) {
    if (address) {
      console.log(`Granting ${roleName} to ${address}`);
      const roleHash = await token[roleName]();
      await (await token.grantRole(roleHash, address)).wait();
      console.log(`✅ ${roleName} granted to ${address}`);
    }
  }
}

main().catch(console.error);
