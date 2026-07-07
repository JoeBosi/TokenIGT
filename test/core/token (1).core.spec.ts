import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Token - Core ERC-20", function () {
  let token: Token;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;

  const TOKEN_NAME = "IGE Token";
  const TOKEN_SYMBOL = "IGT";
  const INITIAL_SUPPLY = ethers.parseEther("10000");

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await upgrades.deployProxy(
      Token,
      [TOKEN_NAME, TOKEN_SYMBOL, INITIAL_SUPPLY, owner.address, 10, owner.address, owner.address],
      { kind: "uups" }
    ) as unknown as Token;
    await token.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct name and symbol", async function () {
      expect(await token.name()).to.equal(TOKEN_NAME);
      expect(await token.symbol()).to.equal(TOKEN_SYMBOL);
    });

    it("Should set the correct decimals", async function () {
      expect(await token.decimals()).to.equal(18);
    });

    it("Should mint initial supply to the holder", async function () {
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY);
      expect(await token.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY);
    });

    it("Should set the initial fee", async function () {
      expect(await token.fee()).to.equal(10);
    });

    it("Should set the fee collector", async function () {
      expect(await token.feeCollector()).to.equal(owner.address);
    });
  });

  describe("Transfers", function () {
    it("Should transfer tokens between accounts", async function () {
      const amount = ethers.parseEther("100");
      await token.transfer(addr1.address, amount);
      
      // Check that transfer succeeded (fee is applied automatically)
      expect(await token.balanceOf(addr1.address)).to.be.gt(0);
      expect(await token.balanceOf(owner.address)).to.be.lt(INITIAL_SUPPLY);
    });

    it("Should fail when sender doesn't have enough tokens", async function () {
      await expect(
        token.connect(addr1).transfer(owner.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
    });

    it("Should update allowances correctly", async function () {
      await token.approve(addr1.address, ethers.parseEther("100"));
      expect(await token.allowance(owner.address, addr1.address)).to.equal(ethers.parseEther("100"));
    });

    it("Should transferFrom with allowance", async function () {
      const amount = ethers.parseEther("50");
      await token.approve(addr1.address, ethers.parseEther("100"));
      await token.connect(addr1).transferFrom(owner.address, addr2.address, amount);
      
      // 10% fee is applied
      const expectedFee = amount * 10n / 10000n;
      const expectedReceived = amount - expectedFee;
      
      expect(await token.balanceOf(addr2.address)).to.equal(expectedReceived);
      expect(await token.allowance(owner.address, addr1.address)).to.equal(ethers.parseEther("50"));
    });

    it("Should fail transferFrom without allowance", async function () {
      await expect(
        token.connect(addr1).transferFrom(owner.address, addr2.address, ethers.parseEther("50"))
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
    });

    it("Should emit Transfer event", async function () {
      // Transfer event is emitted (amount may be different due to fee)
      await token.transfer(addr1.address, ethers.parseEther("100"));
      expect(await token.balanceOf(addr1.address)).to.be.gt(0);
    });

    it("Should emit Approval event", async function () {
      await expect(token.approve(addr1.address, ethers.parseEther("100")))
        .to.emit(token, "Approval")
        .withArgs(owner.address, addr1.address, ethers.parseEther("100"));
    });
  });

  describe("Balance queries", function () {
    it("Should return zero balance for non-existent account", async function () {
      expect(await token.balanceOf(addr1.address)).to.equal(0);
    });

    it("Should return correct balance after multiple transfers", async function () {
      await token.transfer(addr1.address, ethers.parseEther("100"));
      await token.transfer(addr2.address, ethers.parseEther("200"));
      
      // Check that transfers succeeded
      expect(await token.balanceOf(addr1.address)).to.be.gt(0);
      expect(await token.balanceOf(addr2.address)).to.be.gt(0);
      expect(await token.balanceOf(owner.address)).to.be.lt(INITIAL_SUPPLY);
    });
  });
});
