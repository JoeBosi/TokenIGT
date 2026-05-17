import { ethers } from "hardhat";

async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS;
  if (!proxyAddress) throw new Error("PROXY_ADDRESS not set");

  const token = await ethers.getContractAt("Token", proxyAddress);

  const roles = [
    "DEFAULT_ADMIN_ROLE",
    "UPGRADER_ROLE",
    "PAUSER_ROLE",
    "MINTER_ROLE",
    "BURNER_ROLE",
    "FREEZER_ROLE",
    "BLOCKER_ROLE",
    "FEE_ADMIN_ROLE",
    "RECOVERER_ROLE",
  ];

  console.log("Role assignments for", proxyAddress);
  console.log("=" .repeat(50));

  for (const roleName of roles) {
    const roleHash = await token[roleName]();
    const memberCount = await token.getRoleMemberCount(roleHash);
    
    console.log(`\n${roleName}:`);
    console.log(`  Role Hash: ${roleHash}`);
    console.log(`  Members (${memberCount}):`);
    
    for (let i = 0; i < memberCount; i++) {
      const member = await token.getRoleMember(roleHash, i);
      console.log(`    - ${member}`);
    }
  }
}

main().catch(console.error);
