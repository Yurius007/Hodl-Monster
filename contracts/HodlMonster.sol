// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

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

contract HodlMonster is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    struct TokenAmount {
        address token;
        uint256 amount;
    }
    
    struct Lock {
        uint256 amount;
        uint256 unlockTime;
        address token;
    }
    
    struct MultiTokenLock {
        TokenAmount[] tokens;
        uint256 unlockTime;
    }
    
    // Mapping from user address to token address to Lock details (single token locks)
    mapping(address => mapping(address => Lock[])) public locks;
    
    // Mapping from user address to multi-token lock array
    mapping(address => MultiTokenLock[]) public multiTokenLocks;
    
    // Mapping from user address to array of tokens they have locked
    mapping(address => address[]) private userTokens;
    
    // Mapping to check if a user has already locked a specific token
    mapping(address => mapping(address => bool)) private hasLockedToken;
    
    event TokensLocked(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 unlockTime,
        uint256 lockIndex
    );
    
    event MultiTokensLocked(
        address indexed user,
        uint256 unlockTime,
        uint256 lockIndex,
        uint256 tokenCount
    );
    
    event TokensClaimed(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 lockIndex
    );
    
    event MultiTokensClaimed(
        address indexed user,
        uint256 lockIndex,
        uint256 tokenCount
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /**
     * @notice Add a token to user's tracked tokens list
     */
    function _addUserToken(address user, address token) private {
        if (!hasLockedToken[user][token]) {
            userTokens[user].push(token);
            hasLockedToken[user][token] = true;
        }
    }
    
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
        
        // Track this token for the beneficiary
        _addUserToken(beneficiary, token);
        
        locks[beneficiary][token].push(Lock({
            amount: amount,
            unlockTime: unlockTime,
            token: token
        }));
        
        uint256 lockIndex = locks[beneficiary][token].length - 1;
        
        emit TokensLocked(beneficiary, token, amount, unlockTime, lockIndex);
    }
    
    /**
     * @notice Lock multiple different ERC20 tokens in a single lock entry
     * @param tokenAddresses Array of token contract addresses (1-10 tokens)
     * @param amounts Array of amounts for each token
     * @param lockPeriodSeconds Lock period in seconds (same for all tokens)
     * @param beneficiary Address that can claim the tokens
     */
    function lockMultipleTokens(
        address[] calldata tokenAddresses,
        uint256[] calldata amounts,
        uint256 lockPeriodSeconds,
        address beneficiary
    ) external {
        require(tokenAddresses.length > 0, "Must lock at least one token");
        require(tokenAddresses.length == amounts.length, "Arrays length mismatch");
        require(tokenAddresses.length <= 10, "Maximum 10 tokens per lock");
        require(lockPeriodSeconds > 0, "Lock period must be greater than 0");
        require(beneficiary != address(0), "Invalid beneficiary address");
        
        uint256 unlockTime = block.timestamp + lockPeriodSeconds;
        
        // Create new multi-token lock
        MultiTokenLock storage newLock = multiTokenLocks[beneficiary].push();
        newLock.unlockTime = unlockTime;
        
        // Transfer all tokens and add to lock
        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            require(tokenAddresses[i] != address(0), "Invalid token address");
            require(amounts[i] > 0, "Amount must be greater than 0");
            
            // Transfer tokens from sender to this contract
            require(
                IERC20(tokenAddresses[i]).transferFrom(msg.sender, address(this), amounts[i]),
                "Token transfer failed"
            );
            
            // Track each token for the beneficiary
            _addUserToken(beneficiary, tokenAddresses[i]);
            
            newLock.tokens.push(TokenAmount({
                token: tokenAddresses[i],
                amount: amounts[i]
            }));
        }
        
        uint256 lockIndex = multiTokenLocks[beneficiary].length - 1;
        
        emit MultiTokensLocked(beneficiary, unlockTime, lockIndex, tokenAddresses.length);
    }
    
    /**
     * @notice Claim all tokens from a multi-token lock
     * @param lockIndex Index of the multi-token lock to claim
     */
    function claimMultipleTokens(uint256 lockIndex) external {
        require(multiTokenLocks[msg.sender].length > lockIndex, "Invalid lock index");
        
        MultiTokenLock storage lock = multiTokenLocks[msg.sender][lockIndex];
        require(lock.tokens.length > 0, "No tokens to claim");
        require(block.timestamp >= lock.unlockTime, "Tokens are still locked");
        
        uint256 tokenCount = lock.tokens.length;
        
        // Transfer all tokens to the user
        for (uint256 i = 0; i < lock.tokens.length; i++) {
            TokenAmount memory tokenAmount = lock.tokens[i];
            
            if (tokenAmount.amount > 0) {
                require(
                    IERC20(tokenAmount.token).transfer(msg.sender, tokenAmount.amount),
                    "Token transfer failed"
                );
            }
        }
        
        // Clear the lock
        delete multiTokenLocks[msg.sender][lockIndex];
        
        emit MultiTokensClaimed(msg.sender, lockIndex, tokenCount);
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
     * @notice Get all tokens that a user has locked
     * @param user Address of the user
     * @return Array of token addresses
     */
    function getUserTokens(address user) external view returns (address[] memory) {
        return userTokens[user];
    }
    
    /**
     * @notice Get all locks across all tokens for a user
     * @param user Address of the user
     * @return allLocks Array of all locks with token addresses
     */
    function getAllUserLocks(address user) external view returns (Lock[] memory allLocks) {
        // First, count total locks
        uint256 totalLocks = 0;
        address[] memory tokens = userTokens[user];
        
        for (uint256 i = 0; i < tokens.length; i++) {
            totalLocks += locks[user][tokens[i]].length;
        }
        
        // Create array of all locks
        allLocks = new Lock[](totalLocks);
        uint256 currentIndex = 0;
        
        for (uint256 i = 0; i < tokens.length; i++) {
            Lock[] memory tokenLocks = locks[user][tokens[i]];
            for (uint256 j = 0; j < tokenLocks.length; j++) {
                allLocks[currentIndex] = tokenLocks[j];
                currentIndex++;
            }
        }
        
        return allLocks;
    }
    
    /**
     * @notice Get all multi-token locks for a specific user
     * @param user Address of the user
     * @return lockCount Number of multi-token locks
     */
    function getUserMultiTokenLocksCount(address user) external view returns (uint256 lockCount) {
        return multiTokenLocks[user].length;
    }
    
    /**
     * @notice Get details of a specific multi-token lock
     * @param user Address of the user
     * @param lockIndex Index of the lock
     * @return tokens Array of token addresses and amounts
     * @return unlockTime Unlock timestamp
     */
    function getMultiTokenLockDetails(address user, uint256 lockIndex) 
        external 
        view 
        returns (TokenAmount[] memory tokens, uint256 unlockTime) 
    {
        require(multiTokenLocks[user].length > lockIndex, "Invalid lock index");
        MultiTokenLock storage lock = multiTokenLocks[user][lockIndex];
        return (lock.tokens, lock.unlockTime);
    }
}