// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../../contracts/Token.sol";
import "forge-std/Test.sol";

/**
 * @title TokenHandler
 * @dev Handler contract for invariant testing - exposes stateful functions
 */
contract TokenHandler is Test {
    Token public token;
    
    // Actors for testing
    address[] public actors;
    mapping(address => bool) public isActor;
    
    // Ghost variables for tracking
    uint256 public totalMinted;
    uint256 public totalBurned;
    uint256 public currentFee;
    
    // Roles
    address public admin;
    address public minter;
    address public burner;
    address public pauser;
    address public freezer;
    address public blocker;
    address public feeAdmin;
    
    constructor(Token _token, address _admin) {
        token = _token;
        admin = _admin;
        
        // Setup roles
        minter = address(0x1);
        burner = address(0x2);
        pauser = address(0x3);
        freezer = address(0x4);
        blocker = address(0x5);
        feeAdmin = address(0x6);
        
        // Grant roles (requires admin to have called these)
        vm.startPrank(admin);
        _token.grantRole(_token.MINTER_ROLE(), minter);
        _token.grantRole(_token.BURNER_ROLE(), burner);
        _token.grantRole(_token.PAUSER_ROLE(), pauser);
        _token.grantRole(_token.FREEZER_ROLE(), freezer);
        _token.grantRole(_token.BLOCKER_ROLE(), blocker);
        _token.grantRole(_token.FEE_ADMIN_ROLE(), feeAdmin);
        vm.stopPrank();
        
        // Initialize actors
        for (uint256 i = 0; i < 5; i++) {
            address actor = address(uint160(0x1000 + i));
            actors.push(actor);
            isActor[actor] = true;
            
            // Fund actors with some tokens
            vm.prank(minter);
            _token.mint(actor, 10000 * 10**18);
            totalMinted += 10000 * 10**18;
        }
        
        currentFee = _token.fee();
    }
    
    function getActors() external view returns (address[] memory) {
        return actors;
    }
    
    // Stateful functions for fuzzing
    
    function mint(uint256 actorIndex, uint256 amount) external {
        address to = actors[bound(actorIndex, 0, actors.length - 1)];
        amount = bound(amount, 0, 1_000_000 * 10**18); // Max 1M tokens
        
        vm.prank(minter);
        token.mint(to, amount);
        totalMinted += amount;
    }
    
    function burn(uint256 actorIndex, uint256 amount) external {
        address from = actors[bound(actorIndex, 0, actors.length - 1)];
        uint256 balance = token.balanceOf(from);
        amount = bound(amount, 0, balance);
        
        if (amount > 0) {
            vm.prank(burner);
            token.burn(from, amount);
            totalBurned += amount;
        }
    }
    
    function transfer(uint256 fromIndex, uint256 toIndex, uint256 amount) external {
        address from = actors[bound(fromIndex, 0, actors.length - 1)];
        address to = actors[bound(toIndex, 0, actors.length - 1)];
        
        // Skip if blocked or same address
        if (from == to || token.isBlocked(from) || token.isBlocked(to)) {
            return;
        }
        
        uint256 balance = token.balanceOf(from);
        uint256 frozen = token.frozenOf(from);
        uint256 available = balance > frozen ? balance - frozen : 0;
        
        amount = bound(amount, 0, available);
        
        if (amount > 0) {
            vm.prank(from);
            token.transfer(to, amount);
        }
    }
    
    function setFee(uint256 newFee) external {
        newFee = bound(newFee, 0, token.MAX_FEE_BASIS_POINTS());
        
        vm.prank(feeAdmin);
        token.setFee(newFee);
        currentFee = newFee;
    }
    
    function freeze(uint256 actorIndex, uint256 amount) external {
        address account = actors[bound(actorIndex, 0, actors.length - 1)];
        amount = bound(amount, 0, type(uint256).max);
        
        vm.prank(freezer);
        token.freeze(account, amount);
    }
    
    function freezeAll(uint256 actorIndex) external {
        address account = actors[bound(actorIndex, 0, actors.length - 1)];
        
        vm.prank(freezer);
        token.freezeAll(account);
    }
    
    function unfreeze(uint256 actorIndex) external {
        address account = actors[bound(actorIndex, 0, actors.length - 1)];
        
        vm.prank(freezer);
        token.unfreeze(account);
    }
    
    function blockUser(uint256 actorIndex) external {
        address account = actors[bound(actorIndex, 0, actors.length - 1)];
        
        vm.prank(blocker);
        token.blockUser(account);
    }
    
    function resetUser(uint256 actorIndex) external {
        address account = actors[bound(actorIndex, 0, actors.length - 1)];
        
        vm.prank(blocker);
        token.resetUser(account);
    }
    
    function pause() external {
        vm.prank(pauser);
        token.pause();
    }
    
    function unpause() external {
        vm.prank(pauser);
        token.unpause();
    }
}
