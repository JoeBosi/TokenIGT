import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Token - Freeze", function () {
  let token: Token;
  let owner: SignerWithAddress;
  let freezer: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("10000");

  beforeEach(async function () {
    [owner, freezer, addr1, addr2] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await upgrades.deployProxy(
      Token,
      ["IGE Token", "IGT", INITIAL_SUPPLY, owner.address, 10, owner.address, owner.address],
      { kind: "uups" }
    ) as unknown as Token;
    await token.waitForDeployment();

    const FREEZER_ROLE = await token.FREEZER_ROLE();
    await token.grantRole(FREEZER_ROLE, freezer.address);
  });

  describe("Freeze", function () {
    it("Should allow freezer to freeze address", async function () {
      await token.connect(freezer).freeze(addr1.address);
      expect(await token.isFrozen(addr1.address)).to.be.true;
    });

    it("Should emit Frozen event", async function () {
      await expect(token.connect(freezer).freeze(addr1.address))
        .to.emit(token, "Frozen")
        .withArgs(addr1.address);
    });

    it("Should not allow non-freezer to freeze", async function () {
      await expect(token.connect(addr1).freeze(addr2.address))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Unfreeze", function () {
    it("Should allow freezer to unfreeze address", async function () {
      await token.connect(freezer).freeze(addr1.address);
      await token.connect(freezer).unfreeze(addr1.address);
      expect(await token.isFrozen(addr1.address)).to.be.false;
    });

    it("Should emit Unfrozen event", async function () {
      await token.connect(freezer).freeze(addr1.address);
      await expect(token.connect(freezer).unfreeze(addr1.address))
        .to.emit(token, "Unfrozen")
        .withArgs(addr1.address);
    });

    it("Should not allow non-freezer to unfreeze", async function () {
      await expect(token.connect(addr1).unfreeze(addr2.address))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Frozen Transfer Restrictions", function () {
    it("Should block transfers from frozen address", async function () {
      await token.transfer(addr1.address, ethers.parseEther("100"));
      await token.connect(freezer).freeze(addr1.address);
      
      await expect(token.connect(addr1).transfer(addr2.address, ethers.parseEther("50")))
        .to.be.revertedWithCustomError(token, "AccountFrozen");
    });

    it("Should block transfers to frozen address", async function () {
      await token.connect(freezer).freeze(addr2.address);
      
      await expect(token.transfer(addr2.address, ethers.parseEther("50")))
        .to.be.revertedWithCustomError(token, "AccountFrozen");
    });

    it("Should allow burn to override freeze", async function () {
      const BURNER_ROLE = await token.BURNER_ROLE();
      await token.grantRole(BURNER_ROLE, owner.address);
      
      await token.transfer(addr1.address, ethers.parseEther("100"));
      await token.connect(freezer).freeze(addr1.address);
      
      await expect(token.burn(addr1.address, ethers.parseEther("50"))).to.not.be.reverted;
    });

    it("Should allow mint to frozen address", async function () {
      const MINTER_ROLE = await token.MINTER_ROLE();
      await token.grantRole(MINTER_ROLE, owner.address);
      
      await token.connect(freezer).freeze(addr1.address);
      
      await expect(token.mint(addr1.address, ethers.parseEther("100"))).to.not.be.reverted;
    });
  });
});
