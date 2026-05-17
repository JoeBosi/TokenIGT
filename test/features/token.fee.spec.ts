import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Token - Fee", function () {
  let token: Token;
  let owner: SignerWithAddress;
  let feeAdmin: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("10000");
  const INITIAL_FEE = 10; // 0.10%

  beforeEach(async function () {
    [owner, feeAdmin, addr1, addr2] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await upgrades.deployProxy(
      Token,
      ["IGE Token", "IGT", INITIAL_SUPPLY, owner.address, INITIAL_FEE, owner.address, owner.address],
      { kind: "uups" }
    ) as unknown as Token;
    await token.waitForDeployment();

    const FEE_ADMIN_ROLE = await token.FEE_ADMIN_ROLE();
    await token.grantRole(FEE_ADMIN_ROLE, feeAdmin.address);
  });

  describe("Fee Configuration", function () {
    it("Should have initial fee set correctly", async function () {
      expect(await token.fee()).to.equal(INITIAL_FEE);
    });

    it("Should allow fee admin to set fee", async function () {
      await token.connect(feeAdmin).setFee(50);
      expect(await token.fee()).to.equal(50);
    });

    it("Should not allow fee above maximum (999)", async function () {
      await expect(token.connect(feeAdmin).setFee(1000))
        .to.be.revertedWithCustomError(token, "FeeExceedsMaximum");
    });

    it("Should allow fee at maximum (999)", async function () {
      await token.connect(feeAdmin).setFee(999);
      expect(await token.fee()).to.equal(999);
    });

    it("Should not allow non-fee admin to set fee", async function () {
      await expect(token.connect(addr1).setFee(50))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });

    it("Should allow fee admin to set fee collector", async function () {
      await token.connect(feeAdmin).setFeeCollector(addr1.address);
      expect(await token.feeCollector()).to.equal(addr1.address);
    });

    it("Should not allow zero address as fee collector", async function () {
      await expect(token.connect(feeAdmin).setFeeCollector(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(token, "InvalidFeeCollector");
    });
  });

  describe("Fee Whitelist", function () {
    it("Should allow fee admin to add fee-free address", async function () {
      await token.connect(feeAdmin).addFeeFree(addr1.address);
      expect(await token.isFeeFree(addr1.address)).to.be.true;
    });

    it("Should allow fee admin to remove fee-free address", async function () {
      await token.connect(feeAdmin).addFeeFree(addr1.address);
      await token.connect(feeAdmin).removeFeeFree(addr1.address);
      expect(await token.isFeeFree(addr1.address)).to.be.false;
    });

    it("Should not allow non-fee admin to add fee-free address", async function () {
      await expect(token.connect(addr1).addFeeFree(addr2.address))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Fee Application", function () {
    it("Should apply fee on transfer", async function () {
      const transferAmount = ethers.parseEther("1000");
      const expectedFee = (transferAmount * BigInt(INITIAL_FEE)) / 10000n; // 10 basis points
      const expectedReceived = transferAmount - expectedFee;

      await token.transfer(addr1.address, transferAmount);
      
      const addr1Balance = await token.balanceOf(addr1.address);
      const feeCollectorBalance = await token.balanceOf(owner.address);
      
      expect(addr1Balance).to.equal(expectedReceived);
      expect(feeCollectorBalance).to.equal(INITIAL_SUPPLY - transferAmount + expectedFee);
    });

    it("Should not apply fee when fee is zero", async function () {
      await token.connect(feeAdmin).setFee(0);
      const transferAmount = ethers.parseEther("1000");
      
      await token.transfer(addr1.address, transferAmount);
      
      expect(await token.balanceOf(addr1.address)).to.equal(transferAmount);
    });

    it("Should not apply fee to mint", async function () {
      const MINTER_ROLE = await token.MINTER_ROLE();
      await token.grantRole(MINTER_ROLE, owner.address);
      
      const mintAmount = ethers.parseEther("1000");
      await token.mint(addr1.address, mintAmount);
      
      expect(await token.balanceOf(addr1.address)).to.equal(mintAmount);
    });

    it("Should not apply fee to burn", async function () {
      const BURNER_ROLE = await token.BURNER_ROLE();
      await token.grantRole(BURNER_ROLE, owner.address);
      
      await token.transfer(addr1.address, ethers.parseEther("1000"));
      const balanceBefore = await token.balanceOf(addr1.address);
      
      await token.burn(addr1.address, ethers.parseEther("100"));
      
      expect(await token.balanceOf(addr1.address)).to.equal(balanceBefore - ethers.parseEther("100"));
    });

    it("Should not apply fee when sender is fee-free", async function () {
      await token.connect(feeAdmin).addFeeFree(owner.address);
      const transferAmount = ethers.parseEther("1000");
      
      await token.transfer(addr1.address, transferAmount);
      
      expect(await token.balanceOf(addr1.address)).to.equal(transferAmount);
    });

    it("Should not apply fee when recipient is fee-free", async function () {
      await token.connect(feeAdmin).addFeeFree(addr1.address);
      const transferAmount = ethers.parseEther("1000");
      
      await token.transfer(addr1.address, transferAmount);
      
      expect(await token.balanceOf(addr1.address)).to.equal(transferAmount);
    });
  });
});
