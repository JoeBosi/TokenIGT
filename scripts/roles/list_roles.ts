import { ethers } from "hardhat";

/**
 * Elenca gli indirizzi che detengono ciascun ruolo.
 *
 * Il Token usa AccessControlUpgradeable "semplice" (non Enumerable): non esiste
 * getRoleMember on-chain. Ricostruiamo l'insieme corrente rigiocando gli eventi
 * RoleGranted/RoleRevoked dal blocco di deploy (o da FROM_BLOCK) e verificando
 * ogni candidato con hasRole (fonte di verità, robusto a eventi mancanti/riordinati).
 *
 * Uso: PROXY_ADDRESS=... [FROM_BLOCK=...] pnpm hardhat run scripts/roles/list_roles.ts --network <rete>
 */
async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS;
  if (!proxyAddress) throw new Error("PROXY_ADDRESS not set");
  const fromBlock = parseInt(process.env.FROM_BLOCK || "0");

  const token = await ethers.getContractAt("Token", proxyAddress);

  const roles = [
    "DEFAULT_ADMIN_ROLE",
    "UPGRADER_ROLE",
    "PAUSER_ROLE",
    "MINTER_ROLE",
    "BURNER_ROLE",
    "FREEZER_ROLE",
    "BLOCKER_ROLE",
    "FEE_MANAGER_ROLE",
    "RECOVERER_ROLE",
  ];

  console.log("Role assignments for", proxyAddress);
  console.log("=".repeat(50));

  for (const roleName of roles) {
    const roleHash: string = await (token as any)[roleName]();

    const granted = await token.queryFilter(token.filters.RoleGranted(roleHash), fromBlock, "latest");
    const revoked = await token.queryFilter(token.filters.RoleRevoked(roleHash), fromBlock, "latest");

    const candidates = new Set<string>();
    for (const e of granted) candidates.add((e as any).args.account);
    for (const e of revoked) candidates.add((e as any).args.account);

    const holders: string[] = [];
    for (const addr of candidates) {
      if (await token.hasRole(roleHash, addr)) holders.push(addr);
    }

    console.log(`\n${roleName}:`);
    console.log(`  Role Hash: ${roleHash}`);
    console.log(`  Members (${holders.length}):`);
    for (const h of holders) console.log(`    - ${h}`);
  }

  console.log(
    "\nNota: ricostruito dagli eventi RoleGranted/RoleRevoked a partire dal blocco",
    fromBlock,
    "— impostare FROM_BLOCK al blocco di deploy per uno storico completo."
  );
}

main()
  .then(() => process.exitCode = 0)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
