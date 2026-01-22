// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract HodlMonsterToken is ERC20 {

    constructor() ERC20("Hodl Monster Token", "MONSTER") {
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }

    function mint() external {
        _mint(msg.sender, 100 * 10 ** decimals());
    }
}