import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Token - EIP-2612 Permit", function () {
  let token: Token;
  let owner: SignerWithAddress;
  let spender: SignerWithAddress;
  let addr1: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("10000");

  beforeEach(async function () {
    [owner, spender, addr1] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await upgrades.deployProxy(
      Token,
      ["IGE Token", "IGT", INITIAL_SUPPLY, owner.address, 10, owner.address, owner.address],
      { kind: "uups" }
    ) as unknown as Token;
    await token.waitForDeployment();
  });

  describe("Permit", function () {
    it("Should permit using EIP-2612 signature", async function () {
      const amount = ethers.parseEther("100");
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const nonce = await token.nonces(owner.address);
      const domain = await token.eip712Domain();
      const domainSeparator = ethers.verifyTypedData(
        { name: domain.name, version: domain.version, chainId: domain.chainId, verifyingContract: domain.verifyingContract },
        { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] },
        { owner: owner.address, spender: spender.address, value: amount, nonce: nonce, deadline: deadline }
      );

      const signature = await owner.signTypedData(
        { name: domain.name, version: domain.version, chainId: domain.chainId, verifyingContract: domain.verifyingContract },
        { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] },
        { owner: owner.address, spender: spender.address, value: amount, nonce: nonce, deadline: deadline }
      );

      const { v, r, s } = ethers.Signature.from(signature);

      await token.permit(owner.address, spender.address, amount, deadline, v, r, s);

      expect(await token.allowance(owner.address, spender.address)).to.equal(amount);
    });

    it("Should increment nonce after permit", async function () {
      const amount = ethers.parseEther("100");
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonceBefore = await token.nonces(owner.address);

      const domain = await token.eip712Domain();
      const signature = await owner.signTypedData(
        { name: domain.name, version: domain.version, chainId: domain.chainId, verifyingContract: domain.verifyingContract },
        { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] },
        { owner: owner.address, spender: spender.address, value: amount, nonce: nonceBefore, deadline: deadline }
      );

      const { v, r, s } = ethers.Signature.from(signature);
      await token.permit(owner.address, spender.address, amount, deadline, v, r, s);

      const nonceAfter = await token.nonces(owner.address);
      expect(nonceAfter).to.equal(nonceBefore + 1n);
    });

    it("Should fail with expired deadline", async function () {
      const amount = ethers.parseEther("100");
      const deadline = Math.floor(Date.now() / 1000) - 3600; // Expired

      const domain = await token.eip712Domain();
      const nonce = await token.nonces(owner.address);
      const signature = await owner.signTypedData(
        { name: domain.name, version: domain.version, chainId: domain.chainId, verifyingContract: domain.verifyingContract },
        { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] },
        { owner: owner.address, spender: spender.address, value: amount, nonce: nonce, deadline: deadline }
      );

      const { v, r, s } = ethers.Signature.from(signature);

      await expect(token.permit(owner.address, spender.address, amount, deadline, v, r, s))
        .to.be.revertedWithCustomError(token, "ERC2612ExpiredSignature");
    });

    it("Should fail with invalid signature", async function () {
      const amount = ethers.parseEther("100");
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await expect(token.permit(owner.address, spender.address, amount, deadline, 27, ethers.ZeroHash, ethers.ZeroHash))
        .to.be.revertedWithCustomError(token, "ERC2612InvalidSigner");
    });
  });

  describe("Nonces", function () {
    it("Should return zero nonce for new account", async function () {
      expect(await token.nonces(addr1.address)).to.equal(0);
    });

    it("Should increment nonce after permit", async function () {
      const amount = ethers.parseEther("100");
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonceBefore = await token.nonces(owner.address);

      const domain = await token.eip712Domain();
      const signature = await owner.signTypedData(
        { name: domain.name, version: domain.version, chainId: domain.chainId, verifyingContract: domain.verifyingContract },
        { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] },
        { owner: owner.address, spender: spender.address, value: amount, nonce: nonceBefore, deadline: deadline }
      );

      const { v, r, s } = ethers.Signature.from(signature);
      await token.permit(owner.address, spender.address, amount, deadline, v, r, s);

      expect(await token.nonces(owner.address)).to.equal(nonceBefore + 1n);
    });
  });
});
