import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Token - Custody Fee", function () {
  let token: Token;
  let owner: SignerWithAddress; // admin + FEE_ADMIN (dall'init) + SWEEPER (grant esplicito)
  let holder1: SignerWithAddress;
  let holder2: SignerWithAddress;
  let treasury: SignerWithAddress;
  let outsider: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("10000");
  const CUSTODY_BPS = 50n; // 0.50%

  const custodyFeeOf = (balance: bigint) => (balance * CUSTODY_BPS) / 10000n;

  beforeEach(async function () {
    [owner, holder1, holder2, treasury, outsider] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = (await upgrades.deployProxy(
      Token,
      [
        "IGE Token",
        "IGT",
        INITIAL_SUPPLY,
        owner.address,
        0, // transfer fee spenta: isolare la custody fee
        owner.address,
        CUSTODY_BPS,
        treasury.address,
        owner.address,
        3 * 24 * 60 * 60,
      ],
      { kind: "uups" }
    )) as unknown as Token;
    await token.waitForDeployment();

    await token.grantRole(await token.PAUSER_ROLE(), owner.address);
    await token.grantRole(await token.FREEZER_ROLE(), owner.address);
    await token.grantRole(await token.BLOCKER_ROLE(), owner.address);
    await token.grantRole(await token.SWEEPER_ROLE(), owner.address);

    // Fondi ai due holder
    await token.transfer(holder1.address, ethers.parseEther("1000"));
    await token.transfer(holder2.address, ethers.parseEther("2000"));
  });

  describe("Configurazione", function () {
    it("Should initialize custody config and open cycle 1", async function () {
      expect(await token.custodyFeeBps()).to.equal(CUSTODY_BPS);
      expect(await token.custodyTreasury()).to.equal(treasury.address);
      expect(await token.currentCycle()).to.equal(1);
    });

    it("Should enforce the 200 bps cap on setCustodyFeeBps", async function () {
      await expect(token.setCustodyFeeBps(201)).to.be.revertedWithCustomError(token, "CustodyFeeExceedsMaximum");
      await token.setCustodyFeeBps(200);
      expect(await token.custodyFeeBps()).to.equal(200);
    });

    it("Should reject the zero address as treasury", async function () {
      await expect(token.setCustodyTreasury(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        token,
        "InvalidCustodyTreasury"
      );
    });

    it("Should emit events on config changes", async function () {
      await expect(token.setCustodyFeeBps(75)).to.emit(token, "CustodyFeeUpdated").withArgs(CUSTODY_BPS, 75);
      await expect(token.setCustodyTreasury(outsider.address))
        .to.emit(token, "CustodyTreasuryUpdated")
        .withArgs(treasury.address, outsider.address);
    });

    it("Should require FEE_ADMIN_ROLE (setters) / SWEEPER_ROLE (cycle+sweep) for every write function", async function () {
      const t = token.connect(outsider);
      await expect(t.setCustodyFeeBps(10)).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
      await expect(t.setCustodyTreasury(outsider.address)).to.be.revertedWithCustomError(
        token,
        "AccessControlUnauthorizedAccount"
      );
      await expect(t.addCustodyFeeExempt(outsider.address)).to.be.revertedWithCustomError(
        token,
        "AccessControlUnauthorizedAccount"
      );
      await expect(t.removeCustodyFeeExempt(outsider.address)).to.be.revertedWithCustomError(
        token,
        "AccessControlUnauthorizedAccount"
      );
      await expect(t.startNewCycle()).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
      await expect(t.sweepCustodyFee([holder1.address])).to.be.revertedWithCustomError(
        token,
        "AccessControlUnauthorizedAccount"
      );
    });
  });

  describe("Esenzioni", function () {
    it("Should manage the exemption list with events and enumeration", async function () {
      await expect(token.addCustodyFeeExempt(holder1.address))
        .to.emit(token, "CustodyFeeExemptionChanged")
        .withArgs(holder1.address, true);
      expect(await token.isCustodyFeeExempt(holder1.address)).to.be.true;
      expect(await token.getCustodyFeeExemptList()).to.include(holder1.address);

      // Idempotente: nessun evento su add ripetuto
      await expect(token.addCustodyFeeExempt(holder1.address)).to.not.emit(token, "CustodyFeeExemptionChanged");

      await expect(token.removeCustodyFeeExempt(holder1.address))
        .to.emit(token, "CustodyFeeExemptionChanged")
        .withArgs(holder1.address, false);
      expect(await token.isCustodyFeeExempt(holder1.address)).to.be.false;
    });
  });

  describe("Sweep", function () {
    it("Should collect the custody fee and emit CustodyFeeCollected", async function () {
      const balance = await token.balanceOf(holder1.address);
      const fee = custodyFeeOf(balance);

      await expect(token.sweepCustodyFee([holder1.address]))
        .to.emit(token, "CustodyFeeCollected")
        .withArgs(holder1.address, fee, 1)
        .and.to.emit(token, "Transfer")
        .withArgs(holder1.address, treasury.address, fee);

      expect(await token.balanceOf(holder1.address)).to.equal(balance - fee);
      expect(await token.balanceOf(treasury.address)).to.equal(fee);
      expect(await token.lastSweptCycle(holder1.address)).to.equal(1);
    });

    it("Should be idempotent within the same cycle (double sweep is a no-op)", async function () {
      await token.sweepCustodyFee([holder1.address]);
      const after = await token.balanceOf(holder1.address);
      const treasuryAfter = await token.balanceOf(treasury.address);

      await expect(token.sweepCustodyFee([holder1.address])).to.not.emit(token, "CustodyFeeCollected");
      expect(await token.balanceOf(holder1.address)).to.equal(after);
      expect(await token.balanceOf(treasury.address)).to.equal(treasuryAfter);
    });

    it("Should collect again after startNewCycle", async function () {
      await token.sweepCustodyFee([holder1.address]);

      await expect(token.startNewCycle()).to.emit(token, "CycleStarted");
      expect(await token.currentCycle()).to.equal(2);

      const balance = await token.balanceOf(holder1.address);
      const fee = custodyFeeOf(balance);
      await expect(token.sweepCustodyFee([holder1.address]))
        .to.emit(token, "CustodyFeeCollected")
        .withArgs(holder1.address, fee, 2);
    });

    it("Should skip exempt holders, the treasury and duplicates in the batch", async function () {
      await token.addCustodyFeeExempt(holder1.address);
      const b1 = await token.balanceOf(holder1.address);
      const b2 = await token.balanceOf(holder2.address);
      const fee2 = custodyFeeOf(b2);

      await token.sweepCustodyFee([holder1.address, treasury.address, holder2.address, holder2.address]);

      expect(await token.balanceOf(holder1.address)).to.equal(b1); // exempt: intatto
      expect(await token.balanceOf(holder2.address)).to.equal(b2 - fee2); // prelevato una volta sola
      expect(await token.lastSweptCycle(holder1.address)).to.equal(0); // exempt: non marcato
    });

    it("Should work while the token is paused (normal transfers revert)", async function () {
      await token.pause();

      await expect(token.connect(holder1).transfer(holder2.address, 1)).to.be.revertedWithCustomError(
        token,
        "EnforcedPause"
      );

      const balance = await token.balanceOf(holder1.address);
      const fee = custodyFeeOf(balance);
      await expect(token.sweepCustodyFee([holder1.address]))
        .to.emit(token, "CustodyFeeCollected")
        .withArgs(holder1.address, fee, 1);

      await token.unpause();
    });

    it("Should collect from frozen and blocked holders (D3)", async function () {
      await token.freeze(holder1.address);
      await token.blockAccount(holder2.address);

      const b1 = await token.balanceOf(holder1.address);
      const b2 = await token.balanceOf(holder2.address);

      await token.sweepCustodyFee([holder1.address, holder2.address]);

      expect(await token.balanceOf(holder1.address)).to.equal(b1 - custodyFeeOf(b1));
      expect(await token.balanceOf(holder2.address)).to.equal(b2 - custodyFeeOf(b2));
    });

    it("Should not apply the transfer fee on custody collection", async function () {
      // Accendi la transfer fee al massimo: lo sweep non deve pagarla
      await token.setTransferFeeBps(100);

      const balance = await token.balanceOf(holder1.address);
      const fee = custodyFeeOf(balance);
      await token.sweepCustodyFee([holder1.address]);

      // La treasury riceve ESATTAMENTE la custody fee, non fee - transferFee
      expect(await token.balanceOf(treasury.address)).to.equal(fee);
    });

    it("Should mark the cycle but transfer nothing with custodyFeeBps = 0", async function () {
      await token.setCustodyFeeBps(0);

      const balance = await token.balanceOf(holder1.address);
      await expect(token.sweepCustodyFee([holder1.address]))
        .to.not.emit(token, "CustodyFeeCollected");

      expect(await token.balanceOf(holder1.address)).to.equal(balance);
      expect(await token.balanceOf(treasury.address)).to.equal(0);
      expect(await token.lastSweptCycle(holder1.address)).to.equal(1); // comunque marcato
    });

    it("Should never take more than the balance (fee computed at execution time)", async function () {
      // Anche al cap del 2%, la fee resta una frazione del balance corrente
      await token.setCustodyFeeBps(200);
      const balance = await token.balanceOf(holder2.address);
      await token.sweepCustodyFee([holder2.address]);

      const collected = balance - (await token.balanceOf(holder2.address));
      expect(collected).to.equal((balance * 200n) / 10000n);
      expect(collected < balance).to.be.true;
    });
  });
});
