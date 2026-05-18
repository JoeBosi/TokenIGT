import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Token - Feature Interactions", function () {
  let token: Token;
  let owner: SignerWithAddress;
  let freezer: SignerWithAddress;
  let blocker: SignerWithAddress;
  let pauser: SignerWithAddress;
  let addr1: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("10000");

  beforeEach(async function () {
    [owner, freezer, blocker, pauser, addr1] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await upgrades.deployProxy(
      Token,
      ["IGE Token", "IGT", INITIAL_SUPPLY, owner.address, 0, owner.address, owner.address],
      { kind: "uups" }
    ) as unknown as Token;
    await token.waitForDeployment();

    await token.grantRole(await token.FREEZER_ROLE(), freezer.address);
    await token.grantRole(await token.BLOCKER_ROLE(), blocker.address);
    await token.grantRole(await token.PAUSER_ROLE(), pauser.address);
  });

  it("Pause should block transfer but not freeze/block", async function () {
    await token.connect(pauser).pause();
    await expect(token.transfer(addr1.address, 100)).to.be.revertedWithCustomError(token, "EnforcedPause");
    await expect(token.connect(freezer).freeze(addr1.address)).to.not.be.reverted;
  });

  it("Freeze should block transfer even when paused", async function () {
    await token.transfer(addr1.address, 100);
    await token.connect(freezer).freeze(addr1.address);
    await token.connect(pauser).pause();
    await expect(token.connect(addr1).transfer(owner.address, 50)).to.be.revertedWithCustomError(token, "AccountFrozen");
  });

  it("Block should block transfer even when paused", async function () {
    await token.connect(blocker).blockAddress(addr1.address);
    await token.connect(pauser).pause();
    await expect(token.transfer(addr1.address, 100)).to.be.revertedWithCustomError(token, "AccountBlocked");
  });

  it("Burn should override freeze and block", async function () {
    await token.grantRole(await token.BURNER_ROLE(), owner.address);
    await token.transfer(addr1.address, 100);
    await token.connect(freezer).freeze(addr1.address);
    await token.connect(blocker).blockAddress(addr1.address);
    await expect(token.burn(addr1.address, 50)).to.not.be.reverted;
  });
});
