import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Token } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Token - EIP-5267 eip712Domain", function () {
  let token: Token;
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

  describe("eip712Domain", function () {
    it("Should return correct EIP-712 domain", async function () {
      const domain = await token.eip712Domain();

      expect(domain.fields).to.equal("0x0f"); // EIP712Domain(name,string,version,string,chainId,uint256,verifyingContract,address)
      expect(domain.name).to.equal("IGE Token");
      expect(domain.version).to.equal("1");
      expect(domain.chainId).to.not.equal(0);
      expect(domain.verifyingContract).to.equal(await token.getAddress());
    });

    it("Should have correct domain separator", async function () {
      const domain = await token.eip712Domain();
      const domainSeparator = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "bytes32", "bytes32", "uint256", "address"],
          [
            ethers.keccak256(ethers.toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")),
            ethers.keccak256(ethers.toUtf8Bytes(domain.name)),
            ethers.keccak256(ethers.toUtf8Bytes(domain.version)),
            domain.chainId,
            domain.verifyingContract,
          ]
        )
      );

      expect(domainSeparator).to.not.equal(ethers.ZeroHash);
    });
  });
});
