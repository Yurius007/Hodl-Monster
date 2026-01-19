# HodlMonster 👁

A lightweight web application for locking ERC20 tokens with a time-based release mechanism. Built with Flask and web3.py, HodlMonster provides a simple interface to lock tokens and claim them after a specified period.

## Features

- **Token Locking**: Lock any ERC20 token for a custom period
- **MetaMask Integration**: Seamless wallet connection
- **Lock Management**: View all your locks and their status
- **Easy Claims**: Claim tokens when unlock period expires

## Supported Networks

- Ethereum Sepolia

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
git clone <your-repo-url>
cd hodl

# Run the application (UV handles dependencies automatically)
uv run main.py
```

### Option 2: Using pip

```bash
# Clone the repository
git clone <your-repo-url>
cd hodl

# Create a virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
# OR
pip install flask>=3.0.0 web3>=7.0.0

# Run the application
python main.py
```

## Configuration

Edit `config.json` to configure the blockchain network and contract:

```json
{
    "chain": 11155111,
    "deployment": "0x2fffd91E32169F34e548359E506637EBAb8B8386",
    "rpc": "https://ethereum-sepolia-rpc.publicnode.com",
    "chainName": "Ethereum Sepolia Testnet"
}
```

**Parameters:**
- `chain`: Chain ID (e.g., 1 for Ethereum Mainnet, 11155111 for Sepolia)
- `deployment`: Your deployed HodlMonster contract address
- `rpc`: RPC endpoint URL
- `chainName`: Display name for the network

## Usage

1. **Start the application:**
   ```bash
   uv run main.py
   ```
   The app will be available at `http://localhost:5000`

2. **Connect your wallet:**
   1) Click "Connect Wallet" button
   2) Approve the connection in MetaMask
   3) Switch to the configured network if needed

3. **Lock tokens:**
   1) Go to "Lock Tokens" tab
   2) Enter the ERC20 token address
   3) Enter the amount to lock
   4) Select lock period (minutes, hours, days, weeks, months, years)
   5) Optionally specify a beneficiary address
   6) Approve tokens, then lock them

4. **View locks:**
   1) Go to "View Locks" tab
   2) Enter token address
   3) See all your locks with status and unlock times

5. **Claim tokens:**
   1) Go to "Claim Tokens" tab
   2) Check claimable tokens
   3) Claim individual locks when ready

## Project Structure

```
hodl/
├── main.py              # Flask backend server
├── config.json          # Network configuration
├── pyproject.toml       # Python dependencies
├── HodlMonster.sol      # Smart contract source
├── ABIs/
│   ├── ERC20_ABI.json          # Standard ERC20 ABI
│   └── HODLMONSTER_ABI.json    # HodlMonster contract ABI
├── static/
│   ├── app.js           # Frontend JavaScript
│   ├── style.css        # Styling
│   └── images/          # Logo and assets
└── templates/
    └── index.html       # Main HTML page
```

## API Endpoints

- `GET /api/config` - Get network configuration
- `GET /api/token-info/<token>` - Get ERC20 token information
- `GET /api/token-balance/<token>/<user>` - Get user's token balance
- `GET /api/locks/<user>/<token>` - Get user's locks for a token
- `GET /api/available/<user>/<token>` - Get claimable tokens
- `POST /api/encode/approve` - Encode approval transaction
- `POST /api/encode/lock` - Encode lock transaction
- `POST /api/encode/claim` - Encode claim transaction

## Security Notice

⚠️ This is a demonstration application. Always audit smart contracts before using them with real funds. Test thoroughly on testnets first.
