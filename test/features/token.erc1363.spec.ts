import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token } from "../../typechain-types";
import { MockERC1363Receiver } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Token - ERC-1363", function () {
  let token: Token;
  let receiver: MockERC1363Receiver;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("10000");

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await upgrades.deployProxy(
      Token,
      ["IGE Token", "IGT", INITIAL_SUPPLY, owner.address, 10, owner.address, owner.address],
      { kind: "uups" }
    ) as unknown as Token;
    await token.waitForDeployment();

    const MockERC1363Receiver = await ethers.getContractFactory("MockERC1363Receiver");
    receiver = await MockERC1363Receiver.deploy();
    await receiver.waitForDeployment();
  });

  describe("transferAndCall", function () {
    it("Should transfer tokens and call receiver", async function () {
      const amount = ethers.parseEther("100");
      const data = "0x1234";

      await expect(token["transferAndCall(address,uint256,bytes)"](await receiver.getAddress(), amount, data))
        .to.emit(token, "Transfer")
        .to.emit(receiver, "TransferReceived");
    });

    it("Should update balances correctly", async function () {
      const amount = ethers.parseEther("100");
      await token["transferAndCall(address,uint256)"](await receiver.getAddress(), amount);

      expect(await token.balanceOf(await receiver.getAddress())).to.equal(amount);
      expect(await token.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY - amount);
    });

    it("Should work without data", async function () {
      const amount = ethers.parseEther("100");
      await expect(token["transferAndCall(address,uint256)"](await receiver.getAddress(), amount)).to.not.be.reverted;
    });
  });

  describe("transferFromAndCall", function () {
    it("Should transferFrom tokens and call receiver", async function () {
      const amount = ethers.parseEther("100");
      await token.approve(addr1.address, amount);

      await expect(token.connect(addr1).transferFromAndCall(owner.address, await receiver.getAddress(), amount))
        .to.emit(token, "Transfer")
        .to.emit(receiver, "TransferReceived");
    });

    it("Should update balances and allowance correctly", async function () {
      const amount = ethers.parseEther("100");
      await token.approve(addr1.address, amount);

      await token.connect(addr1).transferFromAndCall(owner.address, await receiver.getAddress(), amount);

      expect(await token.balanceOf(await receiver.getAddress())).to.equal(amount);
      expect(await token.allowance(owner.address, addr1.address)).to.equal(0);
    });
  });

  describe("approveAndCall", function () {
    it("Should approve and call spender", async function () {
      const amount = ethers.parseEther("100");

      await expect(token.approveAndCall(await receiver.getAddress(), amount))
        .to.emit(token, "Approval")
        .to.emit(receiver, "ApprovalReceived");
    });

    it("Should update allowance correctly", async function () {
      const amount = ethers.parseEther("100");
      await token.approveAndCall(await receiver.getAddress(), amount);

      expect(await token.allowance(owner.address, await receiver.getAddress())).to.equal(amount);
    });
  });

  describe("supportsInterface", function () {
    it("Should support ERC1363 interface", async function () {
      const ERC1363_INTERFACE_ID = "0xb0202a11";
      expect(await token.supportsInterface(ERC1363_INTERFACE_ID)).to.be.true;
    });
  });
});
