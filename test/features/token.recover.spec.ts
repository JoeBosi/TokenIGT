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
      ["IGE Token", "IGT", INITIAL_SUPPLY, owner.address, 10, owner.address, 50, owner.address, owner.address],
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

    it("Should emit AssetRecovered (kind ERC20=0, asset, to, amount, executor)", async function () {
      const amount = ethers.parseEther("50");
      await mockERC20.transfer(await token.getAddress(), amount);

      await expect(token.connect(recoverer).recoverERC20(await mockERC20.getAddress(), addr1.address, amount))
        .to.emit(token, "AssetRecovered")
        .withArgs(0, await mockERC20.getAddress(), addr1.address, amount, recoverer.address);
    });
  });

  describe("recoverNative", function () {
    it("Should allow recoverer to recover native POL", async function () {
      const amount = ethers.parseEther("1");
      await owner.sendTransaction({ to: await token.getAddress(), value: amount });

      const balanceBefore = await ethers.provider.getBalance(addr1.address);
      await token.connect(recoverer).recoverNative(addr1.address, amount);
      const balanceAfter = await ethers.provider.getBalance(addr1.address);

      expect(balanceAfter - balanceBefore).to.equal(amount);
    });

    it("Should not allow non-recoverer to recover native POL", async function () {
      await expect(token.connect(addr1).recoverNative(addr1.address, 0))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });

    it("Should fail with zero recipient", async function () {
      await expect(token.connect(recoverer).recoverNative(ethers.ZeroAddress, 0))
        .to.be.revertedWithCustomError(token, "InvalidRecipient");
    });

    it("Should emit AssetRecovered (kind Native=1, asset=0x0, to, amount, executor)", async function () {
      const amount = ethers.parseEther("1");
      await owner.sendTransaction({ to: await token.getAddress(), value: amount });

      await expect(token.connect(recoverer).recoverNative(addr1.address, amount))
        .to.emit(token, "AssetRecovered")
        .withArgs(1, ethers.ZeroAddress, addr1.address, amount, recoverer.address);
    });
  });

  describe("recoverERC721", function () {
    it("Should allow recoverer to recover ERC721 NFT", async function () {
      const tx = await mockERC721.mint(await token.getAddress());
      const receipt = await tx.wait();
      // The tokenId is returned from the mint function, get it from the transaction logs or use a simple approach
      const tokenId = 0; // First minted token has ID 0

      await token.connect(recoverer).recoverERC721(await mockERC721.getAddress(), addr1.address, tokenId);

      expect(await mockERC721.ownerOf(tokenId)).to.equal(addr1.address);
    });

    it("Should emit AssetRecovered (kind ERC721=2, asset, to, tokenId, executor)", async function () {
      await mockERC721.mint(await token.getAddress());
      const tokenId = 0;

      await expect(token.connect(recoverer).recoverERC721(await mockERC721.getAddress(), addr1.address, tokenId))
        .to.emit(token, "AssetRecovered")
        .withArgs(2, await mockERC721.getAddress(), addr1.address, tokenId, recoverer.address);
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
