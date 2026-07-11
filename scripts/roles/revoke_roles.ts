import { ethers } from "hardhat";

/**
 * Revoca ruoli operativi dagli indirizzi configurati in .env.
 * NOTA: nessun fallback su chiavi env legacy (FEE_ADMIN_ADDRESS).
 *
 * GUARD anti-lockout: se tra i ruoli da revocare compare DEFAULT_ADMIN_ROLE
 * (aggiunto esplicitamente da chi lancia lo script, non è nella mappa di
 * default), rifiuta la revoca se resterebbe un solo admin o nessuno — usare
 * scripts/roles/finalize_governance.ts per l'handover controllato.
 */
async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS;
  if (!proxyAddress) throw new Error("PROXY_ADDRESS not set");

  const token = await ethers.getContractAt("Token", proxyAddress);

  const roles: Record<string, string | undefined> = {
    // DEFAULT_ADMIN_ROLE per primo, e SOLO se richiesto esplicitamente con
    // questa variabile dedicata (NON DEFAULT_ADMIN_ADDRESS, usata per il
    // deploy): evita che un .env con DEFAULT_ADMIN_ADDRESS già impostato
    // faccia scattare una revoca dell'admin non voluta a ogni esecuzione.
    DEFAULT_ADMIN_ROLE: process.env.REVOKE_DEFAULT_ADMIN_FROM,
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
    if (!address) continue;

    if (roleName === "DEFAULT_ADMIN_ROLE") {
      const adminRole = await token.DEFAULT_ADMIN_ROLE();
      const fromBlock = parseInt(process.env.FROM_BLOCK || "0");
      const granted = await token.queryFilter(token.filters.RoleGranted(adminRole), fromBlock, "latest");
      const candidates = new Set<string>();
      for (const e of granted) candidates.add((e as any).args.account);
      let remainingAdmins = 0;
      for (const a of candidates) {
        if (a.toLowerCase() !== address.toLowerCase() && (await token.hasRole(adminRole, a))) remainingAdmins++;
      }
      if (remainingAdmins === 0) {
        throw new Error(
          `RIFIUTATO: revocare DEFAULT_ADMIN_ROLE da ${address} lascerebbe zero admin (governance lockout). ` +
            `Verificare che un altro indirizzo abbia già il ruolo prima di procedere.`
        );
      }
    }

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
