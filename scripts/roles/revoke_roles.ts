import { ethers } from "hardhat";

/**
 * Revoca ruoli operativi dagli indirizzi configurati in .env.
 * NOTA: nessun fallback su chiavi env legacy (FEE_MANAGER_ADDRESS, pre-v2.4.0).
 *
 * DEFAULT_ADMIN_ROLE NON è più revocabile con questo script: con
 * AccessControlDefaultAdminRules (v2.4.0), `revokeRole`/`grantRole` su
 * DEFAULT_ADMIN_ROLE revertono SEMPRE, incondizionatamente (protezione
 * contro un lockout accidentale della governance) — l'unico percorso è il
 * transfer a due fasi: beginDefaultAdminTransfer -> attesa del delay ->
 * acceptDefaultAdminTransfer (dal nuovo admin) o renounceRole (verso
 * address(0)). Vedi scripts/roles/finalize_governance.ts e
 * scripts/roles/accept_governance.ts.
 */
async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS;
  if (!proxyAddress) throw new Error("PROXY_ADDRESS not set");

  if (process.env.REVOKE_DEFAULT_ADMIN_FROM) {
    throw new Error(
      "REVOKE_DEFAULT_ADMIN_FROM non è più supportato: revokeRole(DEFAULT_ADMIN_ROLE, ...) reverte sempre " +
        "con AccessControlDefaultAdminRules. Usa scripts/roles/finalize_governance.ts (beginDefaultAdminTransfer) " +
        "seguito da scripts/roles/accept_governance.ts dopo il delay."
    );
  }

  const token = await ethers.getContractAt("Token", proxyAddress);

  const roles: Record<string, string | undefined> = {
    UPGRADER_ROLE: process.env.UPGRADER_ADDRESS,
    PAUSER_ROLE: process.env.PAUSER_ADDRESS,
    MINTER_ROLE: process.env.MINTER_ADDRESS,
    BURNER_ROLE: process.env.BURNER_ADDRESS,
    FREEZER_ROLE: process.env.FREEZER_ADDRESS,
    BLOCKER_ROLE: process.env.BLOCKER_ADDRESS,
    FEE_ADMIN_ROLE: process.env.FEE_ADMIN_ADDRESS,
    SWEEPER_ROLE: process.env.SWEEPER_ADDRESS,
    RECOVERER_ROLE: process.env.RECOVERER_ADDRESS,
  };

  for (const [roleName, address] of Object.entries(roles)) {
    if (!address) continue;

    console.log(`Revoking ${roleName} from ${address}`);
    const roleHash = await (token as any)[roleName]();
    await (await token.revokeRole(roleHash, address)).wait();
    console.log(`✅ ${roleName} revoked from ${address}`);
  }
}

main()
  .then(() => process.exitCode = 0)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
