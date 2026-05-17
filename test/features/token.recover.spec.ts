import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token } from "../../typechain-types";
import { MockERC20, MockERC721 } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Token - Recoverable", function () {
  let token: Token;
  let mockERC20: MockERC20;
  let mockERC721: MockERC721;
  let owner: SignerWithAddress;
  let recoverer: SignerWithAddress;
  let addr1: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("10000");

  beforeEach(async function () {
    [owner, recoverer, addr1] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await upgrades.deployProxy(
      Token,
      ["IGE Token", "IGT", INITIAL_SUPPLY, owner.address, 10, owner.address, owner.address],
      { kind: "uups" }
    ) as unknown as Token;
    await token.waitForDeployment();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockERC20 = await MockERC20.deploy();
    await mockERC20.waitForDeployment();

    const MockERC721 = await ethers.getContractFactory("MockERC721");
    mockERC721 = await MockERC721.deploy();
    await mockERC721.waitForDeployment();

    const RECOVERER_ROLE = await token.RECOVERER_ROLE();
    await token.grantRole(RECOVERER_ROLE, recoverer.address);
  });

  describe("recoverERC20", function () {
    it("Should allow recoverer to recover ERC20 tokens", async function () {
      const amount = ethers.parseEther("100");
      await mockERC20.transfer(await token.getAddress(), amount);

      const balanceBefore = await mockERC20.balanceOf(addr1.address);
      await token.connect(recoverer).recoverERC20(await mockERC20.getAddress(), addr1.address, amount);
      const balanceAfter = await mockERC20.balanceOf(addr1.address);

      expect(balanceAfter - balanceBefore).to.equal(amount);
    });

    it("Should not allow non-recoverer to recover ERC20", async function () {
      await expect(token.connect(addr1).recoverERC20(await mockERC20.getAddress(), addr1.address, 0))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });

    it("Should fail with zero recipient", async function () {
      await expect(token.connect(recoverer).recoverERC20(await mockERC20.getAddress(), ethers.ZeroAddress, 0))
        .to.be.revertedWithCustomError(token, "InvalidRecipient");
    });
  });

  describe("recoverETH", function () {
    it("Should allow recoverer to recover ETH", async function () {
      const amount = ethers.parseEther("1");
      await owner.sendTransaction({ to: await token.getAddress(), value: amount });

      const balanceBefore = await ethers.provider.getBalance(addr1.address);
      await token.connect(recoverer).recoverETH(addr1.address, amount);
      const balanceAfter = await ethers.provider.getBalance(addr1.address);

      expect(balanceAfter - balanceBefore).to.equal(amount);
    });

    it("Should not allow non-recoverer to recover ETH", async function () {
      await expect(token.connect(addr1).recoverETH(addr1.address, 0))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });

    it("Should fail with zero recipient", async function () {
      await expect(token.connect(recoverer).recoverETH(ethers.ZeroAddress, 0))
        .to.be.revertedWithCustomError(token, "InvalidRecipient");
    });
  });

  describe("recoverERC721", function () {
    it("Should allow recoverer to recover ERC721 NFT", async function () {
      const tokenId = await mockERC721.mint(await token.getAddress());

      await token.connect(recoverer).recoverERC721(await mockERC721.getAddress(), addr1.address, tokenId);

      expect(await mockERC721.ownerOf(tokenId)).to.equal(addr1.address);
    });

    it("Should not allow non-recoverer to recover ERC721", async function () {
      await expect(token.connect(addr1).recoverERC721(await mockERC721.getAddress(), addr1.address, 0))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });

    it("Should fail with zero recipient", async function () {
      await expect(token.connect(recoverer).recoverERC721(await mockERC721.getAddress(), ethers.ZeroAddress, 0))
        .to.be.revertedWithCustomError(token, "InvalidRecipient");
    });
  });
});
