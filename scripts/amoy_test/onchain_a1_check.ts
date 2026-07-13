import { ethers } from "hardhat";
import type { Token } from "../../typechain-types";

/**
 * Verifica ON-CHAIN mirata del fix A1 (EIP-3009 receive typehash) sul proxy Amoy
 * v2.5.0, tutta via staticCall (nessuna tx, nessun nonce): dimostra che i due
 * typehash sono DISTINTI sul bytecode deployato.
 *
 * Uso: PROXY_ADDRESS=... pnpm hardhat run scripts/amoy_test/onchain_a1_check.ts --network amoy
 */
async function main() {
  const proxy = process.env.PROXY_ADDRESS!;
  const [signer] = await ethers.getSigners();
  const token = (await ethers.getContractAt("Token", proxy)) as unknown as Token;

  const domainRaw = await token.eip712Domain();
  const domain = {
    name: domainRaw.name,
    version: domainRaw.version,
    chainId: domainRaw.chainId,
    verifyingContract: domainRaw.verifyingContract,
  };
  const fields = [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ];
  const to = signer.address; // payee == caller for the receive path
  const msg = {
    from: signer.address,
    to,
    value: 0n,
    validAfter: 0,
    validBefore: Math.floor(Date.now() / 1000) + 3600,
    nonce: ethers.id("a1-onchain-" + Date.now()),
  };

  // (a) firma col typehash TRANSFER → NON deve validare sul receive
  const sigT = ethers.Signature.from(await signer.signTypedData(domain, { TransferWithAuthorization: fields }, msg));
  let transferSigRejected = false;
  try {
    await token
      .connect(signer)
      .receiveWithAuthorization.staticCall(msg.from, to, msg.value, msg.validAfter, msg.validBefore, msg.nonce, sigT.v, sigT.r, sigT.s);
  } catch (e: any) {
    transferSigRejected = (e.data ?? e.message ?? "").toString().includes("0x8baa579f") || /InvalidSignature/.test(e.toString());
  }

  // (b) firma col typehash RECEIVE → deve essere accettata (staticCall non reverta)
  const sigR = ethers.Signature.from(await signer.signTypedData(domain, { ReceiveWithAuthorization: fields }, msg));
  let receiveSigAccepted = false;
  try {
    await token
      .connect(signer)
      .receiveWithAuthorization.staticCall(msg.from, to, msg.value, msg.validAfter, msg.validBefore, msg.nonce, sigR.v, sigR.r, sigR.s);
    receiveSigAccepted = true;
  } catch (e: any) {
    receiveSigAccepted = false;
    console.error("receive-sig unexpectedly reverted:", e.message);
  }

  console.log(`Proxy ${proxy} · v${await token.version()}`);
  console.log(`${transferSigRejected ? "✅" : "❌"} A1: firma TRANSFER-typehash RIFIUTATA sul percorso receive (InvalidSignature)`);
  console.log(`${receiveSigAccepted ? "✅" : "❌"} A1: firma RECEIVE-typehash ACCETTATA sul percorso receive`);

  if (!transferSigRejected || !receiveSigAccepted) process.exit(1);
  console.log("\n✅ A1 EIP-3009 typehash distinti: confermato ON-CHAIN sul bytecode v2.5.0");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
