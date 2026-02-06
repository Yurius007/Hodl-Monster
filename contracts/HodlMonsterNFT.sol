// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
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
     ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝
     
     NFT-Based Token Locker v2.0       */

interface IERC20 {
    function transfer(
        address recipient,
        uint256 amount
    ) external returns (bool);
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract HodlMonsterNFT is
    Initializable,
    ERC721Upgradeable,
    ERC721EnumerableUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    struct TokenAmount {
        address token;
        uint256 amount;
    }

    struct Lock {
        TokenAmount[] tokens;
        uint256 unlockTime;
        bool claimed;
    }

    // Token ID counter
    uint256 private _nextTokenId;

    // Mapping from token ID to Lock details
    mapping(uint256 => Lock) private _locks;

    event TokensLocked(
        address indexed beneficiary,
        uint256 indexed tokenId,
        uint256 unlockTime,
        uint256 tokenCount
    );

    event TokensClaimed(
        address indexed claimer,
        uint256 indexed tokenId,
        uint256 tokenCount
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __ERC721_init("HodlMonster Lock", "HODL");
        __ERC721Enumerable_init();
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        _nextTokenId = 1;
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    // Required overrides for ERC721Enumerable
    function _update(
        address to,
        uint256 tokenId,
        address auth
    )
        internal
        override(ERC721Upgradeable, ERC721EnumerableUpgradeable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(
        address account,
        uint128 value
    ) internal override(ERC721Upgradeable, ERC721EnumerableUpgradeable) {
        super._increaseBalance(account, value);
    }

    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        override(ERC721Upgradeable, ERC721EnumerableUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @notice Lock one or more tokens and mint an NFT to the beneficiary
     * @param tokenAddresses Array of token contract addresses (1-10 tokens)
     * @param amounts Array of amounts for each token
     * @param lockPeriodSeconds Lock period in seconds
     * @param beneficiary Address that will own the NFT and can claim tokens
     * @return tokenId The minted NFT token ID
     */
    function lockTokens(
        address[] calldata tokenAddresses,
        uint256[] calldata amounts,
        uint256 lockPeriodSeconds,
        address beneficiary
    ) external returns (uint256 tokenId) {
        require(tokenAddresses.length > 0, "Must lock at least one token");
        require(
            tokenAddresses.length == amounts.length,
            "Arrays length mismatch"
        );
        require(tokenAddresses.length <= 10, "Maximum 10 tokens per lock");
        require(lockPeriodSeconds > 0, "Lock period must be greater than 0");
        require(beneficiary != address(0), "Invalid beneficiary address");

        uint256 unlockTime = block.timestamp + lockPeriodSeconds;
        tokenId = _nextTokenId++;

        // Store lock data
        Lock storage newLock = _locks[tokenId];
        newLock.unlockTime = unlockTime;
        newLock.claimed = false;

        // Transfer all tokens and add to lock
        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            require(tokenAddresses[i] != address(0), "Invalid token address");
            require(amounts[i] > 0, "Amount must be greater than 0");

            require(
                IERC20(tokenAddresses[i]).transferFrom(
                    msg.sender,
                    address(this),
                    amounts[i]
                ),
                "Token transfer failed"
            );

            newLock.tokens.push(
                TokenAmount({token: tokenAddresses[i], amount: amounts[i]})
            );
        }

        // Mint NFT to beneficiary
        _safeMint(beneficiary, tokenId);

        emit TokensLocked(
            beneficiary,
            tokenId,
            unlockTime,
            tokenAddresses.length
        );
    }

    /**
     * @notice Claim tokens from a lock by burning the NFT
     * @param tokenId The NFT token ID representing the lock
     */
    function claimTokens(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Not the lock owner");

        Lock storage lock = _locks[tokenId];
        require(!lock.claimed, "Already claimed");
        require(block.timestamp >= lock.unlockTime, "Tokens are still locked");

        lock.claimed = true;
        uint256 tokenCount = lock.tokens.length;

        // Transfer all tokens to the owner
        for (uint256 i = 0; i < lock.tokens.length; i++) {
            TokenAmount memory tokenAmount = lock.tokens[i];

            if (tokenAmount.amount > 0) {
                require(
                    IERC20(tokenAmount.token).transfer(
                        msg.sender,
                        tokenAmount.amount
                    ),
                    "Token transfer failed"
                );
            }
        }

        // Burn the NFT
        _burn(tokenId);

        emit TokensClaimed(msg.sender, tokenId, tokenCount);
    }

    /**
     * @notice Get lock details for a token ID
     * @param tokenId The NFT token ID
     * @return tokens Array of token addresses and amounts
     * @return unlockTime Unlock timestamp
     * @return claimed Whether already claimed
     */
    function getLockDetails(
        uint256 tokenId
    )
        external
        view
        returns (TokenAmount[] memory tokens, uint256 unlockTime, bool claimed)
    {
        Lock storage lock = _locks[tokenId];
        return (lock.tokens, lock.unlockTime, lock.claimed);
    }

    /**
     * @notice Get all lock token IDs owned by an address
     * @param owner Address to query
     * @return tokenIds Array of token IDs owned
     */
    function getOwnerLocks(
        address owner
    ) external view returns (uint256[] memory tokenIds) {
        uint256 balance = balanceOf(owner);
        tokenIds = new uint256[](balance);

        for (uint256 i = 0; i < balance; i++) {
            tokenIds[i] = tokenOfOwnerByIndex(owner, i);
        }
    }

    /**
     * @notice Get detailed lock information for all locks owned by an address
     * @param owner Address to query
     * @return ids Array of token IDs
     * @return unlockTimes Array of unlock timestamps
     * @return tokenCounts Array of token counts per lock
     */
    function getOwnerLocksDetails(
        address owner
    )
        external
        view
        returns (
            uint256[] memory ids,
            uint256[] memory unlockTimes,
            uint256[] memory tokenCounts
        )
    {
        uint256 balance = balanceOf(owner);
        ids = new uint256[](balance);
        unlockTimes = new uint256[](balance);
        tokenCounts = new uint256[](balance);

        for (uint256 i = 0; i < balance; i++) {
            uint256 tokenId = tokenOfOwnerByIndex(owner, i);
            ids[i] = tokenId;
            unlockTimes[i] = _locks[tokenId].unlockTime;
            tokenCounts[i] = _locks[tokenId].tokens.length;
        }
    }

    /**
     * @notice Get the next token ID that will be minted
     * @return The next token ID
     */
    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }
}
