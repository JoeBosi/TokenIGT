import { ethers } from "hardhat";

/**
 * Finalizzazione della governance post-deploy — FASE 1 di 2 (E3b/E3c del
 * redeploy pulito).
 *
 * 1. Concede i ruoli operativi (MINTER/BURNER/PAUSER/FREEZER/BLOCKER/SWEEPER)
 *    agli indirizzi dedicati (già assegnati da initialize: DEFAULT_ADMIN,
 *    UPGRADER, FEE_ADMIN, RECOVERER restano sull'admin passato a initialize).
 * 2. Se GOVERNANCE_ADMIN (es. l'indirizzo del Safe multisig) è diverso dal
 *    deployer/admin corrente:
 *    a. Concede UPGRADER_ROLE + FEE_ADMIN_ROLE + RECOVERER_ROLE al nuovo
 *       admin (grantRole ordinario, non gated dal delay).
 *    b. VERIFICA che il nuovo admin li abbia ricevuti, poi il deployer
 *       rinuncia (renounceRole) a questi stessi ruoli.
 *    c. Schedula il transfer di DEFAULT_ADMIN_ROLE con
 *       beginDefaultAdminTransfer(newAdmin) — con AccessControlDefaultAdminRules
 *       (v2.4.0) grantRole/revokeRole su DEFAULT_ADMIN_ROLE revertono sempre:
 *       l'UNICO percorso è questo transfer a due fasi con delay obbligatorio.
 * 3. Stampa lo stato e le istruzioni per la FASE 2.
 *
 * FASE 2 (dopo che il delay è trascorso): il NUOVO admin (es. dal Safe) esegue
 * scripts/roles/accept_governance.ts per completare l'handover con
 * acceptDefaultAdminTransfer(). Fino ad allora il deployer resta
 * DEFAULT_ADMIN_ROLE — non c'è mai un istante senza alcun admin.
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
    SWEEPER_ROLE: process.env.SWEEPER_ADDRESS,
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

    // 2a. Ruoli ordinari (non DEFAULT_ADMIN_ROLE): grant al nuovo admin
    const plainGovernanceRoles = ["UPGRADER_ROLE", "FEE_ADMIN_ROLE", "RECOVERER_ROLE"];
    for (const roleName of plainGovernanceRoles) {
      const roleHash = await (token as any)[roleName]();
      if (!(await token.hasRole(roleHash, newAdmin))) {
        await (await token.grantRole(roleHash, newAdmin)).wait();
        console.log(`✅ ${roleName} concesso a ${newAdmin}`);
      }
    }

    // 2b. VERIFICA prima di rinunciare
    for (const roleName of plainGovernanceRoles) {
      const roleHash = await (token as any)[roleName]();
      if (!(await token.hasRole(roleHash, newAdmin))) {
        throw new Error(
          `ARRESTO: ${newAdmin} non risulta avere ${roleName} dopo il grant. ` +
            `NON si procede oltre per evitare uno stato inconsistente.`
        );
      }
    }
    console.log(`✅ Verificato: ${newAdmin} ha ${plainGovernanceRoles.join(", ")}`);

    for (const roleName of plainGovernanceRoles) {
      const roleHash = await (token as any)[roleName]();
      if (await token.hasRole(roleHash, deployer.address)) {
        await (await token.renounceRole(roleHash, deployer.address)).wait();
        console.log(`✅ ${roleName} rinunciato da ${deployer.address}`);
      }
    }

    // 2c. DEFAULT_ADMIN_ROLE: schedula il transfer a due fasi (v2.4.0)
    const [pendingAdmin] = await token.pendingDefaultAdmin();
    if (pendingAdmin.toLowerCase() === newAdmin.toLowerCase()) {
      console.log(`\nTransfer di DEFAULT_ADMIN_ROLE verso ${newAdmin} già schedulato.`);
    } else {
      if (pendingAdmin !== ethers.ZeroAddress) {
        console.warn(
          `\n⚠️  Un transfer era già schedulato verso ${pendingAdmin} — verrà ` +
            `CANCELLATO e sostituito da uno nuovo verso ${newAdmin}. Il delay ` +
            `riparte da zero. Procedere solo se questo è intenzionale ` +
            `(es. correzione di un indirizzo errato).`
        );
      }
      await (await token.beginDefaultAdminTransfer(newAdmin)).wait();
      const [, schedule] = await token.pendingDefaultAdmin();
      const scheduleDate = new Date(Number(schedule) * 1000).toISOString();
      console.log(`\n✅ beginDefaultAdminTransfer(${newAdmin}) schedulato.`);
      console.log(`   Accettabile a partire da: ${scheduleDate} (unix ${schedule})`);
      console.log(
        `\n⏳ FASE 2 richiesta: dopo questa data, ${newAdmin} deve eseguire ` +
          `scripts/roles/accept_governance.ts per completare l'handover.`
      );
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
    "FEE_ADMIN_ROLE",
    "SWEEPER_ROLE",
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
