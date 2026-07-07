import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Token - Basic Edge Cases", function () {
  let token: Token;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("10000");

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await upgrades.deployProxy(
      Token,
      ["IGE Token", "IGT", INITIAL_SUPPLY, owner.address, 10, owner.address, owner.address],
      { kind: "uups" }
    ) as unknown as Token;
    await token.waitForDeployment();
  });

  describe("Basic Operations Edge Cases", function () {
    it("Should handle zero amount transfers", async function () {
      await token.transfer(addr1.address, 0);
      expect(await token.balanceOf(addr1.address)).to.equal(0);
    });

    it("Should handle maximum uint256 approvals", async function () {
      await token.approve(addr1.address, ethers.MaxUint256);
      expect(await token.allowance(owner.address, addr1.address)).to.equal(ethers.MaxUint256);
    });

    it("Should reject transfers to zero address", async function () {
      await expect(token.transfer(ethers.ZeroAddress, 100))
        .to.be.reverted;
    });

    it("Should handle large transfers", async function () {
      const amount = ethers.parseEther("1000");
      await token.transfer(addr1.address, amount);
      
      // Check that transfer succeeded (fee is applied automatically)
      expect(await token.balanceOf(addr1.address)).to.be.gt(0);
      expect(await token.balanceOf(owner.address)).to.be.lt(INITIAL_SUPPLY);
    });
  });

  describe("Fee Edge Cases", function () {
    it("Should handle zero fee", async function () {
      // Grant FEE_ADMIN_ROLE to owner
      await token.grantRole(await token.FEE_ADMIN_ROLE(), owner.address);
      
      await token.connect(owner).setFee(0);
      
      const amount = ethers.parseEther("100");
      await token.transfer(addr1.address, amount);
      
      expect(await token.balanceOf(addr1.address)).to.equal(amount);
    });

    it("Should handle maximum fee", async function () {
      // Grant FEE_ADMIN_ROLE to owner
      await token.grantRole(await token.FEE_ADMIN_ROLE(), owner.address);
      
      await token.connect(owner).setFee(999);
      
      const amount = ethers.parseEther("100");
      await token.transfer(addr1.address, amount);
      
      // 99.9% fee deducted
      const expectedFee = amount * 999n / 10000n;
      const expectedReceived = amount - expectedFee;
      
      expect(await token.balanceOf(addr1.address)).to.equal(expectedReceived);
    });

    it("Should handle very small amounts with fee", async function () {
      const amount = 1; // 1 wei
      await token.transfer(addr1.address, amount);
      
      // Fee should be 0 due to integer division
      expect(await token.balanceOf(addr1.address)).to.equal(amount);
    });
  });

  describe("Role Management Edge Cases", function () {
    it("Should handle granting and revoking roles", async function () {
      const minterRole = await token.MINTER_ROLE();
      
      // Grant role
      await token.grantRole(minterRole, addr1.address);
      expect(await token.hasRole(minterRole, addr1.address)).to.be.true;
      
      // Revoke role
      await token.revokeRole(minterRole, addr1.address);
      expect(await token.hasRole(minterRole, addr1.address)).to.be.false;
    });

    it("Should handle multiple role grants", async function () {
      const minterRole = await token.MINTER_ROLE();
      const burnerRole = await token.BURNER_ROLE();
      
      await token.grantRole(minterRole, addr1.address);
      await token.grantRole(burnerRole, addr1.address);
      
      expect(await token.hasRole(minterRole, addr1.address)).to.be.true;
      expect(await token.hasRole(burnerRole, addr1.address)).to.be.true;
    });

    it("Should handle role-based minting", async function () {
      const minterRole = await token.MINTER_ROLE();
      
      // Grant minter role
      await token.grantRole(minterRole, addr1.address);
      
      // Should be able to mint
      await token.connect(addr1).mint(addr2.address, 1000);
      expect(await token.balanceOf(addr2.address)).to.equal(1000);
      
      // Should not be able to mint without role
      await expect(token.connect(addr2).mint(addr1.address, 1000))
        .to.be.reverted;
    });
  });

  describe("Block/Freeze Edge Cases", function () {
    it("Should handle blocking and unblocking", async function () {
      // Grant BLOCKER_ROLE to owner
      await token.grantRole(await token.BLOCKER_ROLE(), owner.address);
      
      // Block account
      await token.connect(owner).blockAddress(addr1.address);
      expect(await token.isBlocked(addr1.address)).to.be.true;
      
      // Should not be able to transfer to blocked account
      await expect(token.transfer(addr1.address, 100))
        .to.be.reverted;
      
      // Unblock account
      await token.connect(owner).unblock(addr1.address);
      expect(await token.isBlocked(addr1.address)).to.be.false;
      
      // Should be able to transfer after unblock
      await token.transfer(addr1.address, 100);
      expect(await token.balanceOf(addr1.address)).to.equal(100);
    });

    it("Should handle freezing and unfreezing", async function () {
      // Grant FREEZER_ROLE to owner
      await token.grantRole(await token.FREEZER_ROLE(), owner.address);
      
      await token.transfer(addr1.address, ethers.parseEther("1000"));
      
      // Freeze account
      await token.connect(owner).freeze(addr1.address);
      expect(await token.isFrozen(addr1.address)).to.be.true;
      
      // Should not be able to transfer when frozen
      await expect(token.connect(addr1).transfer(addr2.address, 100))
        .to.be.reverted;
      
      // Unfreeze account
      await token.connect(owner).unfreeze(addr1.address);
      expect(await token.isFrozen(addr1.address)).to.be.false;
      
      // Should be able to transfer after unfreeze
      await token.connect(addr1).transfer(addr2.address, 100);
      expect(await token.balanceOf(addr2.address)).to.equal(100);
    });
  });

  describe("Pause Edge Cases", function () {
    it("Should handle pause and unpause", async function () {
      // Grant PAUSER_ROLE to owner
      await token.grantRole(await token.PAUSER_ROLE(), owner.address);
      
      // Pause contract
      await token.connect(owner).pause();
      expect(await token.paused()).to.be.true;
      
      // Should not be able to transfer when paused
      await expect(token.transfer(addr1.address, 100))
        .to.be.reverted;
      
      // Unpause contract
      await token.connect(owner).unpause();
      expect(await token.paused()).to.be.false;
      
      // Should be able to transfer after unpause
      await token.transfer(addr1.address, 100);
      expect(await token.balanceOf(addr1.address)).to.equal(100);
    });
  });

  describe("Combined Edge Cases", function () {
    it("Should handle frozen + blocked account", async function () {
      // Grant required roles
      await token.grantRole(await token.FREEZER_ROLE(), owner.address);
      await token.grantRole(await token.BLOCKER_ROLE(), owner.address);
      
      await token.transfer(addr1.address, ethers.parseEther("1000"));
      
      // Freeze and block account
      await token.connect(owner).freeze(addr1.address);
      await token.connect(owner).blockAddress(addr1.address);
      
      // Blocked should prevent transfer
      await expect(token.connect(addr1).transfer(addr2.address, 100))
        .to.be.reverted;
    });

    it("Should handle frozen + paused contract", async function () {
      // Grant required roles
      await token.grantRole(await token.FREEZER_ROLE(), owner.address);
      await token.grantRole(await token.PAUSER_ROLE(), owner.address);
      
      await token.transfer(addr1.address, ethers.parseEther("1000"));
      
      // Freeze account and pause contract
      await token.connect(owner).freeze(addr1.address);
      await token.connect(owner).pause();
      
      // Pause should prevent transfer
      await expect(token.connect(addr1).transfer(addr2.address, 100))
        .to.be.reverted;
    });

    it("Should handle multiple state changes", async function () {
      // Grant all required roles
      await token.grantRole(await token.FEE_ADMIN_ROLE(), owner.address);
      await token.grantRole(await token.FREEZER_ROLE(), owner.address);
      await token.grantRole(await token.BLOCKER_ROLE(), owner.address);
      await token.grantRole(await token.PAUSER_ROLE(), owner.address);
      
      // Set high fee
      await token.connect(owner).setFee(500); // 5%
      
      // Transfer some tokens
      const amount = ethers.parseEther("1000");
      await token.transfer(addr1.address, amount);
      
      // Freeze account
      await token.connect(owner).freeze(addr1.address);
      
      // Should not be able to transfer when frozen
      await expect(token.connect(addr1).transfer(addr2.address, 100))
        .to.be.reverted;
      
      // Unfreeze
      await token.connect(owner).unfreeze(addr1.address);
      
      // Block account
      await token.connect(owner).blockAddress(addr1.address);
      
      // Should not be able to transfer when blocked
      await expect(token.connect(addr1).transfer(addr2.address, 100))
        .to.be.reverted;
      
      // Unblock
      await token.connect(owner).unblock(addr1.address);
      
      // Pause contract
      await token.connect(owner).pause();
      
      // Should not be able to transfer when paused
      await expect(token.connect(addr1).transfer(addr2.address, 100))
        .to.be.reverted;
      
      // Unpause
      await token.connect(owner).unpause();
      
      // Should be able to transfer with fee
      await token.connect(addr1).transfer(addr2.address, 100);
      
      // Check fee was applied
      const expectedFee = 100n * 500n / 10000n; // 5% of 100
      const expectedReceived = 100n - expectedFee;
      expect(await token.balanceOf(addr2.address)).to.equal(expectedReceived);
    });
  });
});
