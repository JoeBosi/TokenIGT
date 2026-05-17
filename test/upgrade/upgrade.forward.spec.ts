import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token, TokenV2 } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Token - Forward Upgrade", function () {
  let token: Token;
  let tokenV2: TokenV2;
  let owner: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("10000");

  beforeEach(async function () {
    [owner] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await upgrades.deployProxy(
      Token,
      ["IGE Token", "IGT", INITIAL_SUPPLY, owner.address, 10, owner.address, owner.address],
      { kind: "uups" }
    ) as unknown as Token;
    await token.waitForDeployment();
  });

  it("Should upgrade to V2 successfully", async function () {
    const TokenV2 = await ethers.getContractFactory("TokenV2");
    tokenV2 = await upgrades.upgradeProxy(await token.getAddress(), TokenV2) as unknown as TokenV2;
    await tokenV2.waitForDeployment();

    expect(await tokenV2.newVariable()).to.equal(42);
  });

  it("Should preserve state after upgrade", async function () {
    await token.transfer(owner.address, ethers.parseEther("100"));
    const balanceBefore = await token.balanceOf(owner.address);

    const TokenV2 = await ethers.getContractFactory("TokenV2");
    tokenV2 = await upgrades.upgradeProxy(await token.getAddress(), TokenV2) as unknown as TokenV2;
    await tokenV2.waitForDeployment();

    expect(await tokenV2.balanceOf(owner.address)).to.equal(balanceBefore);
    expect(await tokenV2.name()).to.equal("IGE Token");
  });

  it("Should call new function after upgrade", async function () {
    const TokenV2 = await ethers.getContractFactory("TokenV2");
    tokenV2 = await upgrades.upgradeProxy(await token.getAddress(), TokenV2) as unknown as TokenV2;
    await tokenV2.waitForDeployment();

    await expect(tokenV2.newFunction()).to.not.be.reverted;
  });
});
