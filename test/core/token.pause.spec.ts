import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Token - Pausable", function () {
  let token: Token;
  let owner: SignerWithAddress;
  let pauser: SignerWithAddress;
  let addr1: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("10000");

  beforeEach(async function () {
    [owner, pauser, addr1] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await upgrades.deployProxy(
      Token,
      ["IGE Token", "IGT", INITIAL_SUPPLY, owner.address, 10, owner.address, owner.address],
      { kind: "uups" }
    ) as unknown as Token;
    await token.waitForDeployment();

    const PAUSER_ROLE = await token.PAUSER_ROLE();
    await token.grantRole(PAUSER_ROLE, pauser.address);
  });

  describe("Pause", function () {
    it("Should allow pauser to pause", async function () {
      await token.connect(pauser).pause();
      expect(await token.paused()).to.be.true;
    });

    it("Should emit Paused event", async function () {
      await expect(token.connect(pauser).pause())
        .to.emit(token, "Paused")
        .withArgs(pauser.address);
    });

    it("Should block transfers when paused", async function () {
      await token.connect(pauser).pause();
      await expect(token.transfer(addr1.address, ethers.parseEther("100")))
        .to.be.revertedWithCustomError(token, "EnforcedPause");
    });

    it("Should block transferFrom when paused", async function () {
      await token.approve(addr1.address, ethers.parseEther("100"));
      await token.connect(pauser).pause();
      await expect(token.connect(addr1).transferFrom(owner.address, addr1.address, ethers.parseEther("50")))
        .to.be.revertedWithCustomError(token, "EnforcedPause");
    });

    it("Should NOT block approve when paused", async function () {
      await token.connect(pauser).pause();
      await expect(token.approve(addr1.address, ethers.parseEther("100"))).to.not.be.reverted;
    });

    it("Should NOT block mint when paused", async function () {
      const MINTER_ROLE = await token.MINTER_ROLE();
      await token.grantRole(MINTER_ROLE, owner.address);
      await token.connect(pauser).pause();
      await expect(token.mint(addr1.address, ethers.parseEther("100"))).to.not.be.reverted;
    });

    it("Should NOT block burn when paused", async function () {
      const BURNER_ROLE = await token.BURNER_ROLE();
      await token.grantRole(BURNER_ROLE, owner.address);
      await token.connect(pauser).pause();
      await expect(token.burn(owner.address, ethers.parseEther("100"))).to.not.be.reverted;
    });
  });

  describe("Unpause", function () {
    it("Should allow pauser to unpause", async function () {
      await token.connect(pauser).pause();
      await token.connect(pauser).unpause();
      expect(await token.paused()).to.be.false;
    });

    it("Should emit Unpaused event", async function () {
      await token.connect(pauser).pause();
      await expect(token.connect(pauser).unpause())
        .to.emit(token, "Unpaused")
        .withArgs(pauser.address);
    });

    it("Should allow transfers after unpause", async function () {
      await token.connect(pauser).pause();
      await token.connect(pauser).unpause();
      await expect(token.transfer(addr1.address, ethers.parseEther("100"))).to.not.be.reverted;
    });
  });
});
