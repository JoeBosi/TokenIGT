import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Parità Hardhat dei fix d'audit v2.5.0 (dettaglio in AUDIT_STRUTTURE_DATI.md):
 *  - A3: initialize reverta se supply>0 && holder==0 (InvalidInitialHolder)
 *  - A4: freeze/block(address(0)) revertano (InvalidFreezeAccount/InvalidBlockAccount)
 *  - A2: setContractURI emette anche l'evento canonico ERC-7572 ContractURIUpdated()
 *  - isRestricted(account) = blocked || frozen
 *  - getTransferFeeExemptCount / getCustodyFeeExemptCount
 */
describe("Token - audit fixes v2.5.0", function () {
  let token: Token;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("10000");
  const DELAY = 3 * 24 * 60 * 60;

  async function deploy(supply: bigint, holder: string): Promise<Token> {
    const Token = await ethers.getContractFactory("Token");
    const t = (await upgrades.deployProxy(
      Token,
      ["IGE Token", "IGT", supply, holder, 10, owner.address, 50, owner.address, owner.address, DELAY],
      { kind: "uups" }
    )) as unknown as Token;
    await t.waitForDeployment();
    return t;
  }

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();
    token = await deploy(INITIAL_SUPPLY, owner.address);
    await token.grantRole(await token.FREEZER_ROLE(), owner.address);
    await token.grantRole(await token.BLOCKER_ROLE(), owner.address);
  });

  it("A3: initialize reverts when supply>0 and holder==0", async function () {
    const Token = await ethers.getContractFactory("Token");
    await expect(
      upgrades.deployProxy(
        Token,
        ["IGE Token", "IGT", INITIAL_SUPPLY, ethers.ZeroAddress, 10, owner.address, 50, owner.address, owner.address, DELAY],
        { kind: "uups" }
      )
    ).to.be.revertedWithCustomError(Token, "InvalidInitialHolder");
  });

  it("A4: freeze/unfreeze(address(0)) revert", async function () {
    await expect(token.freeze(ethers.ZeroAddress)).to.be.revertedWithCustomError(token, "InvalidFreezeAccount");
    await expect(token.unfreeze(ethers.ZeroAddress)).to.be.revertedWithCustomError(token, "InvalidFreezeAccount");
  });

  it("A4: blockAccount/unblockAccount(address(0)) revert", async function () {
    await expect(token.blockAccount(ethers.ZeroAddress)).to.be.revertedWithCustomError(token, "InvalidBlockAccount");
    await expect(token.unblockAccount(ethers.ZeroAddress)).to.be.revertedWithCustomError(token, "InvalidBlockAccount");
  });

  it("A2: setContractURI emits the canonical ERC-7572 ContractURIUpdated() event", async function () {
    const canonicalTopic = ethers.id("ContractURIUpdated()");
    const tx = await token.setContractURI("ipfs://meta");
    const receipt = await tx.wait();
    const tokenAddr = (await token.getAddress()).toLowerCase();
    const found = receipt!.logs.some(
      (l) => l.address.toLowerCase() === tokenAddr && l.topics.length === 1 && l.topics[0] === canonicalTopic
    );
    expect(found).to.equal(true);
  });

  it("isRestricted combines blocked and frozen", async function () {
    expect(await token.isRestricted(user.address)).to.equal(false);
    await token.freeze(user.address);
    expect(await token.isRestricted(user.address)).to.equal(true);
    await token.unfreeze(user.address);
    await token.blockAccount(user.address);
    expect(await token.isRestricted(user.address)).to.equal(true);
  });

  it("exempt count getters track set size", async function () {
    expect(await token.getTransferFeeExemptCount()).to.equal(0);
    expect(await token.getCustodyFeeExemptCount()).to.equal(0);
    await token.addTransferFeeExempt(user.address);
    await token.addCustodyFeeExempt(user.address);
    await token.addCustodyFeeExempt(owner.address);
    expect(await token.getTransferFeeExemptCount()).to.equal(1);
    expect(await token.getCustodyFeeExemptCount()).to.equal(2);
  });
});
