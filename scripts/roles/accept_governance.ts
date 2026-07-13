import { ethers } from "hardhat";

/**
 * Finalizzazione della governance — FASE 2 di 2 (v2.4.0).
 *
 * Da eseguire dal NUOVO admin (es. il Safe multisig) dopo che il delay
 * schedulato da scripts/roles/finalize_governance.ts (beginDefaultAdminTransfer)
 * è trascorso. Completa l'handover di DEFAULT_ADMIN_ROLE con
 * acceptDefaultAdminTransfer(): il vecchio admin lo perde, il nuovo lo
 * riceve, atomicamente.
 *
 * Il signer configurato per la rete (PRIVATE_KEY in .env, o l'account del
 * Safe se lanciato tramite un relayer con le sue chiavi) DEVE essere
 * l'indirizzo pendente restituito da pendingDefaultAdmin() — altrimenti la
 * transazione reverte con AccessControlInvalidDefaultAdmin.
 *
 * Uso: PROXY_ADDRESS=... pnpm hardhat run scripts/roles/accept_governance.ts --network <rete>
 */
async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS;
  if (!proxyAddress) throw new Error("PROXY_ADDRESS not set");

  const [signer] = await ethers.getSigners();
  const token = await ethers.getContractAt("Token", proxyAddress);

  const [pendingAdmin, schedule] = await token.pendingDefaultAdmin();
  if (pendingAdmin === ethers.ZeroAddress) {
    throw new Error(
      "Nessun transfer di DEFAULT_ADMIN_ROLE pendente. " +
        "Esegui prima scripts/roles/finalize_governance.ts (beginDefaultAdminTransfer)."
    );
  }

  if (pendingAdmin.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(
      `Il signer configurato (${signer.address}) non è l'admin pendente (${pendingAdmin}). ` +
        `Esegui questo script con la chiave/account del nuovo admin.`
    );
  }

  const now = Math.floor(Date.now() / 1000);
  if (Number(schedule) > now) {
    const scheduleDate = new Date(Number(schedule) * 1000).toISOString();
    throw new Error(`Delay non ancora trascorso. Accettabile a partire da: ${scheduleDate} (unix ${schedule}).`);
  }

  const oldAdmin = await token.defaultAdmin();
  console.log(`Accettando il transfer di DEFAULT_ADMIN_ROLE: ${oldAdmin} -> ${signer.address}...`);

  await (await token.acceptDefaultAdminTransfer()).wait();

  const adminRole = await token.DEFAULT_ADMIN_ROLE();
  const newHasIt = await token.hasRole(adminRole, signer.address);
  const oldStillHasIt = await token.hasRole(adminRole, oldAdmin);

  console.log(`\n${newHasIt ? "✅" : "❌"} ${signer.address} ha DEFAULT_ADMIN_ROLE: ${newHasIt}`);
  console.log(`${!oldStillHasIt ? "✅" : "❌"} ${oldAdmin} ha ancora DEFAULT_ADMIN_ROLE: ${oldStillHasIt}`);

  if (!newHasIt || oldStillHasIt) {
    throw new Error("Stato inatteso dopo acceptDefaultAdminTransfer — verificare manualmente prima di procedere.");
  }

  console.log("\n✅ Governance handover completato.");
}

main()
  .then(() => (process.exitCode = 0))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
