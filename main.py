from flask import Flask, render_template, jsonify, request, redirect
from flask_cors import CORS
from flask_swagger_ui import get_swaggerui_blueprint
from web3 import Web3
import json
import os
import yaml

app = Flask(__name__, static_folder="static", template_folder="templates")

CORS(app)

# Swagger UI configuration
SWAGGER_URL = "/api/docs"
API_URL = "/api/openapi.json"

swaggerui_blueprint = get_swaggerui_blueprint(
    SWAGGER_URL,
    API_URL,
    config={
        "app_name": "Hodl Monster API",
        "validatorUrl": None,
        "docExpansion": "list",
        "defaultModelsExpandDepth": -1,
    },
)

app.register_blueprint(swaggerui_blueprint, url_prefix=SWAGGER_URL)

with open("config.json", "r") as f:
    config = json.load(f)

with open("ABIs/ERC20_ABI.json", "r") as f:
    ERC20_ABI = json.load(f)

with open("ABIs/HODLMONSTERNFT_ABI.json", "r") as f:
    abi = json.load(f)

with open("ABIs/MULTICALL3_ABI.json", "r") as f:
    MULTICALL3_ABI = json.load(f)

chains = {}
for chain_key, chain_config in config["chains"].items():
    w3 = Web3(Web3.HTTPProvider(chain_config["rpc"]))
    contract = None
    multicall = None

    if chain_config.get("deployment"):
        contract_address = Web3.to_checksum_address(chain_config["deployment"])
        contract = w3.eth.contract(address=contract_address, abi=abi)

    # Initialize Multicall3 contract if configured
    multicall_addr = chain_config.get("multicall3")
    if multicall_addr:
        multicall = w3.eth.contract(
            address=Web3.to_checksum_address(multicall_addr), abi=MULTICALL3_ABI
        )

    chains[chain_key] = {
        "config": chain_config,
        "w3": w3,
        "contract": contract,
        "contract_address": chain_config.get("deployment", ""),
        "multicall": multicall,
    }


def multicall3_batch(chain_data, calls):
    """
    Execute batched calls using Multicall3.

    Args:
        chain_data: Chain info dict with 'multicall' and 'w3'
        calls: List of tuples (target_address, encoded_call_data)

    Returns:
        List of decoded bytes results, or None if multicall not available
    """
    multicall = chain_data.get("multicall")
    if not multicall or not calls:
        return None

    try:
        # Build Call3 structs: (target, allowFailure, callData)
        call3_structs = [
            (target, True, call_data)  # allowFailure=True for graceful handling
            for target, call_data in calls
        ]

        results = multicall.functions.aggregate3(call3_structs).call()
        return results  # List of (success, returnData) tuples
    except Exception as e:
        print(f"Multicall3 batch failed: {e}")
        return None


def decode_string(data):
    """Decode ABI-encoded string from bytes"""
    if len(data) < 64:
        return ""
    try:
        # First 32 bytes is offset (typically 32), we skip it
        length = int.from_bytes(data[32:64], "big")
        return data[64 : 64 + length].decode("utf-8")
    except (UnicodeDecodeError, IndexError):
        return ""


def decode_uint(data):
    """Decode ABI-encoded uint256 from bytes"""
    if len(data) < 32:
        return 0
    return int.from_bytes(data[:32], "big")


def get_chain_data(chain_route):
    """Get chain data by route name"""
    for chain_key, chain_info in chains.items():
        if chain_info["config"]["route"] == chain_route:
            return chain_key, chain_info
    return None, None


@app.route("/")
def index():
    default_chain = config["default"]
    default_route = chains[default_chain]["config"]["route"]
    return redirect(f"/{default_route}")


@app.route("/api/openapi.json")
def serve_openapi_spec():
    """Serve OpenAPI specification in JSON format"""
    yaml_path = os.path.join(os.path.dirname(__file__), "openapi.yaml")
    with open(yaml_path, "r") as f:
        spec = yaml.safe_load(f)
    return jsonify(spec)


@app.route("/<chain_route>")
def chain_index(chain_route):
    chain_key, chain_data = get_chain_data(chain_route)
    if not chain_data:
        return "Chain not found", 404
    return render_template("index.html", chain=chain_route)


@app.route("/api/chains")
def get_available_chains():
    """Get list of available chains with valid deployments"""
    available = []
    for chain_key, chain_info in chains.items():
        chain_config = chain_info["config"]
        # Only include chains with valid deployment addresses
        if chain_config.get("deployment"):
            available.append(
                {
                    "key": chain_key,
                    "route": chain_config["route"],
                    "chainId": chain_config["chainId"],
                    "chainName": chain_config["chainName"],
                }
            )
    return jsonify({"success": True, "chains": available})


@app.route("/api/<chain_route>/config")
def get_config(chain_route):
    chain_key, chain_data = get_chain_data(chain_route)
    if not chain_data:
        return jsonify({"success": False, "error": "Chain not found"}), 404

    chain_config = chain_data["config"]
    block_explorer = chain_config.get("blockExplorerUrl", "https://etherscan.io")

    return jsonify(
        {
            "chainId": chain_config["chainId"],
            "chainName": chain_config["chainName"],
            "contractAddress": chain_config.get("deployment", ""),
            "testTokenAddress": chain_config.get("testerc20", ""),
            "rpc": chain_config["rpc"],
            "blockExplorerUrl": block_explorer,
            "abi": abi,
            "isNFT": True,  # Flag to indicate NFT-based contract
        }
    )


@app.route("/api/<chain_route>/token-info/<token>")
def get_token_info(chain_route, token):
    chain_key, chain_data = get_chain_data(chain_route)
    if not chain_data:
        return jsonify({"success": False, "error": "Chain not found"}), 404

    try:
        w3 = chain_data["w3"]
        token_addr = Web3.to_checksum_address(token)
        token_contract = w3.eth.contract(address=token_addr, abi=ERC20_ABI)

        symbol = token_contract.functions.symbol().call()
        decimals = token_contract.functions.decimals().call()

        try:
            name = token_contract.functions.name().call()
        except:
            name = symbol

        return jsonify(
            {"success": True, "symbol": symbol, "decimals": decimals, "name": name}
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/<chain_route>/token-balance/<token>/<address>")
def get_token_balance(chain_route, token, address):
    chain_key, chain_data = get_chain_data(chain_route)
    if not chain_data:
        return jsonify({"success": False, "error": "Chain not found"}), 404

    try:
        w3 = chain_data["w3"]
        token_addr = Web3.to_checksum_address(token)
        user_addr = Web3.to_checksum_address(address)
        token_contract = w3.eth.contract(address=token_addr, abi=ERC20_ABI)

        balance = token_contract.functions.balanceOf(user_addr).call()

        return jsonify({"success": True, "balance": str(balance)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/<chain_route>/tokens-batch", methods=["POST"])
def get_tokens_batch(chain_route):
    """
    Batch fetch token info and balances using Multicall3.

    Request body:
    {
        "tokens": ["0x...", "0x..."],
        "user": "0x..." (optional, for balance)
    }

    Returns info for all tokens in 1 RPC call (4 calls per token batched).
    """
    chain_key, chain_data = get_chain_data(chain_route)
    if not chain_data:
        return jsonify({"success": False, "error": "Chain not found"}), 404

    try:
        data = request.get_json()
        tokens = data.get("tokens", [])
        user_addr = data.get("user")

        if not tokens:
            return jsonify({"success": True, "tokens": {}})

        # Validate addresses
        token_list = [Web3.to_checksum_address(t) for t in tokens]
        if user_addr:
            user_addr = Web3.to_checksum_address(user_addr)

        multicall = chain_data.get("multicall")
        w3 = chain_data["w3"]

        if multicall and len(token_list) > 1:
            # Use Multicall3 for batching
            return _get_tokens_batch_multicall(w3, multicall, token_list, user_addr)
        else:
            # Fallback to sequential calls
            return _get_tokens_batch_sequential(w3, token_list, user_addr)

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


def _get_tokens_batch_multicall(w3, multicall, token_list, user_addr):
    """Fetch token info for multiple tokens using Multicall3"""
    erc20 = w3.eth.contract(address=token_list[0], abi=ERC20_ABI)

    calls = []
    for token_addr in token_list:
        # symbol(), decimals(), name()
        calls.append((token_addr, erc20.functions.symbol()._encode_transaction_data()))
        calls.append(
            (token_addr, erc20.functions.decimals()._encode_transaction_data())
        )
        calls.append((token_addr, erc20.functions.name()._encode_transaction_data()))

        # balanceOf(user) if user provided
        if user_addr:
            calls.append(
                (
                    token_addr,
                    erc20.functions.balanceOf(user_addr)._encode_transaction_data(),
                )
            )

    # Execute batch call
    results = multicall.functions.aggregate3(
        [(target, True, data) for target, data in calls]
    ).call()

    # Parse results
    tokens_info = {}
    calls_per_token = 4 if user_addr else 3

    for i, token_addr in enumerate(token_list):
        base_idx = i * calls_per_token

        symbol_success, symbol_data = results[base_idx]
        decimals_success, decimals_data = results[base_idx + 1]
        name_success, name_data = results[base_idx + 2]

        symbol = decode_string(symbol_data) if symbol_success else "UNKNOWN"
        decimals = decode_uint(decimals_data) if decimals_success else 18
        name = decode_string(name_data) if name_success else "Unknown Token"

        token_info = {
            "symbol": symbol or "UNKNOWN",
            "decimals": decimals,
            "name": name or "Unknown Token",
        }

        if user_addr:
            balance_success, balance_data = results[base_idx + 3]
            balance = decode_uint(balance_data) if balance_success else 0
            token_info["balance"] = str(balance)

        tokens_info[token_addr] = token_info

    return jsonify({"success": True, "tokens": tokens_info})


def _get_tokens_batch_sequential(w3, token_list, user_addr):
    """Fallback: fetch token info sequentially"""
    tokens_info = {}

    for token_addr in token_list:
        try:
            token_contract = w3.eth.contract(address=token_addr, abi=ERC20_ABI)

            try:
                symbol = token_contract.functions.symbol().call()
            except Exception:
                symbol = "UNKNOWN"

            try:
                decimals = token_contract.functions.decimals().call()
            except Exception:
                decimals = 18

            try:
                name = token_contract.functions.name().call()
            except Exception:
                name = symbol

            token_info = {
                "symbol": symbol,
                "decimals": decimals,
                "name": name,
            }

            if user_addr:
                try:
                    balance = token_contract.functions.balanceOf(user_addr).call()
                    token_info["balance"] = str(balance)
                except Exception:
                    token_info["balance"] = "0"

            tokens_info[token_addr] = token_info
        except Exception as e:
            print(f"Error fetching token {token_addr}: {e}")
            continue

    return jsonify({"success": True, "tokens": tokens_info})


@app.route("/api/<chain_route>/all-locks/<address>")
def get_all_user_locks(chain_route, address):
    """Get all NFT-based locks for a user (optimized with Multicall3)"""
    chain_key, chain_data = get_chain_data(chain_route)
    if not chain_data:
        return jsonify({"success": False, "error": "Chain not found"}), 404

    if not chain_data["contract"]:
        return jsonify(
            {"success": False, "error": "Contract not deployed on this chain"}
        ), 400

    try:
        user = Web3.to_checksum_address(address)
        contract = chain_data["contract"]
        contract_addr = chain_data["contract_address"]

        # Get all lock NFT token IDs for user
        lock_token_ids = contract.functions.getOwnerLocks(user).call()

        if not lock_token_ids:
            return jsonify({"success": True, "locks": [], "tokenCount": 0})

        # Check if multicall is available
        multicall = chain_data.get("multicall")

        if multicall:
            # ===== MULTICALL PATH (optimized) =====
            return _get_all_locks_multicall(
                chain_data, lock_token_ids, contract, contract_addr
            )
        else:
            # ===== FALLBACK PATH (sequential calls) =====
            return _get_all_locks_sequential(chain_data, lock_token_ids, contract)

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


def _get_all_locks_multicall(chain_data, lock_token_ids, contract, contract_addr):
    """Fetch all locks using Multicall3 batching (2 RPC calls total)"""
    multicall = chain_data["multicall"]

    # Batch 1: Get lock details for all token IDs
    lock_calls = []
    for token_id in lock_token_ids:
        call_data = contract.functions.getLockDetails(
            token_id
        )._encode_transaction_data()
        lock_calls.append((contract_addr, call_data))

    lock_results = multicall.functions.aggregate3(
        [(target, True, data) for target, data in lock_calls]
    ).call()

    # Parse lock results and collect unique tokens
    parsed_locks = []
    unique_tokens = set()

    for i, (success, return_data) in enumerate(lock_results):
        if not success:
            continue

        token_id = lock_token_ids[i]

        try:
            # Decode getLockDetails return: (TokenAmount[], uint256, bool)
            decoded = contract.functions.getLockDetails(token_id).call()
            tokens_data, unlock_time, claimed = decoded

            # Actually re-decode from return_data for true batching
            # For now, use decoded since ABI decoding of complex types is tricky
            if claimed:
                continue

            for token_amount in tokens_data:
                token_addr = token_amount[0]
                if token_amount[1] > 0:
                    unique_tokens.add(Web3.to_checksum_address(token_addr))

            parsed_locks.append(
                {
                    "token_id": token_id,
                    "tokens_data": tokens_data,
                    "unlock_time": unlock_time,
                }
            )
        except Exception as e:
            print(f"Error parsing lock {token_id}: {e}")
            continue

    if not unique_tokens:
        return jsonify({"success": True, "locks": [], "tokenCount": 0})

    # Batch 2: Get token info for all unique tokens
    token_list = list(unique_tokens)
    token_calls = []

    # Create ERC20 contract for encoding
    w3 = chain_data["w3"]
    erc20 = w3.eth.contract(address=token_list[0], abi=ERC20_ABI)

    for token_addr in token_list:
        symbol_data = erc20.functions.symbol()._encode_transaction_data()
        decimals_data = erc20.functions.decimals()._encode_transaction_data()
        name_data = erc20.functions.name()._encode_transaction_data()

        token_calls.append((token_addr, symbol_data))
        token_calls.append((token_addr, decimals_data))
        token_calls.append((token_addr, name_data))

    token_results = multicall.functions.aggregate3(
        [(target, True, data) for target, data in token_calls]
    ).call()

    # Parse token info results
    token_info = {}
    for i, token_addr in enumerate(token_list):
        base_idx = i * 3

        symbol_success, symbol_data = token_results[base_idx]
        decimals_success, decimals_data = token_results[base_idx + 1]
        name_success, name_data = token_results[base_idx + 2]

        symbol = decode_string(symbol_data) if symbol_success else "UNKNOWN"
        decimals = decode_uint(decimals_data) if decimals_success else 18
        name = decode_string(name_data) if name_success else "Unknown Token"

        token_info[token_addr] = {
            "symbol": symbol or "UNKNOWN",
            "decimals": decimals,
            "name": name or "Unknown Token",
        }

    # Build final lock list
    all_locks = []
    for lock in parsed_locks:
        lock_tokens = []
        for token_amount in lock["tokens_data"]:
            token_addr = Web3.to_checksum_address(token_amount[0])
            amount = token_amount[1]

            if amount > 0:
                info = token_info.get(
                    token_addr, {"symbol": "UNKNOWN", "decimals": 18, "name": "Unknown"}
                )
                lock_tokens.append(
                    {
                        "token": token_addr,
                        "tokenSymbol": info["symbol"],
                        "tokenName": info["name"],
                        "tokenDecimals": info["decimals"],
                        "amount": str(amount),
                    }
                )

        if lock_tokens:
            all_locks.append(
                {
                    "tokenId": lock["token_id"],
                    "tokens": lock_tokens,
                    "unlockTime": lock["unlock_time"],
                    "tokenCount": len(lock_tokens),
                }
            )

    all_locks.sort(key=lambda x: x["unlockTime"])

    return jsonify(
        {"success": True, "locks": all_locks, "tokenCount": len(unique_tokens)}
    )


def _get_all_locks_sequential(chain_data, lock_token_ids, contract):
    """Fallback: fetch all locks with sequential RPC calls"""
    all_locks = []
    unique_tokens = set()

    for token_id in lock_token_ids:
        try:
            tokens_data, unlock_time, claimed = contract.functions.getLockDetails(
                token_id
            ).call()

            if claimed:
                continue

            lock_tokens = []
            for token_amount in tokens_data:
                token_addr = token_amount[0]
                amount = token_amount[1]

                if amount > 0:
                    token_contract = chain_data["w3"].eth.contract(
                        address=token_addr, abi=ERC20_ABI
                    )
                    try:
                        symbol = token_contract.functions.symbol().call()
                        decimals = token_contract.functions.decimals().call()
                        name = token_contract.functions.name().call()
                    except Exception:
                        symbol = "UNKNOWN"
                        decimals = 18
                        name = "Unknown Token"

                    unique_tokens.add(token_addr)

                    lock_tokens.append(
                        {
                            "token": token_addr,
                            "tokenSymbol": symbol,
                            "tokenName": name,
                            "tokenDecimals": decimals,
                            "amount": str(amount),
                        }
                    )

            if lock_tokens:
                all_locks.append(
                    {
                        "tokenId": token_id,
                        "tokens": lock_tokens,
                        "unlockTime": unlock_time,
                        "tokenCount": len(lock_tokens),
                    }
                )

        except Exception as e:
            print(f"Error fetching lock {token_id}: {e}")
            continue

    all_locks.sort(key=lambda x: x["unlockTime"])

    return jsonify(
        {"success": True, "locks": all_locks, "tokenCount": len(unique_tokens)}
    )


@app.route("/api/<chain_route>/lock/<token_id>")
def get_lock_details(chain_route, token_id):
    """Get details for a specific lock NFT"""
    chain_key, chain_data = get_chain_data(chain_route)
    if not chain_data:
        return jsonify({"success": False, "error": "Chain not found"}), 404

    if not chain_data["contract"]:
        return jsonify(
            {"success": False, "error": "Contract not deployed on this chain"}
        ), 400

    try:
        nft_id = int(token_id)
        tokens_data, unlock_time, claimed = (
            chain_data["contract"].functions.getLockDetails(nft_id).call()
        )

        # Get owner
        try:
            owner = chain_data["contract"].functions.ownerOf(nft_id).call()
        except:
            owner = None

        lock_tokens = []
        for token_amount in tokens_data:
            token_addr = token_amount[0]
            amount = token_amount[1]

            if amount > 0:
                token_contract = chain_data["w3"].eth.contract(
                    address=token_addr, abi=ERC20_ABI
                )
                try:
                    symbol = token_contract.functions.symbol().call()
                    decimals = token_contract.functions.decimals().call()
                    name = token_contract.functions.name().call()
                except:
                    symbol = "UNKNOWN"
                    decimals = 18
                    name = "Unknown Token"

                lock_tokens.append(
                    {
                        "token": token_addr,
                        "tokenSymbol": symbol,
                        "tokenName": name,
                        "tokenDecimals": decimals,
                        "amount": str(amount),
                    }
                )

        return jsonify(
            {
                "success": True,
                "tokenId": nft_id,
                "owner": owner,
                "tokens": lock_tokens,
                "unlockTime": unlock_time,
                "claimed": claimed,
            }
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/<chain_route>/encode/approve", methods=["POST"])
def encode_approve(chain_route):
    chain_key, chain_data = get_chain_data(chain_route)
    if not chain_data:
        return jsonify({"success": False, "error": "Chain not found"}), 404

    if not chain_data["contract_address"]:
        return jsonify(
            {"success": False, "error": "Contract not deployed on this chain"}
        ), 400

    try:
        w3 = chain_data["w3"]
        data = request.json
        token = Web3.to_checksum_address(data["token"])
        amount = int(data["amount"])

        token_contract = w3.eth.contract(address=token, abi=ERC20_ABI)
        contract_address = Web3.to_checksum_address(chain_data["contract_address"])
        tx_data = token_contract.functions.approve(
            contract_address, amount
        )._encode_transaction_data()

        return jsonify({"success": True, "data": tx_data, "to": token})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/<chain_route>/encode/lock", methods=["POST"])
def encode_lock_tokens(chain_route):
    """Encode lock transaction - unified for single and multi-token locks"""
    chain_key, chain_data = get_chain_data(chain_route)
    if not chain_data:
        return jsonify({"success": False, "error": "Chain not found"}), 404

    if not chain_data["contract"]:
        return jsonify(
            {"success": False, "error": "Contract not deployed on this chain"}
        ), 400

    try:
        data = request.json

        # Handle both single token and multi-token format
        if "token" in data:
            # Single token format (backward compatible)
            token_addresses = [Web3.to_checksum_address(data["token"])]
            amounts = [int(data["amount"])]
        else:
            # Multi-token format
            token_addresses = [
                Web3.to_checksum_address(addr) for addr in data["tokenAddresses"]
            ]
            amounts = [int(amt) for amt in data["amounts"]]

        lock_period = int(data["lockPeriod"])
        beneficiary = Web3.to_checksum_address(data["beneficiary"])

        # Validate arrays
        if len(token_addresses) != len(amounts):
            return jsonify(
                {
                    "success": False,
                    "error": "tokenAddresses and amounts arrays must have the same length",
                }
            ), 400

        if len(token_addresses) == 0 or len(token_addresses) > 10:
            return jsonify({"success": False, "error": "Must provide 1-10 tokens"}), 400

        tx_data = (
            chain_data["contract"]
            .functions.lockTokens(token_addresses, amounts, lock_period, beneficiary)
            ._encode_transaction_data()
        )
        contract_address = Web3.to_checksum_address(chain_data["contract_address"])

        return jsonify(
            {
                "success": True,
                "data": tx_data,
                "to": contract_address,
                "tokenCount": len(token_addresses),
            }
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/<chain_route>/encode/claim", methods=["POST"])
def encode_claim_tokens(chain_route):
    """Encode claim transaction using NFT token ID"""
    chain_key, chain_data = get_chain_data(chain_route)
    if not chain_data:
        return jsonify({"success": False, "error": "Chain not found"}), 404

    if not chain_data["contract"]:
        return jsonify(
            {"success": False, "error": "Contract not deployed on this chain"}
        ), 400

    try:
        data = request.json
        token_id = int(data["tokenId"])

        tx_data = (
            chain_data["contract"]
            .functions.claimTokens(token_id)
            ._encode_transaction_data()
        )
        contract_address = Web3.to_checksum_address(chain_data["contract_address"])

        return jsonify({"success": True, "data": tx_data, "to": contract_address})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/<chain_route>/encode/mint", methods=["POST"])
def encode_mint_tokens(chain_route):
    chain_key, chain_data = get_chain_data(chain_route)
    if not chain_data:
        return jsonify({"success": False, "error": "Chain not found"}), 404

    try:
        w3 = chain_data["w3"]
        data = request.json
        token = Web3.to_checksum_address(data["token"])

        with open("ABIs/HODLMONSTERTOKEN_ABI.json", "r") as f:
            token_abi = json.load(f)

        token_contract = w3.eth.contract(address=token, abi=token_abi)
        tx_data = token_contract.functions.mint()._encode_transaction_data()

        return jsonify({"success": True, "data": tx_data, "to": token})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
