import { run, upgrades, network } from "hardhat";

const CHAIN_IDS: Record<string, number> = { amoy: 80002, polygon: 137 };
const EXPLORERS: Record<string, string> = {
  amoy: "https://amoy.polygonscan.com",
  polygon: "https://polygonscan.com",
};

/**
 * Verifica su Polygonscan di ENTRAMBI i contratti (richiesto da PIANO_LAVORI.md §C):
 *   1. l'IMPLEMENTATION (sorgente + ABI pubblici) — hardhat-verify standard
 *   2. il PROXY, marcato come proxy via l'endpoint Etherscan-API-V2
 *      "verifyproxycontract" — cosi' l'explorer espone "Read/Write as Proxy"
 *      con l'ABI dell'implementation sull'indirizzo del proxy
 *
 * Uso: PROXY_ADDRESS=... pnpm hardhat run scripts/deploy/verify.ts --network <amoy|polygon>
 */
interface EtherscanApiResponse {
  status: string;
  result: string;
}

async function verifyProxyOnPolygonscan(proxyAddress: string, implementationAddress: string): Promise<void> {
  const chainId = CHAIN_IDS[network.name];
  const apiKey = process.env.POLYGONSCAN_API_KEY;
  if (!chainId || !apiKey) {
    console.warn("⚠️  chainId/API key non disponibili per la verifica automatica del proxy.");
    return;
  }

  const base = "https://api.etherscan.io/v2/api";
  const submit: EtherscanApiResponse = await fetch(`${base}?chainid=${chainId}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      module: "contract",
      action: "verifyproxycontract",
      address: proxyAddress,
      expectedimplementation: implementationAddress,
      apikey: apiKey,
    }),
  }).then((r) => r.json() as Promise<EtherscanApiResponse>);

  if (submit.status !== "1") {
    console.warn(`⚠️  Richiesta di verifica proxy non accettata: ${submit.result}`);
    return;
  }
  const guid = submit.result;
  console.log(`Richiesta di verifica proxy inviata (guid ${guid}), attendo l'esito...`);

  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const check: EtherscanApiResponse = await fetch(
      `${base}?chainid=${chainId}&module=contract&action=checkproxyverification&guid=${guid}&apikey=${apiKey}`
    ).then((r) => r.json() as Promise<EtherscanApiResponse>);
    if (check.result?.includes("Verified") || check.status === "1") {
      console.log("✅ Proxy verificato e marcato come proxy su Polygonscan");
      return;
    }
    if (check.result && !check.result.includes("Pending") && !check.result.includes("queue")) {
      console.warn(`⚠️  Verifica proxy non riuscita: ${check.result}`);
      return;
    }
  }
  console.warn("⚠️  Verifica proxy ancora in coda dopo 30s — ricontrollare più tardi su Polygonscan.");
}

async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS;
  if (!proxyAddress) throw new Error("PROXY_ADDRESS not set");

  const implementationAddress =
    process.env.IMPLEMENTATION_ADDRESS || (await upgrades.erc1967.getImplementationAddress(proxyAddress));

  console.log("Proxy:", proxyAddress);
  console.log("Implementation:", implementationAddress);

  // 1. Verifica l'implementation (constructor UUPS vuoto: nessun argomento)
  console.log("\n① Verifico l'implementation...");
  await run("verify:verify", {
    address: implementationAddress,
    constructorArguments: [],
  });
  console.log("✅ Implementation verificata");
  console.log(`   ${EXPLORERS[network.name]}/address/${implementationAddress}#code`);

  // 2. Verifica + marca il proxy come proxy (ERC1967Proxy) via API Polygonscan
  console.log("\n② Verifico e marco il proxy come proxy...");
  try {
    await verifyProxyOnPolygonscan(proxyAddress, implementationAddress);
  } catch (e) {
    console.warn(
      "⚠️  Verifica automatica del proxy fallita:",
      (e as Error).message,
      `\n    Marcare manualmente: ${EXPLORERS[network.name]}/proxyContractChecker?a=${proxyAddress}`
    );
  }
  console.log(`   ${EXPLORERS[network.name]}/address/${proxyAddress}#readProxyContract`);
}

main()
  .then(() => process.exitCode = 0)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
