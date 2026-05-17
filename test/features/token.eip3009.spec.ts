import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Token - EIP-3009 Transfer With Authorization", function () {
  let token: Token;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("10000");

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await upgrades.deployProxy(
      Token,
      ["IGE Token", "IGT", INITIAL_SUPPLY, owner.address, 10, owner.address, owner.address],
      { kind: "uups" }
    ) as unknown as Token;
    await token.waitForDeployment();
  });

  describe("transferWithAuthorization", function () {
    it("Should execute transfer with valid authorization", async function () {
      const amount = ethers.parseEther("100");
      const validAfter = Math.floor(Date.now() / 1000) - 3600;
      const validBefore = Math.floor(Date.now() / 1000) + 3600;
      const nonce = ethers.keccak256(ethers.toUtf8Bytes("test-nonce-1"));

      const domain = await token.eip712Domain();
      const signature = await owner.signTypedData(
        { name: domain.name, version: domain.version, chainId: domain.chainId, verifyingContract: domain.verifyingContract },
        { TransferWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
        { from: owner.address, to: addr1.address, value: amount, validAfter: validAfter, validBefore: validBefore, nonce: nonce }
      );

      const { v, r, s } = ethers.Signature.from(signature);

      await token.transferWithAuthorization(owner.address, addr1.address, amount, validAfter, validBefore, nonce, v, r, s);

      expect(await token.balanceOf(addr1.address)).to.equal(amount);
      expect(await token.authorizationState(owner.address, nonce)).to.be.true;
    });

    it("Should emit AuthorizationUsed event", async function () {
      const amount = ethers.parseEther("100");
      const validAfter = Math.floor(Date.now() / 1000) - 3600;
      const validBefore = Math.floor(Date.now() / 1000) + 3600;
      const nonce = ethers.keccak256(ethers.toUtf8Bytes("test-nonce-2"));

      const domain = await token.eip712Domain();
      const signature = await owner.signTypedData(
        { name: domain.name, version: domain.version, chainId: domain.chainId, verifyingContract: domain.verifyingContract },
        { TransferWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
        { from: owner.address, to: addr1.address, value: amount, validAfter: validAfter, validBefore: validBefore, nonce: nonce }
      );

      const { v, r, s } = ethers.Signature.from(signature);

      await expect(token.transferWithAuthorization(owner.address, addr1.address, amount, validAfter, validBefore, nonce, v, r, s))
        .to.emit(token, "AuthorizationUsed")
        .withArgs(owner.address, nonce);
    });

    it("Should fail with used nonce", async function () {
      const amount = ethers.parseEther("100");
      const validAfter = Math.floor(Date.now() / 1000) - 3600;
      const validBefore = Math.floor(Date.now() / 1000) + 3600;
      const nonce = ethers.keccak256(ethers.toUtf8Bytes("test-nonce-3"));

      const domain = await token.eip712Domain();
      const signature = await owner.signTypedData(
        { name: domain.name, version: domain.version, chainId: domain.chainId, verifyingContract: domain.verifyingContract },
        { TransferWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
        { from: owner.address, to: addr1.address, value: amount, validAfter: validAfter, validBefore: validBefore, nonce: nonce }
      );

      const { v, r, s } = ethers.Signature.from(signature);

      await token.transferWithAuthorization(owner.address, addr1.address, amount, validAfter, validBefore, nonce, v, r, s);

      await expect(token.transferWithAuthorization(owner.address, addr2.address, amount, validAfter, validBefore, nonce, v, r, s))
        .to.be.revertedWithCustomError(token, "AuthorizationAlreadyUsed");
    });

    it("Should fail with expired authorization", async function () {
      const amount = ethers.parseEther("100");
      const validAfter = Math.floor(Date.now() / 1000) - 7200;
      const validBefore = Math.floor(Date.now() / 1000) - 3600;
      const nonce = ethers.keccak256(ethers.toUtf8Bytes("test-nonce-4"));

      const domain = await token.eip712Domain();
      const signature = await owner.signTypedData(
        { name: domain.name, version: domain.version, chainId: domain.chainId, verifyingContract: domain.verifyingContract },
        { TransferWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
        { from: owner.address, to: addr1.address, value: amount, validAfter: validAfter, validBefore: validBefore, nonce: nonce }
      );

      const { v, r, s } = ethers.Signature.from(signature);

      await expect(token.transferWithAuthorization(owner.address, addr1.address, amount, validAfter, validBefore, nonce, v, r, s))
        .to.be.revertedWithCustomError(token, "AuthorizationExpired");
    });
  });

  describe("receiveWithAuthorization", function () {
    it("Should execute transfer with valid authorization (recipient calls)", async function () {
      const amount = ethers.parseEther("100");
      const validAfter = Math.floor(Date.now() / 1000) - 3600;
      const validBefore = Math.floor(Date.now() / 1000) + 3600;
      const nonce = ethers.keccak256(ethers.toUtf8Bytes("test-nonce-5"));

      const domain = await token.eip712Domain();
      const signature = await owner.signTypedData(
        { name: domain.name, version: domain.version, chainId: domain.chainId, verifyingContract: domain.verifyingContract },
        { TransferWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
        { from: owner.address, to: addr1.address, value: amount, validAfter: validAfter, validBefore: validBefore, nonce: nonce }
      );

      const { v, r, s } = ethers.Signature.from(signature);

      await token.connect(addr1).receiveWithAuthorization(owner.address, addr1.address, amount, validAfter, validBefore, nonce, v, r, s);

      expect(await token.balanceOf(addr1.address)).to.equal(amount);
    });

    it("Should fail when recipient is not msg.sender", async function () {
      const amount = ethers.parseEther("100");
      const validAfter = Math.floor(Date.now() / 1000) - 3600;
      const validBefore = Math.floor(Date.now() / 1000) + 3600;
      const nonce = ethers.keccak256(ethers.toUtf8Bytes("test-nonce-6"));

      const domain = await token.eip712Domain();
      const signature = await owner.signTypedData(
        { name: domain.name, version: domain.version, chainId: domain.chainId, verifyingContract: domain.verifyingContract },
        { TransferWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
        { from: owner.address, to: addr1.address, value: amount, validAfter: validAfter, validBefore: validBefore, nonce: nonce }
      );

      const { v, r, s } = ethers.Signature.from(signature);

      await expect(token.receiveWithAuthorization(owner.address, addr1.address, amount, validAfter, validBefore, nonce, v, r, s))
        .to.be.revertedWithCustomError(token, "InvalidSignature");
    });
  });

  describe("cancelAuthorization", function () {
    it("Should cancel authorization", async function () {
      const nonce = ethers.keccak256(ethers.toUtf8Bytes("test-nonce-7"));

      const domain = await token.eip712Domain();
      const signature = await owner.signTypedData(
        { name: domain.name, version: domain.version, chainId: domain.chainId, verifyingContract: domain.verifyingContract },
        { CancelAuthorization: [{ name: "authorizer", type: "address" }, { name: "nonce", type: "bytes32" }] },
        { authorizer: owner.address, nonce: nonce }
      );

      const { v, r, s } = ethers.Signature.from(signature);

      await token.cancelAuthorization(owner.address, nonce, v, r, s);

      expect(await token.authorizationState(owner.address, nonce)).to.be.true;
    });
  });
});
