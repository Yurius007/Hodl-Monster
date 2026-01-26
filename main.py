from flask import Flask, render_template, jsonify, request, redirect
from flask_cors import CORS
from flask_swagger_ui import get_swaggerui_blueprint
from web3 import Web3
import json
import os
import yaml

app = Flask(__name__, static_folder='static', template_folder='templates')

CORS(app)

# Swagger UI configuration
SWAGGER_URL = '/api/docs'
API_URL = '/api/openapi.json'

swaggerui_blueprint = get_swaggerui_blueprint(
    SWAGGER_URL,
    API_URL,
    config={
        'app_name': "Hodl Monster API",
        'validatorUrl': None,
        'docExpansion': 'list',
        'defaultModelsExpandDepth': -1
    }
)

app.register_blueprint(swaggerui_blueprint, url_prefix=SWAGGER_URL)

with open('config.json', 'r') as f:
    config = json.load(f)

with open('ABIs/ERC20_ABI.json', 'r') as f:
    ERC20_ABI = json.load(f)

with open('ABIs/HODLMONSTER_ABI.json', 'r') as f:
    abi = json.load(f)

chains = {}
for chain_key, chain_config in config['chains'].items():
    w3 = Web3(Web3.HTTPProvider(chain_config['rpc']))
    contract = None
    if chain_config.get('deployment'):
        contract_address = Web3.to_checksum_address(chain_config['deployment'])
        contract = w3.eth.contract(address=contract_address, abi=abi)
    
    chains[chain_key] = {
        'config': chain_config,
        'w3': w3,
        'contract': contract,
        'contract_address': chain_config.get('deployment', '')
    }


def get_chain_data(chain_route):
    """Get chain data by route name"""
    for chain_key, chain_info in chains.items():
        if chain_info['config']['route'] == chain_route:
            return chain_key, chain_info
    return None, None


@app.route('/')
def index():
    default_chain = config['default']
    default_route = chains[default_chain]['config']['route']
    return redirect(f'/{default_route}')


@app.route('/api/openapi.json')
def serve_openapi_spec():
    """Serve OpenAPI specification in JSON format"""
    yaml_path = os.path.join(os.path.dirname(__file__), 'openapi.yaml')
    with open(yaml_path, 'r') as f:
        spec = yaml.safe_load(f)
    return jsonify(spec)


@app.route('/<chain_route>')
def chain_index(chain_route):
    chain_key, chain_data = get_chain_data(chain_route)
    if not chain_data:
        return "Chain not found", 404
    return render_template('index.html', chain=chain_route)


@app.route('/api/chains')
def get_available_chains():
    """Get list of available chains with valid deployments"""
    available = []
    for chain_key, chain_info in chains.items():
        chain_config = chain_info['config']
        # Only include chains with valid deployment addresses
        if chain_config.get('deployment'):
            available.append({
                'key': chain_key,
                'route': chain_config['route'],
                'chainId': chain_config['chainId'],
                'chainName': chain_config['chainName']
            })
    return jsonify({'success': True, 'chains': available})


@app.route('/api/<chain_route>/config')
def get_config(chain_route):
    chain_key, chain_data = get_chain_data(chain_route)
    if not chain_data:
        return jsonify({'success': False, 'error': 'Chain not found'}), 404
    
    chain_config = chain_data['config']
    block_explorer = chain_config.get('blockExplorerUrl', 'https://etherscan.io')
    
    return jsonify({
        'chainId': chain_config['chainId'],
        'chainName': chain_config['chainName'],
        'contractAddress': chain_config.get('deployment', ''),
        'testTokenAddress': chain_config.get('testerc20', ''),
        'rpc': chain_config['rpc'],
        'blockExplorerUrl': block_explorer,
        'abi': abi
    })


@app.route('/api/<chain_route>/token-info/<token>')
def get_token_info(chain_route, token):
    chain_key, chain_data = get_chain_data(chain_route)
    if not chain_data:
        return jsonify({'success': False, 'error': 'Chain not found'}), 404
    
    try:
        w3 = chain_data['w3']
        token_addr = Web3.to_checksum_address(token)
        token_contract = w3.eth.contract(address=token_addr, abi=ERC20_ABI)
        
        symbol = token_contract.functions.symbol().call()
        decimals = token_contract.functions.decimals().call()
        
        try:
            name = token_contract.functions.name().call()
        except:
            name = symbol
        
        return jsonify({
            'success': True,
            'symbol': symbol,
            'decimals': decimals,
            'name': name
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/<chain_route>/token-balance/<token>/<address>')
def get_token_balance(chain_route, token, address):
    chain_key, chain_data = get_chain_data(chain_route)
    if not chain_data:
        return jsonify({'success': False, 'error': 'Chain not found'}), 404
    
    try:
        w3 = chain_data['w3']
        token_addr = Web3.to_checksum_address(token)
        user_addr = Web3.to_checksum_address(address)
        token_contract = w3.eth.contract(address=token_addr, abi=ERC20_ABI)
        
        balance = token_contract.functions.balanceOf(user_addr).call()
        
        return jsonify({
            'success': True,
            'balance': str(balance)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/<chain_route>/locks/<address>/<token>')
def get_user_locks(chain_route, address, token):
    chain_key, chain_data = get_chain_data(chain_route)
    if not chain_data:
        return jsonify({'success': False, 'error': 'Chain not found'}), 404
    
    if not chain_data['contract']:
        return jsonify({'success': False, 'error': 'Contract not deployed on this chain'}), 400
    
    try:
        user = Web3.to_checksum_address(address)
        token_addr = Web3.to_checksum_address(token)
        locks = chain_data['contract'].functions.getUserLocks(user, token_addr).call()
        
        formatted_locks = []
        for i, lock in enumerate(locks):
            formatted_locks.append({
                'index': i,
                'amount': str(lock[0]),
                'unlockTime': lock[1],
                'token': lock[2]
            })
        
        return jsonify({'success': True, 'locks': formatted_locks})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/<chain_route>/available/<address>/<token>')
def get_available_tokens(chain_route, address, token):
    chain_key, chain_data = get_chain_data(chain_route)
    if not chain_data:
        return jsonify({'success': False, 'error': 'Chain not found'}), 404
    
    if not chain_data['contract']:
        return jsonify({'success': False, 'error': 'Contract not deployed on this chain'}), 400
    
    try:
        user = Web3.to_checksum_address(address)
        token_addr = Web3.to_checksum_address(token)
        total, indexes = chain_data['contract'].functions.getAvailableTokens(user, token_addr).call()
        
        return jsonify({
            'success': True,
            'total': str(total),
            'claimableIndexes': list(indexes)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/<chain_route>/total-locked/<address>/<token>')
def get_total_locked(chain_route, address, token):
    chain_key, chain_data = get_chain_data(chain_route)
    if not chain_data:
        return jsonify({'success': False, 'error': 'Chain not found'}), 404
    
    if not chain_data['contract']:
        return jsonify({'success': False, 'error': 'Contract not deployed on this chain'}), 400
    
    try:
        user = Web3.to_checksum_address(address)
        token_addr = Web3.to_checksum_address(token)
        total = chain_data['contract'].functions.getTotalLockedTokens(user, token_addr).call()
        
        return jsonify({'success': True, 'total': str(total)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/<chain_route>/encode/approve', methods=['POST'])
def encode_approve(chain_route):
    chain_key, chain_data = get_chain_data(chain_route)
    if not chain_data:
        return jsonify({'success': False, 'error': 'Chain not found'}), 404
    
    if not chain_data['contract_address']:
        return jsonify({'success': False, 'error': 'Contract not deployed on this chain'}), 400
    
    try:
        w3 = chain_data['w3']
        data = request.json
        token = Web3.to_checksum_address(data['token'])
        amount = int(data['amount'])
        
        token_contract = w3.eth.contract(address=token, abi=ERC20_ABI)
        contract_address = Web3.to_checksum_address(chain_data['contract_address'])
        tx_data = token_contract.functions.approve(contract_address, amount)._encode_transaction_data()
        
        return jsonify({
            'success': True,
            'data': tx_data,
            'to': token
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/<chain_route>/encode/lock', methods=['POST'])
def encode_lock_tokens(chain_route):
    chain_key, chain_data = get_chain_data(chain_route)
    if not chain_data:
        return jsonify({'success': False, 'error': 'Chain not found'}), 404
    
    if not chain_data['contract']:
        return jsonify({'success': False, 'error': 'Contract not deployed on this chain'}), 400
    
    try:
        data = request.json
        token = Web3.to_checksum_address(data['token'])
        amount = int(data['amount'])
        lock_period = int(data['lockPeriod'])
        beneficiary = Web3.to_checksum_address(data['beneficiary'])
        
        tx_data = chain_data['contract'].functions.lockTokens(token, amount, lock_period, beneficiary)._encode_transaction_data()
        contract_address = Web3.to_checksum_address(chain_data['contract_address'])
        
        return jsonify({
            'success': True,
            'data': tx_data,
            'to': contract_address
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/<chain_route>/encode/claim', methods=['POST'])
def encode_claim_tokens(chain_route):
    chain_key, chain_data = get_chain_data(chain_route)
    if not chain_data:
        return jsonify({'success': False, 'error': 'Chain not found'}), 404
    
    if not chain_data['contract']:
        return jsonify({'success': False, 'error': 'Contract not deployed on this chain'}), 400
    
    try:
        data = request.json
        token = Web3.to_checksum_address(data['token'])
        lock_index = int(data['lockIndex'])
        
        tx_data = chain_data['contract'].functions.claimTokens(token, lock_index)._encode_transaction_data()
        contract_address = Web3.to_checksum_address(chain_data['contract_address'])
        
        return jsonify({
            'success': True,
            'data': tx_data,
            'to': contract_address
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/<chain_route>/encode/mint', methods=['POST'])
def encode_mint_tokens(chain_route):
    chain_key, chain_data = get_chain_data(chain_route)
    if not chain_data:
        return jsonify({'success': False, 'error': 'Chain not found'}), 404
    
    try:
        w3 = chain_data['w3']
        data = request.json
        token = Web3.to_checksum_address(data['token'])
        
        with open('ABIs/HODLMONSTERTOKEN_ABI.json', 'r') as f:
            token_abi = json.load(f)
        
        token_contract = w3.eth.contract(address=token, abi=token_abi)
        tx_data = token_contract.functions.mint()._encode_transaction_data()
        
        return jsonify({
            'success': True,
            'data': tx_data,
            'to': token
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)