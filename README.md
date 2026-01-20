# HodlMonster 🦖

A lightweight web application for locking ERC20 tokens with a time-based release mechanism. Built with Flask and web3.py, HodlMonster provides a simple interface to lock tokens and claim them after a specified period.

## Features

- **Token Locking**: Lock any ERC20 token for a custom period
- **MetaMask Integration**: Seamless wallet connection
- **Multi-Chain Support**: Works with any EVM-compatible chain
- **Lock Management**: View all your locks and their status (newest first)
- **Easy Claims**: Claim tokens when unlock period expires
- **Test Token Minting**: Mint test tokens directly from the UI
- **Copy Addresses**: One-click copy for token addresses
- **Clean UI**: Dark theme with smooth scrolling navigation

## Prerequisites

- Python 3.10 or higher
- MetaMask or another Web3 wallet
- ERC20 tokens to lock

## Installation & Setup

### Option 1: Using UV (Recommended)

[UV](https://github.com/astral-sh/uv) is a fast Python package installer and resolver.

```bash
# Install UV (if not already installed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Clone the repository
git clone https://github.com/Yurius007/Hodl-Monster.git
cd Hodl-Monster

# Run the application (UV handles dependencies automatically)
uv run main.py
```

### Option 2: Using pip

```bash
# Clone the repository
git clone https://github.com/Yurius007/Hodl-Monster.git
cd Hodl-Monster

# Create a virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install .
# OR
pip install flask web3

# Run the application
python3 main.py # On Windows: python main.py
```

## Configuration

Edit `config.json` to configure the blockchain network and contract:

```json
{
    "chain": 84532,
    "deployment": "0x2fffd91E32169F34e548359E506637EBAb8B8386",
    "testerc20": "0x962d47612fA2982bfE4074D3C8B30012E72C6EdC",
    "rpc": "https://base-sepolia-rpc.publicnode.com",
    "chainName": "Base Sepolia Testnet"
}
```

**Parameters:**
- `chain`: Chain ID (e.g., 1 for Ethereum Mainnet, 84532 for Base Sepolia)
- `deployment`: Your deployed HodlMonster contract address
- `testerc20`: (Optional) Test token address for minting functionality
- `rpc`: RPC endpoint URL
- `chainName`: Display name for the network

## Usage

1. **Start the application:**
   ```bash
   uv run main.py
   ```
   The app will be available at `http://localhost:5000`

2. **Connect your wallet:**
   - Click "Connect Wallet" button
   - Approve the connection in MetaMask
   - Switch to the configured network if needed

3. **Mint test tokens (optional):**
   - Go to "Mint Test Tokens" tab
   - View token name, symbol, and address
   - Click copy icon to copy token address
   - Click "Mint Test Tokens" to receive test tokens in your wallet

4. **Lock tokens:**
   - Go to "Lock Tokens" tab
   - Enter the ERC20 token address (auto-loads token info)
   - Enter the amount to lock (use MAX button for full balance)
   - Select lock period (minutes, hours, days, weeks, months, years)
   - Optionally specify a beneficiary address (or click "Use My Address")
   - Click "1. Approve Tokens" and confirm in wallet
   - Click "2. Lock Tokens" and confirm in wallet

5. **View locks:**
   - Go to "View Locks" tab
   - Enter token address
   - Click "View My Locks"
   - See all your locks (newest first) with status, amounts, and unlock times

6. **Claim tokens:**
   - Go to "Claim Tokens" tab
   - Enter token address
   - Click "Check Claimable" to see ready-to-claim locks
   - Click "Claim Lock #X" for individual locks when ready

## Project Structure

```
hodl/
├── main.py              # Flask backend server
├── config.json          # Network configuration
├── pyproject.toml       # Python dependencies
├── HodlMonster.sol      # Smart contract source
├── ABIs/
│   ├── ERC20_ABI.json              # Standard ERC20 ABI
│   ├── HODLMONSTER_ABI.json        # HodlMonster contract ABI
│   └── HODLMONSTERTOKEN_ABI.json   # Test token ABI (with mint function)
├── static/
│   ├── app.js           # Frontend JavaScript
│   ├── style.css        # Styling
│   └── images/          # Logo and assets
└── templates/
    └── index.html       # Main HTML page
```

## API Endpoints

- `GET /api/config` - Get network configuration (includes test token address)
- `GET /api/token-info/<token>` - Get ERC20 token information
- `GET /api/token-balance/<token>/<user>` - Get user's token balance
- `GET /api/locks/<user>/<token>` - Get user's locks for a token
- `GET /api/available/<user>/<token>` - Get claimable tokens
- `POST /api/encode/approve` - Encode approval transaction
- `POST /api/encode/lock` - Encode lock transaction
- `POST /api/encode/claim` - Encode claim transaction
- `POST /api/encode/mint` - Encode mint transaction for test tokens

## Development

The application uses:
- **Backend**: Flask 3.0+, web3.py 7.0+
- **Frontend**: Vanilla JavaScript
- **Blockchain**: Ethereum JSON-RPC, MetaMask provider

## Supported Networks

HodlMonster works with any EVM-compatible chain. Popular options:
- Ethereum (Mainnet, Sepolia, Goerli)
- Base (Mainnet, Base Sepolia)
- Polygon
- BSC (Binance Smart Chain)
- Arbitrum
- Optimism
- Avalanche

This repository is currently configured to work with Base Sepolia

## Security Notice

⚠️ This is a demonstration application. Always audit smart contracts before using them with real funds. Test thoroughly on testnets first.
