import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token, TokenV2, TokenV3 } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Token - Compatibility Upgrade", function () {
  let token: Token;
  let tokenV2: TokenV2;
  let tokenV3: TokenV3;
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

  it("Should upgrade V1 -> V2 -> V3 successfully", async function () {
    const TokenV2 = await ethers.getContractFactory("TokenV2");
    tokenV2 = await upgrades.upgradeProxy(await token.getAddress(), TokenV2) as unknown as TokenV2;
    await tokenV2.waitForDeployment();

    const TokenV3 = await ethers.getContractFactory("TokenV3");
    tokenV3 = await upgrades.upgradeProxy(await token.getAddress(), TokenV3) as unknown as TokenV3;
    await tokenV3.waitForDeployment();

    expect(await tokenV3.newVariable()).to.equal(42);
  });

  it("Should preserve all state through multiple upgrades", async function () {
    await token.transfer(owner.address, ethers.parseEther("100"));
    const balanceBefore = await token.balanceOf(owner.address);

    const TokenV2 = await ethers.getContractFactory("TokenV2");
    tokenV2 = await upgrades.upgradeProxy(await token.getAddress(), TokenV2) as unknown as TokenV2;
    await tokenV2.waitForDeployment();

    const TokenV3 = await ethers.getContractFactory("TokenV3");
    tokenV3 = await upgrades.upgradeProxy(await token.getAddress(), TokenV3) as unknown as TokenV3;
    await tokenV3.waitForDeployment();

    expect(await tokenV3.balanceOf(owner.address)).to.equal(balanceBefore);
    expect(await tokenV3.name()).to.equal("IGE Token");
  });
});
