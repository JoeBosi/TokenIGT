import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token, TokenV2, TokenV3 } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Token - Comprehensive Upgrade Tests", function () {
  let token: Token;
  let tokenV2: TokenV2;
  let tokenV3: TokenV3;
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

  describe("Multiple Upgrade Paths", function () {
    it("Should handle V1 -> V2 -> V3 upgrade sequence", async function () {
      // Grant UPGRADER_ROLE to owner
      await token.grantRole(await token.UPGRADER_ROLE(), owner.address);
      
      // V1 -> V2
      const TokenV2 = await ethers.getContractFactory("TokenV2");
      tokenV2 = await upgrades.upgradeProxy(await token.getAddress(), TokenV2) as unknown as TokenV2;
      await tokenV2.waitForDeployment();
      
      // Initialize V2
      await tokenV2.initializeV2(42, "V2 String");
      
      // V2 -> V3
      const TokenV3 = await ethers.getContractFactory("TokenV3");
      tokenV3 = await upgrades.upgradeProxy(await token.getAddress(), TokenV3) as unknown as TokenV3;
      await tokenV3.waitForDeployment();
      
      // Initialize V3
      await tokenV3.initializeV3(100);
      
      // Verify all functionality still works
      expect(await tokenV3.name()).to.equal("IGE Token");
      expect(await tokenV3.newVariable()).to.equal(42);
      expect(await tokenV3.anotherVariable()).to.equal(100);
    });

    it("Should preserve state through multiple upgrade cycles", async function () {
      // Grant UPGRADER_ROLE to owner
      await token.grantRole(await token.UPGRADER_ROLE(), owner.address);
      
      // Set up some state in V1
      await token.transfer(addr1.address, ethers.parseEther("1000"));
      await token.grantRole(await token.MINTER_ROLE(), addr1.address);
      await token.connect(addr1).mint(addr2.address, ethers.parseEther("500"));
      
      const balance1 = await token.balanceOf(addr1.address);
      const balance2 = await token.balanceOf(addr2.address);
      const totalSupply = await token.totalSupply();
      
      // V1 -> V2
      const TokenV2 = await ethers.getContractFactory("TokenV2");
      tokenV2 = await upgrades.upgradeProxy(await token.getAddress(), TokenV2) as unknown as TokenV2;
      await tokenV2.waitForDeployment();
      
      await tokenV2.initializeV2(42, "V2 String");
      
      // V2 -> V3
      const TokenV3 = await ethers.getContractFactory("TokenV3");
      tokenV3 = await upgrades.upgradeProxy(await token.getAddress(), TokenV3) as unknown as TokenV3;
      await tokenV3.waitForDeployment();
      
      await tokenV3.initializeV3(100);
      
      // Verify state is preserved
      expect(await tokenV3.balanceOf(addr1.address)).to.equal(balance1);
      expect(await tokenV3.balanceOf(addr2.address)).to.equal(balance2);
      expect(await tokenV3.totalSupply()).to.equal(totalSupply);
      expect(await tokenV3.hasRole(await tokenV3.MINTER_ROLE(), addr1.address)).to.be.true;
    });

    it("Should handle upgrades with active restrictions", async function () {
      // Grant all required roles
      await token.grantRole(await token.UPGRADER_ROLE(), owner.address);
      await token.grantRole(await token.FREEZER_ROLE(), owner.address);
      await token.grantRole(await token.BLOCKER_ROLE(), owner.address);
      await token.grantRole(await token.PAUSER_ROLE(), owner.address);
      
      // Set up restrictions in V1
      await token.transfer(addr1.address, ethers.parseEther("1000"));
      await token.connect(owner).freeze(addr1.address);
      await token.connect(owner).block(addr2.address);
      await token.connect(owner).pause();
      
      // V1 -> V2
      const TokenV2 = await ethers.getContractFactory("TokenV2");
      tokenV2 = await upgrades.upgradeProxy(await token.getAddress(), TokenV2) as unknown as TokenV2;
      await tokenV2.waitForDeployment();
      
      await tokenV2.initializeV2(42, "V2 String");
      
      // V2 -> V3
      const TokenV3 = await ethers.getContractFactory("TokenV3");
      tokenV3 = await upgrades.upgradeProxy(await token.getAddress(), TokenV3) as unknown as TokenV3;
      await tokenV3.waitForDeployment();
      
      await tokenV3.initializeV3(100);
      
      // Verify restrictions are still active
      expect(await tokenV3.isFrozen(addr1.address)).to.be.true;
      expect(await tokenV3.isBlocked(addr2.address)).to.be.true;
      expect(await tokenV3.paused()).to.be.true;
      
      // Verify restrictions still work
      await expect(tokenV3.connect(addr1).transfer(addr2.address, 100))
        .to.be.reverted; // Should fail due to pause
    });
  });

  describe("Upgrade with Functionality Tests", function () {
    it("Should maintain all V1 functionality after upgrades", async function () {
      // Grant UPGRADER_ROLE to owner
      await token.grantRole(await token.UPGRADER_ROLE(), owner.address);
      
      // Test all V1 functionality before upgrade
      await token.transfer(addr1.address, ethers.parseEther("100"));
      expect(await token.balanceOf(addr1.address)).to.be.gt(0);
      
      await token.approve(addr1.address, ethers.parseEther("50"));
      expect(await token.allowance(owner.address, addr1.address)).to.equal(ethers.parseEther("50"));
      
      // V1 -> V2 -> V3
      const TokenV2 = await ethers.getContractFactory("TokenV2");
      tokenV2 = await upgrades.upgradeProxy(await token.getAddress(), TokenV2) as unknown as TokenV2;
      await tokenV2.waitForDeployment();
      await tokenV2.initializeV2(42, "V2 String");
      
      const TokenV3 = await ethers.getContractFactory("TokenV3");
      tokenV3 = await upgrades.upgradeProxy(await token.getAddress(), TokenV3) as unknown as TokenV3;
      await tokenV3.waitForDeployment();
      await tokenV3.initializeV3(100);
      
      // Test V1 functionality still works (fee is applied)
      await tokenV3.transfer(addr2.address, ethers.parseEther("25"));
      const expectedFee = ethers.parseEther("25") * 10n / 10000n; // 10 basis points
      const expectedReceived = ethers.parseEther("25") - expectedFee;
      expect(await tokenV3.balanceOf(addr2.address)).to.equal(expectedReceived);
      
      await tokenV3.approve(addr2.address, ethers.parseEther("10"));
      expect(await tokenV3.allowance(owner.address, addr2.address)).to.equal(ethers.parseEther("10"));
      
      // Test V2 functionality works
      expect(await tokenV3.newVariable()).to.equal(42);
      expect(await tokenV3.newString()).to.equal("V2 String");
      
      // Test V3 functionality works
      expect(await tokenV3.anotherVariable()).to.equal(100);
      expect(await tokenV3.greet()).to.equal("Hello from IGE Token V3!");
    });

    it("Should handle fee functionality through upgrades", async function () {
      // Grant UPGRADER_ROLE and FEE_ADMIN_ROLE to owner
      await token.grantRole(await token.UPGRADER_ROLE(), owner.address);
      await token.grantRole(await token.FEE_ADMIN_ROLE(), owner.address);
      
      // Set fee in V1
      await token.connect(owner).setFee(50); // 0.5%
      
      const amount = ethers.parseEther("1000");
      await token.transfer(addr1.address, amount);
      
      const expectedFee = amount * 50n / 10000n;
      const expectedReceived = amount - expectedFee;
      
      expect(await token.balanceOf(addr1.address)).to.equal(expectedReceived);
      
      // V1 -> V2 -> V3
      const TokenV2 = await ethers.getContractFactory("TokenV2");
      tokenV2 = await upgrades.upgradeProxy(await token.getAddress(), TokenV2) as unknown as TokenV2;
      await tokenV2.waitForDeployment();
      await tokenV2.initializeV2(42, "V2 String");
      
      const TokenV3 = await ethers.getContractFactory("TokenV3");
      tokenV3 = await upgrades.upgradeProxy(await token.getAddress(), TokenV3) as unknown as TokenV3;
      await tokenV3.waitForDeployment();
      await tokenV3.initializeV3(100);
      
      // Test fee functionality still works
      await tokenV3.transfer(addr2.address, ethers.parseEther("500"));
      
      const expectedFee2 = ethers.parseEther("500") * 50n / 10000n;
      const expectedReceived2 = ethers.parseEther("500") - expectedFee2;
      
      expect(await tokenV3.balanceOf(addr2.address)).to.equal(expectedReceived2);
    });

    it("Should handle role management through upgrades", async function () {
      // Grant UPGRADER_ROLE to owner
      await token.grantRole(await token.UPGRADER_ROLE(), owner.address);
      
      // Set up roles in V1
      await token.grantRole(await token.MINTER_ROLE(), addr1.address);
      await token.grantRole(await token.BURNER_ROLE(), addr2.address);
      
      // V1 -> V2 -> V3
      const TokenV2 = await ethers.getContractFactory("TokenV2");
      tokenV2 = await upgrades.upgradeProxy(await token.getAddress(), TokenV2) as unknown as TokenV2;
      await tokenV2.waitForDeployment();
      await tokenV2.initializeV2(42, "V2 String");
      
      const TokenV3 = await ethers.getContractFactory("TokenV3");
      tokenV3 = await upgrades.upgradeProxy(await token.getAddress(), TokenV3) as unknown as TokenV3;
      await tokenV3.waitForDeployment();
      await tokenV3.initializeV3(100);
      
      // Test roles still work
      expect(await tokenV3.hasRole(await tokenV3.MINTER_ROLE(), addr1.address)).to.be.true;
      expect(await tokenV3.hasRole(await tokenV3.BURNER_ROLE(), addr2.address)).to.be.true;
      
      // Test role-based functionality
      await tokenV3.connect(addr1).mint(addr1.address, ethers.parseEther("100"));
      expect(await tokenV3.balanceOf(addr1.address)).to.be.gte(ethers.parseEther("100"));
      
      // Add new roles after upgrade
      await tokenV3.grantRole(await tokenV3.PAUSER_ROLE(), addr1.address);
      expect(await tokenV3.hasRole(await tokenV3.PAUSER_ROLE(), addr1.address)).to.be.true;
    });
  });

  describe("Upgrade Edge Cases", function () {
    it("Should handle upgrade with large amounts of data", async function () {
      // Grant UPGRADER_ROLE to owner
      await token.grantRole(await token.UPGRADER_ROLE(), owner.address);
      
      // Create many transfers and state changes
      for (let i = 0; i < 10; i++) {
        await token.transfer(addr1.address, ethers.parseEther("100"));
        await token.transfer(addr2.address, ethers.parseEther("50"));
      }
      
      // Grant many roles
      await token.grantRole(await token.MINTER_ROLE(), addr1.address);
      await token.grantRole(await token.BURNER_ROLE(), addr2.address);
      await token.grantRole(await token.PAUSER_ROLE(), addr1.address);
      await token.grantRole(await token.FREEZER_ROLE(), addr2.address);
      await token.grantRole(await token.BLOCKER_ROLE(), addr1.address);
      
      const balance1 = await token.balanceOf(addr1.address);
      const balance2 = await token.balanceOf(addr2.address);
      
      // V1 -> V2 -> V3
      const TokenV2 = await ethers.getContractFactory("TokenV2");
      tokenV2 = await upgrades.upgradeProxy(await token.getAddress(), TokenV2) as unknown as TokenV2;
      await tokenV2.waitForDeployment();
      await tokenV2.initializeV2(42, "V2 String");
      
      const TokenV3 = await ethers.getContractFactory("TokenV3");
      tokenV3 = await upgrades.upgradeProxy(await token.getAddress(), TokenV3) as unknown as TokenV3;
      await tokenV3.waitForDeployment();
      await tokenV3.initializeV3(100);
      
      // Verify all state is preserved
      expect(await tokenV3.balanceOf(addr1.address)).to.equal(balance1);
      expect(await tokenV3.balanceOf(addr2.address)).to.equal(balance2);
      
      // Verify all roles are preserved
      expect(await tokenV3.hasRole(await tokenV3.MINTER_ROLE(), addr1.address)).to.be.true;
      expect(await tokenV3.hasRole(await tokenV3.BURNER_ROLE(), addr2.address)).to.be.true;
      expect(await tokenV3.hasRole(await tokenV3.PAUSER_ROLE(), addr1.address)).to.be.true;
      expect(await tokenV3.hasRole(await tokenV3.FREEZER_ROLE(), addr2.address)).to.be.true;
      expect(await tokenV3.hasRole(await tokenV3.BLOCKER_ROLE(), addr1.address)).to.be.true;
    });

    it("Should handle upgrade timing and gas efficiency", async function () {
      // Grant UPGRADER_ROLE to owner
      await token.grantRole(await token.UPGRADER_ROLE(), owner.address);
      
      // Measure gas for V1 -> V2 upgrade
      const TokenV2 = await ethers.getContractFactory("TokenV2");
      const tx1 = await upgrades.upgradeProxy(await token.getAddress(), TokenV2);
      const receipt1 = await tx1.deploymentTransaction()?.wait();
      
      console.log(`V1 -> V2 upgrade gas: ${receipt1?.gasUsed.toString()}`);
      
      // Initialize V2
      tokenV2 = await upgrades.upgradeProxy(await token.getAddress(), TokenV2) as unknown as TokenV2;
      await tokenV2.waitForDeployment();
      await tokenV2.initializeV2(42, "V2 String");
      
      // Measure gas for V2 -> V3 upgrade
      const TokenV3 = await ethers.getContractFactory("TokenV3");
      const tx2 = await upgrades.upgradeProxy(await token.getAddress(), TokenV3);
      const receipt2 = await tx2.deploymentTransaction()?.wait();
      
      console.log(`V2 -> V3 upgrade gas: ${receipt2?.gasUsed.toString()}`);
      
      // Initialize V3
      tokenV3 = await upgrades.upgradeProxy(await token.getAddress(), TokenV3) as unknown as TokenV3;
      await tokenV3.waitForDeployment();
      await tokenV3.initializeV3(100);
      
      // Verify functionality works
      expect(await tokenV3.newVariable()).to.equal(42);
      expect(await tokenV3.anotherVariable()).to.equal(100);
    });
  });
});
