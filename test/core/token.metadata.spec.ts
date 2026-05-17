import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Token - Metadata", function () {
  let token: Token;
  let owner: SignerWithAddress;

  const TOKEN_NAME = "IGE Token";
  const TOKEN_SYMBOL = "IGT";
  const INITIAL_SUPPLY = ethers.parseEther("10000");

  beforeEach(async function () {
    [owner] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await upgrades.deployProxy(
      Token,
      [TOKEN_NAME, TOKEN_SYMBOL, INITIAL_SUPPLY, owner.address, 10, owner.address, owner.address],
      { kind: "uups" }
    ) as unknown as Token;
    await token.waitForDeployment();
  });

  describe("Name", function () {
    it("Should return the correct name", async function () {
      expect(await token.name()).to.equal(TOKEN_NAME);
    });
  });

  describe("Symbol", function () {
    it("Should return the correct symbol", async function () {
      expect(await token.symbol()).to.equal(TOKEN_SYMBOL);
    });
  });

  describe("Decimals", function () {
    it("Should return 18 decimals", async function () {
      expect(await token.decimals()).to.equal(18);
    });
  });

  describe("Total Supply", function () {
    it("Should return initial total supply", async function () {
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY);
    });

    it("Should update total supply after mint", async function () {
      const MINTER_ROLE = await token.MINTER_ROLE();
      await token.grantRole(MINTER_ROLE, owner.address);
      await token.mint(owner.address, ethers.parseEther("100"));
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY + ethers.parseEther("100"));
    });

    it("Should update total supply after burn", async function () {
      const BURNER_ROLE = await token.BURNER_ROLE();
      await token.grantRole(BURNER_ROLE, owner.address);
      await token.burn(owner.address, ethers.parseEther("50"));
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY - ethers.parseEther("50"));
    });
  });
});
