import { ethers } from "hardhat";

/**
 * Concede i ruoli operativi agli indirizzi configurati in .env.
 * NOTA: nessun fallback su chiavi env legacy (FEE_ADMIN_ADDRESS) — fail-fast
 * se manca la chiave corrente, per evitare che un .env vecchio piloti in
 * silenzio un redeploy con indirizzi stantii.
 */
async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS;
  if (!proxyAddress) throw new Error("PROXY_ADDRESS not set");

  const token = await ethers.getContractAt("Token", proxyAddress);

  const roles: Record<string, string | undefined> = {
    UPGRADER_ROLE: process.env.UPGRADER_ADDRESS,
    PAUSER_ROLE: process.env.PAUSER_ADDRESS,
    MINTER_ROLE: process.env.MINTER_ADDRESS,
    BURNER_ROLE: process.env.BURNER_ADDRESS,
    FREEZER_ROLE: process.env.FREEZER_ADDRESS,
    BLOCKER_ROLE: process.env.BLOCKER_ADDRESS,
    FEE_MANAGER_ROLE: process.env.FEE_MANAGER_ADDRESS,
    RECOVERER_ROLE: process.env.RECOVERER_ADDRESS,
  };

  for (const [roleName, address] of Object.entries(roles)) {
    if (address) {
      console.log(`Granting ${roleName} to ${address}`);
      const roleHash = await (token as any)[roleName]();
      await (await token.grantRole(roleHash, address)).wait();
      console.log(`✅ ${roleName} granted to ${address}`);
    }
  }
}

main()
  .then(() => process.exitCode = 0)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
