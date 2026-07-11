import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Cross-checks for the v2.4.0 role split (FeeRoles.sol): FEE_ADMIN_ROLE
 * (governance setters) vs SWEEPER_ROLE (operational cycle/sweep). Each role
 * must be able to do its own job and MUST NOT be able to do the other's.
 */
describe("Token - Fee Role Split (FEE_ADMIN_ROLE vs SWEEPER_ROLE)", function () {
  let token: Token;
  let owner: SignerWithAddress;
  let feeAdmin: SignerWithAddress;
  let sweeper: SignerWithAddress;
  let holder: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("10000");

  beforeEach(async function () {
    [owner, feeAdmin, sweeper, holder] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = (await upgrades.deployProxy(
      Token,
      ["IGE Token", "IGT", INITIAL_SUPPLY, holder.address, 10, owner.address, 50, owner.address, owner.address, 3 * 24 * 60 * 60],
      { kind: "uups" }
    )) as unknown as Token;
    await token.waitForDeployment();

    await token.grantRole(await token.FEE_ADMIN_ROLE(), feeAdmin.address);
    await token.grantRole(await token.SWEEPER_ROLE(), sweeper.address);
  });

  describe("FEE_ADMIN_ROLE — positive", function () {
    it("Should let fee admin set transfer/custody fee parameters", async function () {
      await token.connect(feeAdmin).setTransferFeeBps(25);
      expect(await token.transferFeeBps()).to.equal(25);

      await token.connect(feeAdmin).setCustodyFeeBps(75);
      expect(await token.custodyFeeBps()).to.equal(75);
    });
  });

  describe("FEE_ADMIN_ROLE — negative (cannot sweep)", function () {
    it("Should not allow fee admin to start a new cycle", async function () {
      await expect(token.connect(feeAdmin).startNewCycle()).to.be.revertedWithCustomError(
        token,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("Should not allow fee admin to sweep custody fee", async function () {
      await expect(token.connect(feeAdmin).sweepCustodyFee([holder.address])).to.be.revertedWithCustomError(
        token,
        "AccessControlUnauthorizedAccount"
      );
    });
  });

  describe("SWEEPER_ROLE — positive", function () {
    it("Should let the sweeper start a new cycle and sweep", async function () {
      await token.connect(sweeper).startNewCycle();
      expect(await token.currentCycle()).to.equal(2);

      await token.connect(sweeper).sweepCustodyFee([holder.address]);
      expect(await token.lastSweptCycle(holder.address)).to.equal(2);
    });
  });

  describe("SWEEPER_ROLE — negative (cannot touch governance parameters)", function () {
    it("Should not allow the sweeper to set the transfer fee", async function () {
      await expect(token.connect(sweeper).setTransferFeeBps(25)).to.be.revertedWithCustomError(
        token,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("Should not allow the sweeper to set the fee collector", async function () {
      await expect(token.connect(sweeper).setFeeCollector(sweeper.address)).to.be.revertedWithCustomError(
        token,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("Should not allow the sweeper to change the custody treasury", async function () {
      await expect(token.connect(sweeper).setCustodyTreasury(sweeper.address)).to.be.revertedWithCustomError(
        token,
        "AccessControlUnauthorizedAccount"
      );
    });
  });

  describe("Independence", function () {
    it("Should grant/revoke each role without affecting the other", async function () {
      const dual = holder;
      await token.grantRole(await token.FEE_ADMIN_ROLE(), dual.address);
      await token.grantRole(await token.SWEEPER_ROLE(), dual.address);

      await token.revokeRole(await token.FEE_ADMIN_ROLE(), dual.address);

      expect(await token.hasRole(await token.FEE_ADMIN_ROLE(), dual.address)).to.be.false;
      expect(await token.hasRole(await token.SWEEPER_ROLE(), dual.address)).to.be.true;
    });
  });
});
