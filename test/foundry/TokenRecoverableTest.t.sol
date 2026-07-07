// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../../contracts/Token.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import "@openzeppelin/contracts/access/IAccessControl.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "./UUPSProxy.sol";

/**
 * @title TokenRecoverableTest
 * @dev Foundry tests for ERC20RecoverableUpgradeable (Token v2.0.0)
 *
 * Behaviour under test:
 *   recoverERC20  — RECOVERER_ROLE can send any ERC-20 held by proxy to a recipient
 *                   (uses SafeERC20.safeTransfer under the hood)
 *   recoverNative    — RECOVERER_ROLE can send native ETH held by proxy to a recipient
 *   recoverERC721 — RECOVERER_ROLE can send an ERC-721 held by proxy to a recipient
 *                   (uses the typed IERC721.safeTransferFrom — underlying errors bubble up)
 *
 * Special case: recoverERC20(address(this), ...) moves the token's OWN balance and
 * goes through the standard transfer path — the transfer fee applies when the
 * contract is not exempt, and the call reverts while the token is paused.
 *
 * Failure modes:
 *   AccessControlUnauthorizedAccount — caller lacks RECOVERER_ROLE
 *   InvalidRecipient                 — to == address(0)
 *   SafeERC20FailedOperation         — ERC-20 transfer returns false (recoverERC20)
 *   NativeTransferFailed                   — native send fails (recoverNative)
 *   ERC721InsufficientApproval       — NFT not owned by the proxy (recoverERC721)
 */
contract TokenRecoverableTest is Test {
    Token public token;
    MockERC20 public mockERC20;
    MockERC721 public mockERC721;
    FalseReturningERC20 public falseERC20;

    address public admin;
    address public recoverer;
    address public nonRecoverer;
    address public safeRecipient;
    address public feeCollector;
    address public custodyTreasury;

    uint256 constant INITIAL_SUPPLY = 100_000 * 10 ** 18;
    uint256 constant TRANSFER_FEE_BPS = 10; // 0.1%
    uint256 constant CUSTODY_FEE_BPS = 50; // 0.5%

    function setUp() public {
        admin = address(this);
        recoverer = address(0xEC07EC01);
        nonRecoverer = address(0xBAD00002);
        safeRecipient = address(0xFEED0003);
        feeCollector = address(0x200);
        custodyTreasury = address(0x201);

        // Deploy token
        Token implementation = new Token();
        bytes memory initData = abi.encodeWithSelector(
            Token.initialize.selector,
            "Test Token",
            "TEST",
            INITIAL_SUPPLY,
            admin,
            TRANSFER_FEE_BPS,
            feeCollector,
            CUSTODY_FEE_BPS,
            custodyTreasury,
            admin
        );
        UUPSProxy proxy = new UUPSProxy(address(implementation), initData);
        token = Token(payable(address(proxy)));

        // Grant RECOVERER_ROLE to recoverer
        token.grantRole(token.RECOVERER_ROLE(), recoverer);

        // Operational roles needed by the self-token recovery tests
        token.grantRole(token.MINTER_ROLE(), admin);
        token.grantRole(token.PAUSER_ROLE(), admin);

        // Deploy mocks
        mockERC20 = new MockERC20();
        mockERC721 = new MockERC721();
        falseERC20 = new FalseReturningERC20();
    }

    // ─────────────────────────────────────────────
    // recoverERC20
    // ─────────────────────────────────────────────

    function test_recoverERC20_sendsTokensToRecipient() public {
        // Send some MockERC20 tokens to the proxy contract (simulates accidental deposit)
        uint256 amount = 500 * 10 ** 18;
        mockERC20.mint(address(token), amount);

        assertEq(mockERC20.balanceOf(address(token)), amount);
        assertEq(mockERC20.balanceOf(safeRecipient), 0);

        // Recover
        vm.prank(recoverer);
        token.recoverERC20(address(mockERC20), safeRecipient, amount);

        assertEq(mockERC20.balanceOf(address(token)), 0);
        assertEq(mockERC20.balanceOf(safeRecipient), amount);
    }

    function test_recoverERC20_partialAmount() public {
        uint256 totalAmount = 1000 * 10 ** 18;
        uint256 recoverAmount = 300 * 10 ** 18;
        mockERC20.mint(address(token), totalAmount);

        vm.prank(recoverer);
        token.recoverERC20(address(mockERC20), safeRecipient, recoverAmount);

        assertEq(mockERC20.balanceOf(address(token)), totalAmount - recoverAmount);
        assertEq(mockERC20.balanceOf(safeRecipient), recoverAmount);
    }

    function test_recoverERC20_nonRecovererReverts() public {
        mockERC20.mint(address(token), 100);

        bytes32 role = token.RECOVERER_ROLE();
        vm.prank(nonRecoverer);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, nonRecoverer, role)
        );
        token.recoverERC20(address(mockERC20), safeRecipient, 100);
    }

    function test_recoverERC20_zeroRecipientReverts() public {
        mockERC20.mint(address(token), 100);

        vm.prank(recoverer);
        vm.expectRevert(ERC20RecoverableUpgradeable.InvalidRecipient.selector);
        token.recoverERC20(address(mockERC20), address(0), 100);
    }

    function test_recoverERC20_falseReturningTokenReverts() public {
        // SafeERC20: a token whose transfer returns false must revert with
        // SafeERC20FailedOperation (no more custom NativeTransferFailed on this path)
        falseERC20.mint(address(token), 100);

        vm.prank(recoverer);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(falseERC20)));
        token.recoverERC20(address(falseERC20), safeRecipient, 100);
    }

    function test_recoverERC20_externalTokenWorksWhilePaused() public {
        // Recovering a FOREIGN token does not go through the token's transfer
        // path, so pause does not interfere
        uint256 amount = 100 * 10 ** 18;
        mockERC20.mint(address(token), amount);

        token.pause();

        vm.prank(recoverer);
        token.recoverERC20(address(mockERC20), safeRecipient, amount);

        assertEq(mockERC20.balanceOf(safeRecipient), amount);
    }

    // ─────────────────────────────────────────────
    // recoverERC20(address(this), ...) — standard transfer path
    // ─────────────────────────────────────────────

    function test_recoverERC20_selfToken_paysTransferFee() public {
        // Recovering the token's OWN balance goes through the standard transfer
        // path: the recipient receives the net and the collector receives the fee
        uint256 amount = 10_000 * 10 ** 18;
        token.mint(address(token), amount);

        uint256 fee = (amount * TRANSFER_FEE_BPS) / 10000;
        assertGt(fee, 0);

        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(address(token), safeRecipient, amount - fee);
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(address(token), feeCollector, fee);

        vm.prank(recoverer);
        token.recoverERC20(address(token), safeRecipient, amount);

        assertEq(token.balanceOf(address(token)), 0);
        assertEq(token.balanceOf(safeRecipient), amount - fee);
        assertEq(token.balanceOf(feeCollector), fee);
    }

    function test_recoverERC20_selfToken_exemptContractSendsFullAmount() public {
        // With the contract in the exemption list no fee is charged
        uint256 amount = 10_000 * 10 ** 18;
        token.mint(address(token), amount);
        token.addTransferFeeExempt(address(token));

        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(address(token), safeRecipient, amount);

        vm.prank(recoverer);
        token.recoverERC20(address(token), safeRecipient, amount);

        assertEq(token.balanceOf(address(token)), 0);
        assertEq(token.balanceOf(safeRecipient), amount);
        assertEq(token.balanceOf(feeCollector), 0);
    }

    function test_recoverERC20_selfToken_revertsWhenPaused() public {
        // The standard transfer path enforces pause
        uint256 amount = 100 * 10 ** 18;
        token.mint(address(token), amount);

        token.pause();

        vm.prank(recoverer);
        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        token.recoverERC20(address(token), safeRecipient, amount);
    }

    // ─────────────────────────────────────────────
    // recoverNative
    // ─────────────────────────────────────────────

    function test_recoverNative_sendsNativeToRecipient() public {
        // Send ETH to proxy (token has receive() function)
        uint256 amount = 1 ether;
        vm.deal(address(token), amount);

        assertEq(address(token).balance, amount);
        uint256 recipientBefore = safeRecipient.balance;

        vm.prank(recoverer);
        token.recoverNative(payable(safeRecipient), amount);

        assertEq(address(token).balance, 0);
        assertEq(safeRecipient.balance, recipientBefore + amount);
    }

    function test_recoverNative_partialAmount() public {
        uint256 total = 2 ether;
        uint256 recover = 0.5 ether;
        vm.deal(address(token), total);

        vm.prank(recoverer);
        token.recoverNative(payable(safeRecipient), recover);

        assertEq(address(token).balance, total - recover);
    }

    function test_recoverNative_nonRecovererReverts() public {
        vm.deal(address(token), 1 ether);

        bytes32 role = token.RECOVERER_ROLE();
        vm.prank(nonRecoverer);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, nonRecoverer, role)
        );
        token.recoverNative(payable(safeRecipient), 1 ether);
    }

    function test_recoverNative_zeroRecipientReverts() public {
        vm.deal(address(token), 1 ether);

        vm.prank(recoverer);
        vm.expectRevert(ERC20RecoverableUpgradeable.InvalidRecipient.selector);
        token.recoverNative(payable(address(0)), 1 ether);
    }

    function test_recoverNative_sendToContractThatRejectsNativeReverts() public {
        // Deploy a contract that has no payable receive — will reject ETH.
        // recoverNative still uses the custom NativeTransferFailed error (unchanged in v2)
        RejectingRecipient rejector = new RejectingRecipient();
        vm.deal(address(token), 1 ether);

        vm.prank(recoverer);
        vm.expectRevert(ERC20RecoverableUpgradeable.NativeTransferFailed.selector);
        token.recoverNative(payable(address(rejector)), 1 ether);
    }

    // ─────────────────────────────────────────────
    // recoverERC721
    // ─────────────────────────────────────────────

    function test_recoverERC721_sendsNFTToRecipient() public {
        // Mint NFT directly to the proxy (simulates accidental deposit)
        // Token contract implements ERC721Holder so it can receive NFTs
        uint256 tokenId = mockERC721.mint(address(token));

        assertEq(mockERC721.ownerOf(tokenId), address(token));

        vm.prank(recoverer);
        token.recoverERC721(address(mockERC721), safeRecipient, tokenId);

        assertEq(mockERC721.ownerOf(tokenId), safeRecipient);
    }

    function test_recoverERC721_nonRecovererReverts() public {
        uint256 tokenId = mockERC721.mint(address(token));

        bytes32 role = token.RECOVERER_ROLE();
        vm.prank(nonRecoverer);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, nonRecoverer, role)
        );
        token.recoverERC721(address(mockERC721), safeRecipient, tokenId);
    }

    function test_recoverERC721_zeroRecipientReverts() public {
        uint256 tokenId = mockERC721.mint(address(token));

        vm.prank(recoverer);
        vm.expectRevert(ERC20RecoverableUpgradeable.InvalidRecipient.selector);
        token.recoverERC721(address(mockERC721), address(0), tokenId);
    }

    function test_recoverERC721_nonOwnedTokenReverts() public {
        // Token not owned by the proxy — the typed IERC721.safeTransferFrom lets
        // the underlying ERC-721 error bubble up (no more NativeTransferFailed wrapper)
        uint256 tokenId = mockERC721.mint(safeRecipient); // owned by safeRecipient, not token contract

        vm.prank(recoverer);
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721InsufficientApproval.selector, address(token), tokenId)
        );
        token.recoverERC721(address(mockERC721), safeRecipient, tokenId);
    }

    // ─────────────────────────────────────────────
    // receive() — proxy accepts ETH
    // ─────────────────────────────────────────────

    function test_tokenReceivesNative() public {
        uint256 amount = 0.1 ether;
        vm.deal(address(this), amount);

        (bool ok,) = address(token).call{value: amount}("");
        assertTrue(ok);
        assertEq(address(token).balance, amount);
    }

    // ─────────────────────────────────────────────
    // FUZZ
    // ─────────────────────────────────────────────

    function testFuzz_recoverERC20_amount(uint128 amount) public {
        vm.assume(amount > 0);
        mockERC20.mint(address(token), amount);

        vm.prank(recoverer);
        token.recoverERC20(address(mockERC20), safeRecipient, amount);

        assertEq(mockERC20.balanceOf(safeRecipient), amount);
        assertEq(mockERC20.balanceOf(address(token)), 0);
    }

    function testFuzz_recoverNative_amount(uint96 amount) public {
        vm.assume(amount > 0);
        vm.deal(address(token), amount);

        uint256 recipientBefore = safeRecipient.balance;

        vm.prank(recoverer);
        token.recoverNative(payable(safeRecipient), amount);

        assertEq(safeRecipient.balance, recipientBefore + amount);
    }

    // ─────────────────────────────────────────────
    // AssetRecovered event — hook per il monitoraggio on-chain
    // ─────────────────────────────────────────────

    function test_recoverERC20_emitsAssetRecovered() public {
        uint256 amount = 500 * 10 ** 18;
        mockERC20.mint(address(token), amount);

        vm.expectEmit(true, true, true, true, address(token));
        emit ERC20RecoverableUpgradeable.AssetRecovered(
            ERC20RecoverableUpgradeable.AssetKind.ERC20, address(mockERC20), safeRecipient, amount, recoverer
        );
        vm.prank(recoverer);
        token.recoverERC20(address(mockERC20), safeRecipient, amount);
    }

    function test_recoverNative_emitsAssetRecovered() public {
        uint256 amount = 1 ether;
        vm.deal(address(token), amount);

        // asset == address(0) per il nativo
        vm.expectEmit(true, true, true, true, address(token));
        emit ERC20RecoverableUpgradeable.AssetRecovered(
            ERC20RecoverableUpgradeable.AssetKind.Native, address(0), safeRecipient, amount, recoverer
        );
        vm.prank(recoverer);
        token.recoverNative(payable(safeRecipient), amount);
    }

    function test_recoverERC721_emitsAssetRecovered() public {
        uint256 tokenId = mockERC721.mint(address(token));

        // per gli NFT il 4° campo è il tokenId
        vm.expectEmit(true, true, true, true, address(token));
        emit ERC20RecoverableUpgradeable.AssetRecovered(
            ERC20RecoverableUpgradeable.AssetKind.ERC721, address(mockERC721), safeRecipient, tokenId, recoverer
        );
        vm.prank(recoverer);
        token.recoverERC721(address(mockERC721), safeRecipient, tokenId);
    }
}

/// @dev Helper contract that rejects ETH (no receive/fallback)
contract RejectingRecipient {
    // Intentionally no receive() — any ETH sent here will revert
}

/// @dev Minimal ERC-20 whose transfer always returns false (never reverts):
/// SafeERC20 must surface this as SafeERC20FailedOperation(token)
contract FalseReturningERC20 {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address, uint256) external pure returns (bool) {
        return false;
    }
}
