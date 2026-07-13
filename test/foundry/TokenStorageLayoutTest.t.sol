// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../../contracts/Token.sol";
import "./UUPSProxy.sol";

/**
 * @title TokenStorageLayoutTest
 * @dev Verifies ON-CHAIN that every ERC-7201 namespace declared by the
 * extensions is (a) computed with the standard formula
 * keccak256(abi.encode(uint256(keccak256(id)) - 1)) & ~bytes32(uint256(0xff))
 * and (b) actually used by the contract: state written through the public API
 * must be readable with vm.load at the slot derived in this test.
 *
 * This is the anti-regression guardian for audit finding A1: if anyone changes
 * the hardcoded slot constants or the namespace ids, these tests fail.
 */
contract TokenStorageLayoutTest is Test {
    Token public token;

    address public admin;
    uint256 public alicePk;
    address public alice;

    uint256 constant INITIAL_SUPPLY = 1_000_000 * 10 ** 18;
    uint256 constant FEE_BPS = 10;
    uint256 constant CUSTODY_BPS = 50;

    address public feeCollector;
    address public custodyTreasury;

    function setUp() public {
        admin = address(this);
        alicePk = 0xA11CE;
        alice = vm.addr(alicePk);
        feeCollector = makeAddr("feeCollector");
        custodyTreasury = makeAddr("custodyTreasury");

        Token implementation = new Token();
        bytes memory initData = abi.encodeWithSelector(
            Token.initialize.selector,
            "Test Token",
            "TEST",
            INITIAL_SUPPLY,
            alice,
            FEE_BPS,
            feeCollector,
            CUSTODY_BPS,
            custodyTreasury,
            admin,
            3 days
        );
        UUPSProxy proxy = new UUPSProxy(address(implementation), initData);
        token = Token(payable(address(proxy)));

        token.grantRole(token.FREEZER_ROLE(), admin);
        token.grantRole(token.BLOCKER_ROLE(), admin);
        token.grantRole(token.SWEEPER_ROLE(), admin);
    }

    /// @dev ERC-7201 standard formula
    function _erc7201(string memory id) internal pure returns (bytes32) {
        return keccak256(abi.encode(uint256(keccak256(bytes(id))) - 1)) & ~bytes32(uint256(0xff));
    }

    /// @dev slot of mapping(address => X) entry at struct offset 0
    function _mappingSlot(address key, bytes32 baseSlot) internal pure returns (bytes32) {
        return keccak256(abi.encode(key, uint256(baseSlot)));
    }

    // ─────────────────────────────────────────────
    // advanced.token.freezable.storage
    // ─────────────────────────────────────────────

    function test_freezableSlot_erc7201Conformance() public {
        bytes32 base = _erc7201("advanced.token.freezable.storage");
        // The last byte of an ERC-7201 location must be zero
        assertEq(uint256(base) & 0xff, 0);

        bytes32 slot = _mappingSlot(alice, base);
        assertEq(vm.load(address(token), slot), bytes32(0));

        token.freeze(alice);
        assertEq(uint256(vm.load(address(token), slot)), 1, "frozen[alice] not at the declared ERC-7201 slot");

        token.unfreeze(alice);
        assertEq(vm.load(address(token), slot), bytes32(0));
    }

    // ─────────────────────────────────────────────
    // advanced.token.blocklist.storage
    // ─────────────────────────────────────────────

    function test_blocklistSlot_erc7201Conformance() public {
        bytes32 base = _erc7201("advanced.token.blocklist.storage");
        assertEq(uint256(base) & 0xff, 0);

        bytes32 slot = _mappingSlot(alice, base);
        assertEq(vm.load(address(token), slot), bytes32(0));

        token.blockAccount(alice);
        assertEq(uint256(vm.load(address(token), slot)), 1, "blocked[alice] not at the declared ERC-7201 slot");

        token.unblockAccount(alice);
        assertEq(vm.load(address(token), slot), bytes32(0));
    }

    // ─────────────────────────────────────────────
    // advanced.token.transferfee.storage
    // struct: { uint16 transferFeeBps; address feeCollector; EnumerableSet exempt; }
    // slot 0 packing: bps in bytes [0-1], collector in bytes [2-21]
    // ─────────────────────────────────────────────

    function test_transferFeeSlot_erc7201Conformance() public {
        bytes32 base = _erc7201("advanced.token.transferfee.storage");
        assertEq(uint256(base) & 0xff, 0);

        uint256 word = uint256(vm.load(address(token), base));
        assertEq(word & 0xffff, FEE_BPS, "transferFeeBps not packed at the declared slot");
        assertEq(address(uint160(word >> 16)), feeCollector, "feeCollector not packed at the declared slot");

        // Mutate through the API and verify the same slot reflects the change
        token.setTransferFeeBps(77);
        address newCollector = makeAddr("newCollector");
        token.setFeeCollector(newCollector);

        word = uint256(vm.load(address(token), base));
        assertEq(word & 0xffff, 77);
        assertEq(address(uint160(word >> 16)), newCollector);
    }

    // ─────────────────────────────────────────────
    // advanced.token.custodyfee.storage
    // struct: { uint16 custodyFeeBps; address custodyTreasury; uint256 currentCycle;
    //           mapping lastSweptCycle; EnumerableSet exempt; }
    // slot 0: bps + treasury packed; slot 1: currentCycle; slot 2: mapping base
    // ─────────────────────────────────────────────

    function test_custodyFeeSlot_erc7201Conformance() public {
        bytes32 base = _erc7201("advanced.token.custodyfee.storage");
        assertEq(uint256(base) & 0xff, 0);

        uint256 word = uint256(vm.load(address(token), base));
        assertEq(word & 0xffff, CUSTODY_BPS, "custodyFeeBps not packed at the declared slot");
        assertEq(address(uint160(word >> 16)), custodyTreasury, "custodyTreasury not packed at the declared slot");

        // currentCycle at base + 1: initialize opened cycle 1
        bytes32 cycleSlot = bytes32(uint256(base) + 1);
        assertEq(uint256(vm.load(address(token), cycleSlot)), 1);

        token.startNewCycle();
        assertEq(uint256(vm.load(address(token), cycleSlot)), 2, "currentCycle not at the declared slot");

        // lastSweptCycle mapping at base + 2
        address[] memory holders = new address[](1);
        holders[0] = alice;
        token.sweepCustodyFee(holders);

        bytes32 sweptSlot = keccak256(abi.encode(alice, uint256(base) + 2));
        assertEq(uint256(vm.load(address(token), sweptSlot)), 2, "lastSweptCycle not at the declared slot");
    }

    // ─────────────────────────────────────────────
    // advanced.token.eip3009.storage
    // struct: { mapping(address => mapping(bytes32 => bool)) authorizationState; }
    // ─────────────────────────────────────────────

    function test_eip3009Slot_erc7201Conformance() public {
        bytes32 base = _erc7201("advanced.token.eip3009.storage");
        assertEq(uint256(base) & 0xff, 0);

        bytes32 nonce = keccak256("storage-layout-test-nonce");

        // Mark the nonce as used via cancelAuthorization (signed by alice)
        bytes32 structHash =
            keccak256(abi.encode(keccak256("CancelAuthorization(address authorizer,bytes32 nonce)"), alice, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(alicePk, digest);

        token.cancelAuthorization(alice, nonce, v, r, s);
        assertTrue(token.authorizationState(alice, nonce));

        // Nested mapping: leaf = keccak256(nonce, keccak256(alice, base))
        bytes32 inner = keccak256(abi.encode(alice, uint256(base)));
        bytes32 leaf = keccak256(abi.encode(nonce, inner));
        assertEq(uint256(vm.load(address(token), leaf)), 1, "authorizationState not at the declared ERC-7201 slot");
    }

    // ─────────────────────────────────────────────
    // advanced.token.contracturis.storage
    // struct: { string websiteURI; string reserveInfoURI; string contractURI; }
    // short-string encoding (<=31 bytes): data left-aligned, length*2 in the low byte
    // ─────────────────────────────────────────────

    /// @dev packs a short string (<=31 bytes) the way Solidity stores it inline
    function _shortStringSlot(string memory str) internal pure returns (bytes32 word) {
        bytes memory b = bytes(str);
        require(b.length <= 31, "test only supports short strings");
        assembly {
            word := mload(add(b, 32))
        }
        word = word | bytes32(uint256(b.length * 2));
    }

    function test_contractURIsSlot_erc7201Conformance() public {
        bytes32 base = _erc7201("advanced.token.contracturis.storage");
        assertEq(uint256(base) & 0xff, 0);

        // Uninitialized: empty strings encode to a zero slot
        assertEq(vm.load(address(token), base), bytes32(0));

        string memory website = "https://igt.example";
        string memory reserveInfo = "https://reserve.example";
        string memory contractMeta = "https://meta.example";

        token.setWebsiteURI(website);
        assertEq(
            vm.load(address(token), base), _shortStringSlot(website), "websiteURI not at the declared ERC-7201 slot"
        );

        token.setReserveInfoURI(reserveInfo);
        bytes32 reserveSlot = bytes32(uint256(base) + 1);
        assertEq(
            vm.load(address(token), reserveSlot),
            _shortStringSlot(reserveInfo),
            "reserveInfoURI not at the declared ERC-7201 slot"
        );

        token.setContractURI(contractMeta);
        bytes32 contractSlot = bytes32(uint256(base) + 2);
        assertEq(
            vm.load(address(token), contractSlot),
            _shortStringSlot(contractMeta),
            "contractURI not at the declared ERC-7201 slot"
        );
    }

    // ─────────────────────────────────────────────
    // Cross-check: the formula in this test matches the values hardcoded in
    // the extensions (documented in their @dev comments)
    // ─────────────────────────────────────────────

    function test_precomputedConstantsMatchFormula() public pure {
        assertEq(
            _erc7201("advanced.token.freezable.storage"),
            bytes32(0x9ec908011c89430f338863c20a5533fb7b09dd8c54e64bb2522918b35f55bf00)
        );
        assertEq(
            _erc7201("advanced.token.blocklist.storage"),
            bytes32(0xae61fd1dbbcf2c96a9921076fdce0cb105af32b600d8b7848d1f73cb0b9cc000)
        );
        assertEq(
            _erc7201("advanced.token.transferfee.storage"),
            bytes32(0x9851a5d9269a2f8592e1e72e4aed280c65e9fe28fe206eb654b4acc69ef15500)
        );
        assertEq(
            _erc7201("advanced.token.custodyfee.storage"),
            bytes32(0x39e77610e4c9fed66f79595071fdfdfbbeefcaacd999260f06b81d93e001ac00)
        );
        assertEq(
            _erc7201("advanced.token.eip3009.storage"),
            bytes32(0xe281c9e49b595b8ea7184e0675358c21ea63e763a0426bf5fc042fef0860fb00)
        );
        assertEq(
            _erc7201("advanced.token.contracturis.storage"),
            bytes32(0x2f61fe546e652f7829573e78b47106428dbe11840b9f360ee3179ad8b6e33700)
        );
    }
}
