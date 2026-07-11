import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Token - ContractURIs (websiteURI / reserveInfoURI / contractURI)", function () {
  let token: Token;
  let owner: SignerWithAddress;
  let unauthorized: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("10000");

  beforeEach(async function () {
    [owner, unauthorized] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = (await upgrades.deployProxy(
      Token,
      ["IGE Token", "IGT", INITIAL_SUPPLY, owner.address, 10, owner.address, 50, owner.address, owner.address, 3 * 24 * 60 * 60],
      { kind: "uups" }
    )) as unknown as Token;
    await token.waitForDeployment();
  });

  it("Should default all three URIs to empty strings", async function () {
    expect(await token.websiteURI()).to.equal("");
    expect(await token.reserveInfoURI()).to.equal("");
    expect(await token.contractURI()).to.equal("");
  });

  it("Should set websiteURI and emit WebsiteURIUpdated", async function () {
    await expect(token.setWebsiteURI("https://igt.example"))
      .to.emit(token, "WebsiteURIUpdated")
      .withArgs("", "https://igt.example");
    expect(await token.websiteURI()).to.equal("https://igt.example");
  });

  it("Should set reserveInfoURI and emit ReserveInfoURIUpdated", async function () {
    await expect(token.setReserveInfoURI("https://reserve.igt.example"))
      .to.emit(token, "ReserveInfoURIUpdated")
      .withArgs("", "https://reserve.igt.example");
    expect(await token.reserveInfoURI()).to.equal("https://reserve.igt.example");
  });

  it("Should set contractURI (ERC-7572) and emit ContractURIUpdated", async function () {
    await expect(token.setContractURI("https://igt.example/metadata.json"))
      .to.emit(token, "ContractURIUpdated")
      .withArgs("", "https://igt.example/metadata.json");
    expect(await token.contractURI()).to.equal("https://igt.example/metadata.json");
  });

  it("Should update independently — changing one URI leaves the others untouched", async function () {
    await token.setWebsiteURI("https://website.example");
    await token.setReserveInfoURI("https://reserve.example");
    await token.setContractURI("https://contract.example");

    await token.setWebsiteURI("https://website2.example");

    expect(await token.websiteURI()).to.equal("https://website2.example");
    expect(await token.reserveInfoURI()).to.equal("https://reserve.example");
    expect(await token.contractURI()).to.equal("https://contract.example");
  });

  it("Should require DEFAULT_ADMIN_ROLE for every setter", async function () {
    await expect(token.connect(unauthorized).setWebsiteURI("https://evil.example")).to.be.revertedWithCustomError(
      token,
      "AccessControlUnauthorizedAccount"
    );
    await expect(token.connect(unauthorized).setReserveInfoURI("https://evil.example")).to.be.revertedWithCustomError(
      token,
      "AccessControlUnauthorizedAccount"
    );
    await expect(token.connect(unauthorized).setContractURI("https://evil.example")).to.be.revertedWithCustomError(
      token,
      "AccessControlUnauthorizedAccount"
    );
  });

  it("Should NOT accept FEE_ADMIN_ROLE or SWEEPER_ROLE as sufficient — DEFAULT_ADMIN_ROLE only", async function () {
    await token.grantRole(await token.FEE_ADMIN_ROLE(), unauthorized.address);
    await expect(token.connect(unauthorized).setReserveInfoURI("https://evil.example")).to.be.revertedWithCustomError(
      token,
      "AccessControlUnauthorizedAccount"
    );
  });
});
