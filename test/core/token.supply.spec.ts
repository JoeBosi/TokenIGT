import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Token - Mint and Burn", function () {
  let token: Token;
  let owner: SignerWithAddress;
  let minter: SignerWithAddress;
  let burner: SignerWithAddress;
  let addr1: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("10000");

  beforeEach(async function () {
    [owner, minter, burner, addr1] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await upgrades.deployProxy(
      Token,
      ["IGE Token", "IGT", INITIAL_SUPPLY, owner.address, 10, owner.address, owner.address],
      { kind: "uups" }
    ) as unknown as Token;
    await token.waitForDeployment();

    const MINTER_ROLE = await token.MINTER_ROLE();
    const BURNER_ROLE = await token.BURNER_ROLE();
    await token.grantRole(MINTER_ROLE, minter.address);
    await token.grantRole(BURNER_ROLE, burner.address);
  });

  describe("Mint", function () {
    it("Should allow minter to mint tokens", async function () {
      await token.connect(minter).mint(addr1.address, ethers.parseEther("100"));
      expect(await token.balanceOf(addr1.address)).to.equal(ethers.parseEther("100"));
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY + ethers.parseEther("100"));
    });

    it("Should emit Transfer event on mint", async function () {
      await expect(token.connect(minter).mint(addr1.address, ethers.parseEther("100")))
        .to.emit(token, "Transfer")
        .withArgs(ethers.ZeroAddress, addr1.address, ethers.parseEther("100"));
    });

    it("Should not allow non-minter to mint", async function () {
      await expect(token.connect(addr1).mint(addr1.address, ethers.parseEther("100")))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });

    it("Should allow multiple mints", async function () {
      await token.connect(minter).mint(addr1.address, ethers.parseEther("100"));
      await token.connect(minter).mint(addr1.address, ethers.parseEther("200"));
      expect(await token.balanceOf(addr1.address)).to.equal(ethers.parseEther("300"));
    });
  });

  describe("Burn", function () {
    it("Should allow burner to burn tokens", async function () {
      await token.transfer(addr1.address, ethers.parseEther("100"));
      await token.connect(burner).burn(addr1.address, ethers.parseEther("50"));
      expect(await token.balanceOf(addr1.address)).to.equal(ethers.parseEther("50"));
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY - ethers.parseEther("50"));
    });

    it("Should emit Transfer event on burn", async function () {
      await token.transfer(addr1.address, ethers.parseEther("100"));
      await expect(token.connect(burner).burn(addr1.address, ethers.parseEther("50")))
        .to.emit(token, "Transfer")
        .withArgs(addr1.address, ethers.ZeroAddress, ethers.parseEther("50"));
    });

    it("Should not allow non-burner to burn", async function () {
      await expect(token.connect(addr1).burn(owner.address, ethers.parseEther("50")))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });

    it("Should fail when burning more than balance", async function () {
      await token.transfer(addr1.address, ethers.parseEther("100"));
      await expect(token.connect(burner).burn(addr1.address, ethers.parseEther("200")))
        .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
    });

    it("Should burn from owner without consent", async function () {
      await token.connect(burner).burn(owner.address, ethers.parseEther("50"));
      expect(await token.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY - ethers.parseEther("50"));
    });
  });

  describe("Mint and Burn Interactions", function () {
    it("Should handle mint and burn correctly", async function () {
      await token.connect(minter).mint(addr1.address, ethers.parseEther("100"));
      await token.connect(burner).burn(addr1.address, ethers.parseEther("30"));
      expect(await token.balanceOf(addr1.address)).to.equal(ethers.parseEther("70"));
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY + ethers.parseEther("70"));
    });
  });
});
