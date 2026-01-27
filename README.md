# HodlMonster 🦖

A lightweight web application for locking ERC20 tokens with a time-based release mechanism. Built with Flask and web3.py, HodlMonster provides a simple interface to lock tokens and claim them after a specified period.

## Features

- **Token Locking**: Lock any ERC20 token for a custom period
- **Batch Lock**: Lock multiple different tokens in a single transaction
- **Multi-Chain Support**: Switch between different chains via dropdown selector
- **Lock Management**: View all your locks with auto-refresh (grouped by batch)
- **Easy Claims**: Claim tokens directly from the View Locks tab when unlocked
- **Test Token Minting**: Mint test tokens directly from the UI
- **Copy Addresses**: One-click copy for token addresses

## Prerequisites

- Python 3.10 or higher
- MetaMask, Rabby or another Web3 wallet
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
   "default": "base-sepolia",
   "chains": {
      "base-sepolia": {
         "route": "base-sepolia",
         "chainId": 84532,
         "chainName": "Base Sepolia Testnet",
         "deployment": "0x2fffd91E32169F34e548359E506637EBAb8B8386",
         "testerc20": "0x962d47612fA2982bfE4074D3C8B30012E72C6EdC",
         "rpc": "https://base-sepolia-rpc.publicnode.com",
         "blockExplorerUrl": "https://sepolia.basescan.org"
      }
   }
}
```

**Parameters:**
- `default`: The default chain to use on startup
- `route`: Internal route identifier for the chain
- `chainId`: Chain ID (e.g., 1 for Ethereum Mainnet, 84532 for Base Sepolia)
- `chainName`: Display name for the network
- `deployment`: Your deployed HodlMonster contract address
- `testerc20`: (Optional) Test token address for minting functionality
- `rpc`: RPC endpoint URL
- `blockExplorerUrl`: Block explorer URL for transaction verification

## Usage

1. **Start the application:**
   ```bash
   uv run main.py
   ```
   The app will be available at `http://localhost:5000` and will redirect to the default chain (e.g., `/base-sepolia`)

2. **Select your chain:**
   - Use the chain dropdown in the header to switch between available chains
   - Only chains with deployed contracts will appear in the selector

3. **Connect your wallet:**
   - Click "Connect Wallet" button
   - Approve the connection in MetaMask
   - If on wrong network, click "Switch Network" button to change

4. **Mint test tokens (optional):**
   - Go to "Mint Test Tokens" tab
   - View token name, symbol, and address
   - Click copy icon to copy token address
   - Click "Mint Test Tokens" to receive test tokens in your wallet

4. **Lock single token:**
   - Go to "Lock Tokens" tab
   - Enter the ERC20 token address (auto-loads token info)
   - Enter the amount to lock (use MAX button for full balance)
   - Select lock period from dropdown (minutes, hours, days, weeks, months, years)
   - Optionally specify a beneficiary address (or click "Use My Address")
   - Click "1. Approve Tokens" and confirm in wallet
   - Click "2. Lock Tokens" and confirm in wallet

5. **Lock multiple tokens (Batch Lock):**
   - Go to "Batch Lock" tab
   - Enter token addresses and amounts (click + to add more, up to 10 tokens)
   - Use MAX button to set full balance for each token
   - Select lock period (same for all tokens in batch)
   - Optionally specify a beneficiary address
   - Click "Approve All Tokens" and confirm in wallet
   - Click "Lock All Tokens" and confirm in wallet
   - All tokens will be locked together and claimed as a group

6. **View and claim locks:**
   - Go to "View Locks" tab (auto-loads when opened)
   - See all your locks grouped by batch (newest first)
   - Single-token locks show individually
   - Multi-token locks show all tokens in the batch together
   - Click "Claim Tokens" button when locks are unlocked

## Project Structure

```
hodl/
├── main.py              # Flask backend server
├── config.json          # Network configuration
├── pyproject.toml       # Python dependencies
├── contracts
│   ├── HodlMonster.sol       # Smart contract source
│   └── monstercoin.sol       # Test ERC20 Smart contract source
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

## API Documentation

The application provides OpenAPI documentation for all available endpoints. Once the server is running, visit:
- **Swagger UI**: `http://localhost:5000/api/docs` - Interactive API documentation
- **OpenAPI Spec**: `http://localhost:5000/openapi.yaml` - Complete API specification

## Development

The application uses:
- **Backend**: Flask 3.0+, web3.py 7.0+
- **Frontend**: Vanilla JavaScript
- **Blockchain**: Ethereum JSON-RPC, MetaMask provider

## Supported Networks

HodlMonster works with any EVM-compatible chain.

This repository is currently configured to work with:
- **Base Sepolia**
- **Ethereum Sepolia**

## Security Notice

⚠️ This is a demonstration application. Always audit smart contracts before using them with real funds. Test thoroughly on testnets first.