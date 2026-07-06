// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

/**
 * @title ERC20RecoverableUpgradeable
 * @dev Extension that allows recovery of tokens/ETH/NFT sent to the contract by
 * mistake. Note: `recoverERC20(address(this), ...)` can also move this token's
 * own balance held by the contract; the transfer goes through the standard
 * transfer path (pause and transfer fee apply).
 */
abstract contract ERC20RecoverableUpgradeable is Initializable, AccessControlUpgradeable, ERC721Holder {
    using SafeERC20 for IERC20;

    bytes32 public constant RECOVERER_ROLE = keccak256("RECOVERER_ROLE");

    error InvalidRecipient();
    error TransferFailed();

    function __ERC20Recoverable_init() internal onlyInitializing {}

    function __ERC20Recoverable_init_unchained() internal onlyInitializing {}

    /**
     * @notice Recover ERC-20 tokens sent to the contract by mistake
     * @param token The address of the token to recover
     * @param to The address to send the recovered tokens to
     * @param amount The amount to recover
     */
    function recoverERC20(address token, address to, uint256 amount) public onlyRole(RECOVERER_ROLE) {
        if (to == address(0)) {
            revert InvalidRecipient();
        }

        IERC20(token).safeTransfer(to, amount);
    }

    /**
     * @notice Recover native ETH/POL sent to the contract by mistake
     * @param to The address to send the recovered ETH to
     * @param amount The amount to recover
     */
    function recoverETH(address payable to, uint256 amount) public onlyRole(RECOVERER_ROLE) {
        if (to == address(0)) {
            revert InvalidRecipient();
        }

        (bool success, ) = to.call{value: amount}("");
        if (!success) {
            revert TransferFailed();
        }
    }

    /**
     * @notice Recover ERC-721 NFTs sent to the contract by mistake
     * @param nft The address of the NFT contract
     * @param to The address to send the recovered NFT to
     * @param tokenId The token ID to recover
     */
    function recoverERC721(address nft, address to, uint256 tokenId) public onlyRole(RECOVERER_ROLE) {
        if (to == address(0)) {
            revert InvalidRecipient();
        }

        IERC721(nft).safeTransferFrom(address(this), to, tokenId);
    }

    /**
     * @dev Receive function to accept native ETH/POL
     */
    receive() external payable {}
}
