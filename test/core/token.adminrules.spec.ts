import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Coverage for AccessControlDefaultAdminRulesUpgradeable as wired into
 * Token.sol (v2.4.0): the two-phase, delayed DEFAULT_ADMIN_ROLE transfer
 * replaces the former single-step grant/renounce governance handover.
 * See GOVERNANCE.md / RUNBOOK_UPGRADE.md for the operational flow.
 */
describe("Token - AccessControlDefaultAdminRules (governance handover)", function () {
  let token: Token;
  let owner: SignerWithAddress;
  let newAdmin: SignerWithAddress;
  let unauthorized: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("10000");
  const DELAY = 3 * 24 * 60 * 60; // 3 days, matches the deployProxy arg below

  // Several tests below warp the chain clock past DELAY; snapshot/revert
  // keeps that from leaking into the shared Hardhat clock and breaking
  // other specs' hardcoded deadlines (permit / EIP-3009 signatures).
  let snapshotId: string;

  beforeEach(async function () {
    [owner, newAdmin, unauthorized] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = (await upgrades.deployProxy(
      Token,
      ["IGE Token", "IGT", INITIAL_SUPPLY, owner.address, 10, owner.address, 50, owner.address, owner.address, DELAY],
      { kind: "uups" }
    )) as unknown as Token;
    await token.waitForDeployment();

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });

  it("Should report the initial admin/delay state", async function () {
    expect(await token.owner()).to.equal(owner.address);
    expect(await token.defaultAdmin()).to.equal(owner.address);
    expect(await token.defaultAdminDelay()).to.equal(DELAY);

    const [pendingAdmin, schedule] = await token.pendingDefaultAdmin();
    expect(pendingAdmin).to.equal(ethers.ZeroAddress);
    expect(schedule).to.equal(0);
  });

  it("Should always revert grantRole/revokeRole on DEFAULT_ADMIN_ROLE", async function () {
    const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
    await expect(token.grantRole(DEFAULT_ADMIN_ROLE, newAdmin.address)).to.be.revertedWithCustomError(
      token,
      "AccessControlEnforcedDefaultAdminRules"
    );
    await expect(token.revokeRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.revertedWithCustomError(
      token,
      "AccessControlEnforcedDefaultAdminRules"
    );
  });

  it("Should schedule a transfer and emit DefaultAdminTransferScheduled", async function () {
    await expect(token.beginDefaultAdminTransfer(newAdmin.address)).to.emit(token, "DefaultAdminTransferScheduled");

    const [pendingAdmin, schedule] = await token.pendingDefaultAdmin();
    expect(pendingAdmin).to.equal(newAdmin.address);
    expect(schedule).to.be.gt(0);

    // Nothing changes yet
    expect(await token.defaultAdmin()).to.equal(owner.address);
  });

  it("Should not allow a non-admin to begin a transfer", async function () {
    await expect(token.connect(unauthorized).beginDefaultAdminTransfer(newAdmin.address)).to.be.revertedWithCustomError(
      token,
      "AccessControlUnauthorizedAccount"
    );
  });

  it("Should reject acceptDefaultAdminTransfer before the delay passes", async function () {
    await token.beginDefaultAdminTransfer(newAdmin.address);
    await expect(token.connect(newAdmin).acceptDefaultAdminTransfer()).to.be.revertedWithCustomError(
      token,
      "AccessControlEnforcedDefaultAdminDelay"
    );
  });

  it("Should reject acceptDefaultAdminTransfer from the wrong caller", async function () {
    await token.beginDefaultAdminTransfer(newAdmin.address);
    await ethers.provider.send("evm_increaseTime", [DELAY + 10]);
    await ethers.provider.send("evm_mine", []);

    await expect(token.connect(unauthorized).acceptDefaultAdminTransfer()).to.be.revertedWithCustomError(
      token,
      "AccessControlInvalidDefaultAdmin"
    );
  });

  it("Should complete the handover after the delay: new admin in, old admin out", async function () {
    await token.beginDefaultAdminTransfer(newAdmin.address);
    await ethers.provider.send("evm_increaseTime", [DELAY + 10]);
    await ethers.provider.send("evm_mine", []);

    await token.connect(newAdmin).acceptDefaultAdminTransfer();

    expect(await token.defaultAdmin()).to.equal(newAdmin.address);
    const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
    expect(await token.hasRole(DEFAULT_ADMIN_ROLE, newAdmin.address)).to.be.true;
    expect(await token.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.false;

    // Other governance roles are NOT automatically inherited by the new admin
    expect(await token.hasRole(await token.UPGRADER_ROLE(), newAdmin.address)).to.be.false;
    expect(await token.hasRole(await token.UPGRADER_ROLE(), owner.address)).to.be.true;
  });

  it("Should reset the pending transfer on cancelDefaultAdminTransfer", async function () {
    await token.beginDefaultAdminTransfer(newAdmin.address);
    await expect(token.cancelDefaultAdminTransfer()).to.emit(token, "DefaultAdminTransferCanceled");

    const [pendingAdmin, schedule] = await token.pendingDefaultAdmin();
    expect(pendingAdmin).to.equal(ethers.ZeroAddress);
    expect(schedule).to.equal(0);
  });
});
