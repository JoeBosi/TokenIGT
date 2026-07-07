// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../../contracts/Token.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockERC721.sol";
import "./UUPSProxy.sol";

/**
 * @title TokenRecoverableTest
 * @dev Foundry tests for ERC20RecoverableUpgradeable
 *
 * Behaviour under test:
 *   recoverERC20  — RECOVERER_ROLE can send any ERC-20 held by proxy to a recipient
 *   recoverETH    — RECOVERER_ROLE can send native ETH held by proxy to a recipient
 *   recoverERC721 — RECOVERER_ROLE can send an ERC-721 held by proxy to a recipient
 *
 * Failure modes:
 *   AccessControlUnauthorizedAccount — caller lacks RECOVERER_ROLE
 *   InvalidRecipient                 — to == address(0)
 *   TransferFailed                   — underlying call reverts (ETH send fails)
 */
contract TokenRecoverableTest is Test {
    Token public token;
    MockERC20 public mockERC20;
    MockERC721 public mockERC721;

    address public admin;
    address public recoverer;
    address public nonRecoverer;
    address public safeRecipient;

    uint256 constant INITIAL_SUPPLY = 100_000 * 10 ** 18;

    function setUp() public {
        admin = address(this);
        recoverer = address(0xEC07EC01);
        nonRecoverer = address(0xBAD00002);
        safeRecipient = address(0xFEED0003);

        // Deploy token
        Token implementation = new Token();
        bytes memory initData = abi.encodeWithSelector(
            Token.initialize.selector,
            "Test Token",
            "TEST",
            INITIAL_SUPPLY,
            admin,
            0,             // zero fee
            address(0x200),
            admin
        );
        UUPSProxy proxy = new UUPSProxy(address(implementation), initData);
        token = Token(payable(address(proxy)));

        // Grant RECOVERER_ROLE to recoverer
        token.grantRole(token.RECOVERER_ROLE(), recoverer);

        // Deploy mocks
        mockERC20 = new MockERC20();
        mockERC721 = new MockERC721();
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

        vm.prank(nonRecoverer);
        vm.expectRevert();
        token.recoverERC20(address(mockERC20), safeRecipient, 100);
    }

    function test_recoverERC20_zeroRecipientReverts() public {
        mockERC20.mint(address(token), 100);

        vm.prank(recoverer);
        vm.expectRevert(ERC20RecoverableUpgradeable.InvalidRecipient.selector);
        token.recoverERC20(address(mockERC20), address(0), 100);
    }

    // ─────────────────────────────────────────────
    // recoverETH
    // ─────────────────────────────────────────────

    function test_recoverETH_sendsETHToRecipient() public {
        // Send ETH to proxy (token has receive() function)
        uint256 amount = 1 ether;
        vm.deal(address(token), amount);

        assertEq(address(token).balance, amount);
        uint256 recipientBefore = safeRecipient.balance;

        vm.prank(recoverer);
        token.recoverETH(payable(safeRecipient), amount);

        assertEq(address(token).balance, 0);
        assertEq(safeRecipient.balance, recipientBefore + amount);
    }

    function test_recoverETH_partialAmount() public {
        uint256 total = 2 ether;
        uint256 recover = 0.5 ether;
        vm.deal(address(token), total);

        vm.prank(recoverer);
        token.recoverETH(payable(safeRecipient), recover);

        assertEq(address(token).balance, total - recover);
    }

    function test_recoverETH_nonRecovererReverts() public {
        vm.deal(address(token), 1 ether);

        vm.prank(nonRecoverer);
        vm.expectRevert();
        token.recoverETH(payable(safeRecipient), 1 ether);
    }

    function test_recoverETH_zeroRecipientReverts() public {
        vm.deal(address(token), 1 ether);

        vm.prank(recoverer);
        vm.expectRevert(ERC20RecoverableUpgradeable.InvalidRecipient.selector);
        token.recoverETH(payable(address(0)), 1 ether);
    }

    function test_recoverETH_sendToContractThatRejectsETHReverts() public {
        // Deploy a contract that has no payable receive — will reject ETH
        RejectingRecipient rejector = new RejectingRecipient();
        vm.deal(address(token), 1 ether);

        vm.prank(recoverer);
        vm.expectRevert(ERC20RecoverableUpgradeable.TransferFailed.selector);
        token.recoverETH(payable(address(rejector)), 1 ether);
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

        vm.prank(nonRecoverer);
        vm.expectRevert();
        token.recoverERC721(address(mockERC721), safeRecipient, tokenId);
    }

    function test_recoverERC721_zeroRecipientReverts() public {
        uint256 tokenId = mockERC721.mint(address(token));

        vm.prank(recoverer);
        vm.expectRevert(ERC20RecoverableUpgradeable.InvalidRecipient.selector);
        token.recoverERC721(address(mockERC721), address(0), tokenId);
    }

    function test_recoverERC721_nonOwnedTokenReverts() public {
        // Token not owned by the proxy — safeTransferFrom will revert internally
        uint256 tokenId = mockERC721.mint(safeRecipient); // owned by safeRecipient, not token contract

        vm.prank(recoverer);
        vm.expectRevert(ERC20RecoverableUpgradeable.TransferFailed.selector);
        token.recoverERC721(address(mockERC721), safeRecipient, tokenId);
    }

    // ─────────────────────────────────────────────
    // receive() — proxy accepts ETH
    // ─────────────────────────────────────────────

    function test_tokenReceivesETH() public {
        uint256 amount = 0.1 ether;
        vm.deal(address(this), amount);

        (bool ok, ) = address(token).call{value: amount}("");
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

    function testFuzz_recoverETH_amount(uint96 amount) public {
        vm.assume(amount > 0);
        vm.deal(address(token), amount);

        uint256 recipientBefore = safeRecipient.balance;

        vm.prank(recoverer);
        token.recoverETH(payable(safeRecipient), amount);

        assertEq(safeRecipient.balance, recipientBefore + amount);
    }
}

/// @dev Helper contract that rejects ETH (no receive/fallback)
contract RejectingRecipient {
    // Intentionally no receive() — any ETH sent here will revert
}
