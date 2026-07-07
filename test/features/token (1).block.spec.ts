import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Token - Block", function () {
  let token: Token;
  let owner: SignerWithAddress;
  let blocker: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("10000");

  beforeEach(async function () {
    [owner, blocker, addr1, addr2] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await upgrades.deployProxy(
      Token,
      ["IGE Token", "IGT", INITIAL_SUPPLY, owner.address, 0, owner.address, owner.address], // 0 fee for block tests
      { kind: "uups" }
    ) as unknown as Token;
    await token.waitForDeployment();

    const BLOCKER_ROLE = await token.BLOCKER_ROLE();
    await token.grantRole(BLOCKER_ROLE, blocker.address);
  });

  describe("Block", function () {
    it("Should allow blocker to block address", async function () {
      await token.connect(blocker).blockAddress(addr1.address);
      expect(await token.isBlocked(addr1.address)).to.be.true;
    });

    it("Should emit Blocked event", async function () {
      await expect(token.connect(blocker).blockAddress(addr1.address))
        .to.emit(token, "Blocked")
        .withArgs(addr1.address);
    });

    it("Should not allow non-blocker to block", async function () {
      await expect(token.connect(addr1).blockAddress(addr2.address))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Unblock", function () {
    it("Should allow blocker to unblock address", async function () {
      await token.connect(blocker).blockAddress(addr1.address);
      await token.connect(blocker).unblock(addr1.address);
      expect(await token.isBlocked(addr1.address)).to.be.false;
    });

    it("Should emit Unblocked event", async function () {
      await token.connect(blocker).blockAddress(addr1.address);
      await expect(token.connect(blocker).unblock(addr1.address))
        .to.emit(token, "Unblocked")
        .withArgs(addr1.address);
    });

    it("Should not allow non-blocker to unblock", async function () {
      await expect(token.connect(addr1).unblock(addr2.address))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Blocked Transfer Restrictions", function () {
    it("Should block transfers from blocked address", async function () {
      await token.transfer(addr1.address, ethers.parseEther("100"));
      await token.connect(blocker).blockAddress(addr1.address);
      
      await expect(token.connect(addr1).transfer(addr2.address, ethers.parseEther("50")))
        .to.be.revertedWithCustomError(token, "AccountBlocked");
    });

    it("Should block transfers to blocked address", async function () {
      await token.connect(blocker).blockAddress(addr2.address);
      
      await expect(token.transfer(addr2.address, ethers.parseEther("50")))
        .to.be.revertedWithCustomError(token, "AccountBlocked");
    });

    it("Should NOT block burn from blocked address", async function () {
      const BURNER_ROLE = await token.BURNER_ROLE();
      await token.grantRole(BURNER_ROLE, owner.address);
      
      await token.transfer(addr1.address, ethers.parseEther("100"));
      await token.connect(blocker).blockAddress(addr1.address);
      
      await expect(token.burn(addr1.address, ethers.parseEther("50"))).to.not.be.reverted;
    });

    it("Should NOT block mint to blocked address", async function () {
      const MINTER_ROLE = await token.MINTER_ROLE();
      await token.grantRole(MINTER_ROLE, owner.address);
      
      await token.connect(blocker).blockAddress(addr1.address);
      
      await expect(token.mint(addr1.address, ethers.parseEther("100"))).to.not.be.reverted;
    });
  });
});
