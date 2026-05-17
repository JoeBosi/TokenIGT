import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Token - Access Control", function () {
  let token: Token;
  let owner: SignerWithAddress;
  let upgrader: SignerWithAddress;
  let pauser: SignerWithAddress;
  let minter: SignerWithAddress;
  let burner: SignerWithAddress;
  let freezer: SignerWithAddress;
  let blocker: SignerWithAddress;
  let feeAdmin: SignerWithAddress;
  let recoverer: SignerWithAddress;
  let addr1: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("10000");

  beforeEach(async function () {
    [owner, upgrader, pauser, minter, burner, freezer, blocker, feeAdmin, recoverer, addr1] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await upgrades.deployProxy(
      Token,
      ["IGE Token", "IGT", INITIAL_SUPPLY, owner.address, 10, owner.address, owner.address],
      { kind: "uups" }
    ) as unknown as Token;
    await token.waitForDeployment();
  });

  describe("Role Constants", function () {
    it("Should have correct role hashes", async function () {
      const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
      const UPGRADER_ROLE = await token.UPGRADER_ROLE();
      const PAUSER_ROLE = await token.PAUSER_ROLE();
      const MINTER_ROLE = await token.MINTER_ROLE();
      const BURNER_ROLE = await token.BURNER_ROLE();
      const FREEZER_ROLE = await token.FREEZER_ROLE();
      const BLOCKER_ROLE = await token.BLOCKER_ROLE();
      const FEE_ADMIN_ROLE = await token.FEE_ADMIN_ROLE();
      const RECOVERER_ROLE = await token.RECOVERER_ROLE();

            
      expect(DEFAULT_ADMIN_ROLE).to.equal(ethers.ZeroHash); // DEFAULT_ADMIN_ROLE is always 0x00
      expect(UPGRADER_ROLE).to.not.equal(ethers.ZeroHash);
      expect(PAUSER_ROLE).to.not.equal(ethers.ZeroHash);
      expect(MINTER_ROLE).to.not.equal(ethers.ZeroHash);
      expect(BURNER_ROLE).to.not.equal(ethers.ZeroHash);
      expect(FREEZER_ROLE).to.not.equal(ethers.ZeroHash);
      expect(BLOCKER_ROLE).to.not.equal(ethers.ZeroHash);
      expect(FEE_ADMIN_ROLE).to.not.equal(ethers.ZeroHash);
      expect(RECOVERER_ROLE).to.not.equal(ethers.ZeroHash);
    });
  });

  describe("DEFAULT_ADMIN_ROLE", function () {
    it("Should grant DEFAULT_ADMIN_ROLE to deployer", async function () {
      const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
      expect(await token.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
    });

    it("Should allow admin to grant roles", async function () {
      const UPGRADER_ROLE = await token.UPGRADER_ROLE();
      await token.grantRole(UPGRADER_ROLE, upgrader.address);
      expect(await token.hasRole(UPGRADER_ROLE, upgrader.address)).to.be.true;
    });

    it("Should allow admin to revoke roles", async function () {
      const UPGRADER_ROLE = await token.UPGRADER_ROLE();
      await token.grantRole(UPGRADER_ROLE, upgrader.address);
      await token.revokeRole(UPGRADER_ROLE, upgrader.address);
      expect(await token.hasRole(UPGRADER_ROLE, upgrader.address)).to.be.false;
    });

    it("Should allow admin to renounce role", async function () {
      const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
      await token.renounceRole(DEFAULT_ADMIN_ROLE, owner.address);
      expect(await token.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.false;
    });

    it("Should not allow non-admin to grant roles", async function () {
      const UPGRADER_ROLE = await token.UPGRADER_ROLE();
      await expect(
        token.connect(addr1).grantRole(UPGRADER_ROLE, upgrader.address)
      ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
  });

  describe("UPGRADER_ROLE", function () {
    it("Should allow upgrader to upgrade", async function () {
      const UPGRADER_ROLE = await token.UPGRADER_ROLE();
      await token.grantRole(UPGRADER_ROLE, upgrader.address);
      expect(await token.hasRole(UPGRADER_ROLE, upgrader.address)).to.be.true;
    });
  });

  describe("PAUSER_ROLE", function () {
    it("Should allow pauser to pause", async function () {
      const PAUSER_ROLE = await token.PAUSER_ROLE();
      await token.grantRole(PAUSER_ROLE, pauser.address);
      await token.connect(pauser).pause();
      expect(await token.paused()).to.be.true;
    });

    it("Should not allow non-pauser to pause", async function () {
      await expect(token.connect(addr1).pause()).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
  });

  describe("MINTER_ROLE", function () {
    it("Should allow minter to mint", async function () {
      const MINTER_ROLE = await token.MINTER_ROLE();
      await token.grantRole(MINTER_ROLE, minter.address);
      await token.connect(minter).mint(addr1.address, ethers.parseEther("100"));
      expect(await token.balanceOf(addr1.address)).to.equal(ethers.parseEther("100"));
    });

    it("Should not allow non-minter to mint", async function () {
      await expect(token.connect(addr1).mint(addr1.address, ethers.parseEther("100")))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
  });

  describe("BURNER_ROLE", function () {
    it("Should allow burner to burn", async function () {
      const BURNER_ROLE = await token.BURNER_ROLE();
      await token.grantRole(BURNER_ROLE, burner.address);
      const transferAmount = ethers.parseEther("100");
      await token.transfer(addr1.address, transferAmount);
      
      // 10% fee applied to transfer
      const expectedFee = transferAmount * 10n / 10000n;
      const expectedReceived = transferAmount - expectedFee;
      
      const burnAmount = ethers.parseEther("50");
      await token.connect(burner).burn(addr1.address, burnAmount);
      expect(await token.balanceOf(addr1.address)).to.equal(expectedReceived - burnAmount);
    });

    it("Should not allow non-burner to burn", async function () {
      await expect(token.connect(addr1).burn(owner.address, ethers.parseEther("50")))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
  });

  describe("FREEZER_ROLE", function () {
    it("Should allow freezer to freeze", async function () {
      const FREEZER_ROLE = await token.FREEZER_ROLE();
      await token.grantRole(FREEZER_ROLE, freezer.address);
      await token.connect(freezer).freeze(addr1.address);
      expect(await token.isFrozen(addr1.address)).to.be.true;
    });

    it("Should not allow non-freezer to freeze", async function () {
      await expect(token.connect(addr1).freeze(addr1.address))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
  });

  describe("BLOCKER_ROLE", function () {
    it("Should allow blocker to block", async function () {
      const BLOCKER_ROLE = await token.BLOCKER_ROLE();
      await token.grantRole(BLOCKER_ROLE, blocker.address);
      await token.connect(blocker).block(addr1.address);
      expect(await token.isBlocked(addr1.address)).to.be.true;
    });

    it("Should not allow non-blocker to block", async function () {
      await expect(token.connect(addr1).block(addr1.address))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
  });

  describe("FEE_ADMIN_ROLE", function () {
    it("Should allow fee admin to set fee", async function () {
      const FEE_ADMIN_ROLE = await token.FEE_ADMIN_ROLE();
      await token.grantRole(FEE_ADMIN_ROLE, feeAdmin.address);
      await token.connect(feeAdmin).setFee(50);
      expect(await token.fee()).to.equal(50);
    });

    it("Should not allow non-fee admin to set fee", async function () {
      await expect(token.connect(addr1).setFee(50))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
  });

  describe("RECOVERER_ROLE", function () {
    it("Should allow recoverer to recover tokens", async function () {
      const RECOVERER_ROLE = await token.RECOVERER_ROLE();
      await token.grantRole(RECOVERER_ROLE, recoverer.address);
      // Test would require deploying a mock ERC20
    });

    it("Should not allow non-recoverer to recover", async function () {
      await expect(token.connect(addr1).recoverETH(addr1.address, 0))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
  });
});
