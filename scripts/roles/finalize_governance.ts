import { ethers } from "hardhat";

/**
 * Finalizzazione della governance post-deploy (E3b/E3c del redeploy pulito).
 *
 * 1. Concede i ruoli operativi (MINTER/BURNER/PAUSER/FREEZER/BLOCKER) agli
 *    indirizzi dedicati (già assegnati da initialize: DEFAULT_ADMIN, UPGRADER,
 *    FEE_MANAGER, RECOVERER restano sull'admin passato a initialize).
 * 2. Se GOVERNANCE_ADMIN (es. l'indirizzo del Safe multisig) è diverso dal
 *    deployer/admin corrente: concede DEFAULT_ADMIN_ROLE + UPGRADER_ROLE +
 *    FEE_MANAGER_ROLE + RECOVERER_ROLE al nuovo admin, VERIFICA che l'abbia
 *    ricevuto, poi il deployer rinuncia (renounceRole, non revokeRole — puoi
 *    rinunciare solo ai TUOI ruoli) a tutti i ruoli di governance residui.
 * 3. Stampa lo stato finale dei ruoli per verifica manuale.
 *
 * SICUREZZA: l'ordine (grant al nuovo admin -> verifica -> renounce del
 * vecchio) garantisce che non ci sia mai un istante senza alcun DEFAULT_ADMIN.
 *
 * Uso: PROXY_ADDRESS=... GOVERNANCE_ADMIN=<safe> pnpm hardhat run
 *      scripts/roles/finalize_governance.ts --network <rete>
 */
async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS;
  if (!proxyAddress) throw new Error("PROXY_ADDRESS not set");

  const [deployer] = await ethers.getSigners();
  const token = await ethers.getContractAt("Token", proxyAddress);

  // ── 1. Ruoli operativi ──────────────────────────────────────────────────
  const operational: Record<string, string | undefined> = {
    MINTER_ROLE: process.env.MINTER_ADDRESS,
    BURNER_ROLE: process.env.BURNER_ADDRESS,
    PAUSER_ROLE: process.env.PAUSER_ADDRESS,
    FREEZER_ROLE: process.env.FREEZER_ADDRESS,
    BLOCKER_ROLE: process.env.BLOCKER_ADDRESS,
  };
  for (const [roleName, address] of Object.entries(operational)) {
    if (!address) {
      console.warn(`⚠️  ${roleName}: nessun indirizzo in env, SALTATO`);
      continue;
    }
    const roleHash = await (token as any)[roleName]();
    if (await token.hasRole(roleHash, address)) {
      console.log(`${roleName} già assegnato a ${address}`);
      continue;
    }
    await (await token.grantRole(roleHash, address)).wait();
    console.log(`✅ ${roleName} -> ${address}`);
  }

  // ── 2. Handover della governance verso il multisig (opzionale) ──────────
  const newAdmin = process.env.GOVERNANCE_ADMIN;
  if (newAdmin && newAdmin.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log(`\nHandover della governance verso ${newAdmin}...`);

    const governanceRoles = ["DEFAULT_ADMIN_ROLE", "UPGRADER_ROLE", "FEE_MANAGER_ROLE", "RECOVERER_ROLE"];

    // 2a. Grant al nuovo admin (senza toccare il vecchio)
    for (const roleName of governanceRoles) {
      const roleHash = await (token as any)[roleName]();
      if (!(await token.hasRole(roleHash, newAdmin))) {
        await (await token.grantRole(roleHash, newAdmin)).wait();
        console.log(`✅ ${roleName} concesso a ${newAdmin}`);
      }
    }

    // 2b. VERIFICA prima di rinunciare — mai lasciare zero admin
    const adminRole = await token.DEFAULT_ADMIN_ROLE();
    if (!(await token.hasRole(adminRole, newAdmin))) {
      throw new Error(
        `ARRESTO: ${newAdmin} non risulta avere DEFAULT_ADMIN_ROLE dopo il grant. ` +
          `NON si procede con renounceRole per evitare un lockout della governance.`
      );
    }
    console.log(`✅ Verificato: ${newAdmin} ha DEFAULT_ADMIN_ROLE`);

    // 2c. Il deployer rinuncia ai propri ruoli di governance (renounce, non revoke)
    for (const roleName of governanceRoles) {
      const roleHash = await (token as any)[roleName]();
      if (await token.hasRole(roleHash, deployer.address)) {
        await (await token.renounceRole(roleHash, deployer.address)).wait();
        console.log(`✅ ${roleName} rinunciato da ${deployer.address}`);
      }
    }
  } else {
    console.log("\nGOVERNANCE_ADMIN non impostato o uguale al deployer: nessun handover eseguito.");
  }

  // ── 3. Stato finale ──────────────────────────────────────────────────────
  console.log("\n=== Stato finale ruoli ===");
  const allRoles = [
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
  const checkAddrs = [deployer.address, newAdmin, ...Object.values(operational)].filter(Boolean) as string[];
  for (const roleName of allRoles) {
    const roleHash = await (token as any)[roleName]();
    const holders: string[] = [];
    for (const addr of new Set(checkAddrs)) {
      if (await token.hasRole(roleHash, addr)) holders.push(addr);
    }
    console.log(`${roleName}: ${holders.join(", ") || "(nessuno tra gli indirizzi noti)"}`);
  }
}

main()
  .then(() => process.exitCode = 0)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
