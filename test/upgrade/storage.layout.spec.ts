import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token, TokenV2, TokenV3 } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { validateUpgrade } from "@openzeppelin/upgrades-core";

describe("Token - Storage Layout Validation", function () {
  let owner: SignerWithAddress;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();
  });

  it("Should validate V1 -> V2 storage layout", async function () {
    const Token = await ethers.getContractFactory("Token");
    const TokenV2 = await ethers.getContractFactory("TokenV2");

    const validation = await validateUpgrade(Token, TokenV2);
    expect(validation.error).to.be.undefined;
  });

  it("Should validate V2 -> V3 storage layout", async function () {
    const TokenV2 = await ethers.getContractFactory("TokenV2");
    const TokenV3 = await ethers.getContractFactory("TokenV3");

    const validation = await validateUpgrade(TokenV2, TokenV3);
    expect(validation.error).to.be.undefined;
  });

  it("Should validate V1 -> V3 storage layout", async function () {
    const Token = await ethers.getContractFactory("Token");
    const TokenV3 = await ethers.getContractFactory("TokenV3");

    const validation = await validateUpgrade(Token, TokenV3);
    expect(validation.error).to.be.undefined;
  });
});
