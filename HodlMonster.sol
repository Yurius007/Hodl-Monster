// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

/*           ░░░░░░░░░░▒▒░            
          ░▒▒▒▒▒░░░░░░░░░░░░              
        ░░▒▒▒▒▒▒▓▓░▒▒░▓▓░░░░░░░         
       ░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░        
      ░▒▒▒▒▒▒▒▒▒▓▓▓▓▓▓▒░░░░░░░░░░       
     ░▒▓▒▒▒▒▒▒▒▒▒▒▓▓▓▒▒░░░░░░░░░░░░       
   ░▒▓░▓▓▒▒▒▒▒▒▒░░░░░░░░░░░░░░░░▒▒▒▒    
   ░▒▒░▒▓▓▓▒▒▒▒▒▒▒▒▒░░░░░░░░▒▒▒▒▒▓▒▒░   
   ░▓▒ ░▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▓▓▓▓▒░░  
   ░▓▒  ░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒▓▒░  
   ░▓░   ░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒░ ░▒▒░  
  ░▒▓░    ▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒░   ░▒▒░  
  ░▒▒░    ▒▓▓░▒▒▒▓▓▓▓▓▓▒▒▒▓▓▒░    ░░▒░░ 
  ░▒▒░    ▒▓▒             ▒▒▒      ░▒░░ 
 ░▒▓▒░   ░▒▓░             ▒▒▒     ░░░░  
 ░▓▓▓▒░  ░▒▓░             ▒▓▒    ░░░░▒░ 
                                       
     ██╗  ██╗ ██████╗ ██████╗ ██╗     
     ██║  ██║██╔═══██╗██╔══██╗██║     
     ███████║██║   ██║██║  ██║██║     
     ██╔══██║██║   ██║██║  ██║██║     
     ██║  ██║╚██████╔╝██████╔╝███████╗
     ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝   */

interface IERC20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract HodlMonster {
    struct Lock {
        uint256 amount;
        uint256 unlockTime;
        address token;
    }
    
    // Mapping from user address to token address to Lock details
    mapping(address => mapping(address => Lock[])) public locks;
    
    event TokensLocked(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 unlockTime,
        uint256 lockIndex
    );
    
    event TokensClaimed(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 lockIndex
    );
    
    /**
     * @notice Lock tokens for a specific period
     * @param token Address of the ERC20 token to lock
     * @param amount Amount of tokens to lock
     * @param lockPeriodSeconds Lock period in seconds
     * @param beneficiary Address that can claim the tokens
     */
    function lockTokens(
        address token,
        uint256 amount,
        uint256 lockPeriodSeconds,
        address beneficiary
    ) external {
        require(amount > 0, "Amount must be greater than 0");
        require(token != address(0), "Invalid token address");
        require(beneficiary != address(0), "Invalid beneficiary address");
        require(lockPeriodSeconds > 0, "Lock period must be greater than 0");
        
        // Transfer tokens from sender to this contract
        require(
            IERC20(token).transferFrom(msg.sender, address(this), amount),
            "Token transfer failed"
        );
        
        uint256 unlockTime = block.timestamp + lockPeriodSeconds;
        
        locks[beneficiary][token].push(Lock({
            amount: amount,
            unlockTime: unlockTime,
            token: token
        }));
        
        uint256 lockIndex = locks[beneficiary][token].length - 1;
        
        emit TokensLocked(beneficiary, token, amount, unlockTime, lockIndex);
    }
    
    /**
     * @notice Claim unlocked tokens
     * @param token Address of the ERC20 token to claim
     * @param lockIndex Index of the lock to claim
     */
    function claimTokens(address token, uint256 lockIndex) external {
        require(locks[msg.sender][token].length > lockIndex, "Invalid lock index");
        
        Lock storage lock = locks[msg.sender][token][lockIndex];
        require(lock.amount > 0, "No tokens to claim");
        require(block.timestamp >= lock.unlockTime, "Tokens are still locked");
        
        uint256 amount = lock.amount;
        lock.amount = 0; // Prevent re-entrancy
        
        require(
            IERC20(token).transfer(msg.sender, amount),
            "Token transfer failed"
        );
        
        emit TokensClaimed(msg.sender, token, amount, lockIndex);
    }
    
    /**
     * @notice Get all locks for a specific user and token
     * @param user Address of the user
     * @param token Address of the token
     * @return Array of Lock structs
     */
    function getUserLocks(address user, address token) external view returns (Lock[] memory) {
        return locks[user][token];
    }
    
    /**
     * @notice Get available tokens for claim for a specific user and token
     * @param user Address of the user
     * @param token Address of the token
     * @return total Total amount of tokens available for claim
     * @return claimableIndexes Array of lock indexes that can be claimed
     */
    function getAvailableTokens(address user, address token) 
        external 
        view 
        returns (uint256 total, uint256[] memory claimableIndexes) 
    {
        Lock[] memory userLocks = locks[user][token];
        uint256 count = 0;
        
        // Count claimable locks
        for (uint256 i = 0; i < userLocks.length; i++) {
            if (userLocks[i].amount > 0 && block.timestamp >= userLocks[i].unlockTime) {
                total += userLocks[i].amount;
                count++;
            }
        }
        
        // Populate claimable indexes
        claimableIndexes = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < userLocks.length; i++) {
            if (userLocks[i].amount > 0 && block.timestamp >= userLocks[i].unlockTime) {
                claimableIndexes[index] = i;
                index++;
            }
        }
        
        return (total, claimableIndexes);
    }
    
    /**
     * @notice Get total locked tokens (including those not yet claimable)
     * @param user Address of the user
     * @param token Address of the token
     * @return total Total amount of locked tokens
     */
    function getTotalLockedTokens(address user, address token) external view returns (uint256 total) {
        Lock[] memory userLocks = locks[user][token];
        for (uint256 i = 0; i < userLocks.length; i++) {
            total += userLocks[i].amount;
        }
        return total;
    }
}