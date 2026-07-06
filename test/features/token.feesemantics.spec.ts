import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Doppia semantica della transfer fee (SPEC_FEE_CUSTODIA.md, decisione D4):
 * - transfer/transferFrom: fee DEDOTTA dall'importo (destinatario riceve il netto)
 * - ERC-1363 / EIP-3009: destinatario riceve ESATTAMENTE il valore, mittente paga
 *   valore + fee (allowance sul lordo per transferFromAndCall)
 * - view previewNet / previewGross / maxNetTransferable
 * - con fee = 0 ogni percorso si comporta come un ERC-20 puro
 */
describe("Token - Fee Semantics (net/gross)", function () {
  let token: Token;
  let tokenZero: Token; // transfer fee = 0 e custody fee = 0
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let collector: SignerWithAddress;
  let treasury: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("100000");
  const FEE_BPS = 100n; // 1% = massimo consentito
  const feeOf = (v: bigint) => (v * FEE_BPS) / 10000n;

  async function deploy(feeBps: bigint, custodyBps: bigint): Promise<Token> {
    const Token = await ethers.getContractFactory("Token");
    const t = (await upgrades.deployProxy(
      Token,
      [
        "IGE Token",
        "IGT",
        INITIAL_SUPPLY,
        alice.address,
        feeBps,
        collector.address,
        custodyBps,
        treasury.address,
        owner.address,
      ],
      { kind: "uups" }
    )) as unknown as Token;
    await t.waitForDeployment();
    return t;
  }

  beforeEach(async function () {
    [owner, alice, bob, carol, collector, treasury] = await ethers.getSigners();
    token = await deploy(FEE_BPS, 50n);
    tokenZero = await deploy(0n, 0n);
  });

  describe("Percorso NETTO — transfer/transferFrom", function () {
    it("transfer: mittente -v, destinatario +v-fee, collector +fee", async function () {
      const v = ethers.parseEther("1000");
      const aliceBefore = await token.balanceOf(alice.address);

      await expect(token.connect(alice).transfer(bob.address, v))
        .to.emit(token, "Transfer")
        .withArgs(alice.address, bob.address, v - feeOf(v))
        .and.to.emit(token, "Transfer")
        .withArgs(alice.address, collector.address, feeOf(v));

      expect(await token.balanceOf(alice.address)).to.equal(aliceBefore - v);
      expect(await token.balanceOf(bob.address)).to.equal(v - feeOf(v));
      expect(await token.balanceOf(collector.address)).to.equal(feeOf(v));
    });

    it("transferFrom: allowance consumata per v (non per il lordo)", async function () {
      const v = ethers.parseEther("1000");
      await token.connect(alice).approve(carol.address, v);

      await token.connect(carol).transferFrom(alice.address, bob.address, v);

      expect(await token.balanceOf(bob.address)).to.equal(v - feeOf(v));
      expect(await token.allowance(alice.address, carol.address)).to.equal(0);
    });

    it("infinite allowance mai decrementata", async function () {
      await token.connect(alice).approve(carol.address, ethers.MaxUint256);
      await token.connect(carol).transferFrom(alice.address, bob.address, ethers.parseEther("10"));
      expect(await token.allowance(alice.address, carol.address)).to.equal(ethers.MaxUint256);
    });
  });

  describe("Percorso LORDO — ERC-1363 / EIP-3009", function () {
    it("transferAndCall: destinatario +v esatti, mittente -(v+fee)", async function () {
      const v = ethers.parseEther("1000");
      const aliceBefore = await token.balanceOf(alice.address);

      await expect(token.connect(alice)["transferAndCall(address,uint256)"](bob.address, v))
        .to.emit(token, "Transfer")
        .withArgs(alice.address, bob.address, v)
        .and.to.emit(token, "Transfer")
        .withArgs(alice.address, collector.address, feeOf(v));

      expect(await token.balanceOf(bob.address)).to.equal(v);
      expect(await token.balanceOf(alice.address)).to.equal(aliceBefore - v - feeOf(v));
      expect(await token.balanceOf(collector.address)).to.equal(feeOf(v));
    });

    it("transferWithAuthorization: destinatario riceve esattamente il value firmato", async function () {
      const v = ethers.parseEther("500");
      const nonce = ethers.hexlify(ethers.randomBytes(32));
      const now = Math.floor(Date.now() / 1000);

      const domain = {
        name: "IGE Token",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await token.getAddress(),
      };
      const types = {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      };
      const message = {
        from: alice.address,
        to: bob.address,
        value: v,
        validAfter: 0,
        validBefore: now + 3600,
        nonce,
      };

      const signature = await alice.signTypedData(domain, types, message);
      const { v: sigV, r, s } = ethers.Signature.from(signature);

      const aliceBefore = await token.balanceOf(alice.address);

      await token
        .connect(carol) // relayer qualsiasi
        .transferWithAuthorization(alice.address, bob.address, v, 0, now + 3600, nonce, sigV, r, s);

      expect(await token.balanceOf(bob.address)).to.equal(v);
      expect(await token.balanceOf(alice.address)).to.equal(aliceBefore - v - feeOf(v));
      expect(await token.balanceOf(collector.address)).to.equal(feeOf(v));
    });

    it("gross path: revert se il saldo non copre v + fee", async function () {
      const balance = await token.balanceOf(alice.address);
      // v = balance è insufficiente perché serve anche la fee
      await expect(
        token.connect(alice)["transferAndCall(address,uint256)"](bob.address, balance)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
    });

    it("esenzione del mittente: nessuna fee sul percorso lordo", async function () {
      await token.addTransferFeeExempt(alice.address);
      const v = ethers.parseEther("1000");
      const aliceBefore = await token.balanceOf(alice.address);

      await token.connect(alice)["transferAndCall(address,uint256)"](bob.address, v);

      expect(await token.balanceOf(bob.address)).to.equal(v);
      expect(await token.balanceOf(alice.address)).to.equal(aliceBefore - v);
      expect(await token.balanceOf(collector.address)).to.equal(0);
    });
  });

  describe("View di preview", function () {
    it("previewNet e previewGross coerenti e inverse", async function () {
      const gross = ethers.parseEther("1000");
      expect(await token.previewNet(gross)).to.equal(gross - feeOf(gross));

      const net = ethers.parseEther("990");
      const g = await token.previewGross(net);
      // correttezza: g consegna almeno net; minimalità: g-1 no
      expect(g - feeOf(g)).to.be.gte(net);
      expect(g - 1n - feeOf(g - 1n)).to.be.lt(net);
    });

    it("maxNetTransferable: massimo v spendibile sul percorso lordo", async function () {
      const balance = await token.balanceOf(alice.address);
      const v = await token.maxNetTransferable(alice.address);

      expect(v + feeOf(v)).to.be.lte(balance);
      expect(v + 1n + feeOf(v + 1n)).to.be.gt(balance);

      // e infatti v è spendibile
      await token.connect(alice)["transferAndCall(address,uint256)"](bob.address, v);
      expect(await token.balanceOf(bob.address)).to.equal(v);
    });

    it("maxNetTransferable = 0 per account frozen o blocked", async function () {
      await token.grantRole(await token.FREEZER_ROLE(), owner.address);
      await token.freeze(alice.address);
      expect(await token.maxNetTransferable(alice.address)).to.equal(0);
    });
  });

  describe("Matrice FEE = 0 (requisito esplicito)", function () {
    it("ogni percorso si comporta come un ERC-20 puro", async function () {
      const v = ethers.parseEther("100");

      // transfer
      await tokenZero.connect(alice).transfer(bob.address, v);
      expect(await tokenZero.balanceOf(bob.address)).to.equal(v);

      // transferFrom
      await tokenZero.connect(alice).approve(carol.address, v);
      await tokenZero.connect(carol).transferFrom(alice.address, bob.address, v);
      expect(await tokenZero.balanceOf(bob.address)).to.equal(v * 2n);

      // transferAndCall (gross con fee 0 = trasferimento esatto)
      await tokenZero.connect(alice)["transferAndCall(address,uint256)"](bob.address, v);
      expect(await tokenZero.balanceOf(bob.address)).to.equal(v * 3n);

      // transferFromAndCall: allowance = v basta (nessuna fee)
      await tokenZero.connect(alice).approve(carol.address, v);
      await tokenZero.connect(carol).transferFromAndCall(alice.address, bob.address, v);
      expect(await tokenZero.balanceOf(bob.address)).to.equal(v * 4n);

      // il collector non riceve mai nulla
      expect(await tokenZero.balanceOf(collector.address)).to.equal(0);

      // previews = identità
      expect(await tokenZero.previewNet(v)).to.equal(v);
      expect(await tokenZero.previewGross(v)).to.equal(v);

      // sweep custodia con bps 0: nessun movimento
      await tokenZero.sweepCustodyFee([alice.address, bob.address]);
      expect(await tokenZero.balanceOf(treasury.address)).to.equal(0);
    });
  });
});
