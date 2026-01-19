from flask import Flask, render_template, jsonify, request
from web3 import Web3
import json
import os

app = Flask(__name__, static_folder='static', template_folder='templates')

with open('config.json', 'r') as f:
    config = json.load(f)

with open('ABIs/ERC20_ABI.json', 'r') as f:
    ERC20_ABI = json.load(f)

with open('ABIs/HODLMONSTER_ABI.json', 'r') as f:
    abi = json.load(f)

w3 = Web3(Web3.HTTPProvider(config['rpc']))
contract_address = Web3.to_checksum_address(config['deployment'])
contract = w3.eth.contract(address=contract_address, abi=abi)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/config')
def get_config():
    explorer_urls = {
        1: 'https://etherscan.io',
        11155111: 'https://sepolia.etherscan.io',
        8453: 'https://basescan.org',
        84532: 'https://sepolia.basescan.org',
        137: 'https://polygonscan.com',
        80002: 'https://amoy.polygonscan.com',
        10: 'https://optimistic.etherscan.io',
        42161: 'https://arbiscan.io',
    }
    
    chain_id = config['chain']
    block_explorer = explorer_urls.get(chain_id, f'https://etherscan.io')
    
    return jsonify({
        'chainId': chain_id,
        'chainName': config.get('chainName', f'Chain {chain_id}'),
        'contractAddress': config['deployment'],
        'rpc': config['rpc'],
        'blockExplorerUrl': block_explorer,
        'abi': abi
    })


@app.route('/api/token-info/<token>')
def get_token_info(token):
    try:
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


@app.route('/api/token-balance/<token>/<address>')
def get_token_balance(token, address):
    try:
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


@app.route('/api/locks/<address>/<token>')
def get_user_locks(address, token):
    try:
        user = Web3.to_checksum_address(address)
        token_addr = Web3.to_checksum_address(token)
        locks = contract.functions.getUserLocks(user, token_addr).call()
        
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


@app.route('/api/available/<address>/<token>')
def get_available_tokens(address, token):
    try:
        user = Web3.to_checksum_address(address)
        token_addr = Web3.to_checksum_address(token)
        total, indexes = contract.functions.getAvailableTokens(user, token_addr).call()
        
        return jsonify({
            'success': True,
            'total': str(total),
            'claimableIndexes': list(indexes)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/total-locked/<address>/<token>')
def get_total_locked(address, token):
    try:
        user = Web3.to_checksum_address(address)
        token_addr = Web3.to_checksum_address(token)
        total = contract.functions.getTotalLockedTokens(user, token_addr).call()
        
        return jsonify({'success': True, 'total': str(total)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/encode/approve', methods=['POST'])
def encode_approve():
    try:
        data = request.json
        token = Web3.to_checksum_address(data['token'])
        amount = int(data['amount'])
        
        token_contract = w3.eth.contract(address=token, abi=ERC20_ABI)
        tx_data = token_contract.functions.approve(contract_address, amount)._encode_transaction_data()
        
        return jsonify({
            'success': True,
            'data': tx_data,
            'to': token
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/encode/lock', methods=['POST'])
def encode_lock_tokens():
    try:
        data = request.json
        token = Web3.to_checksum_address(data['token'])
        amount = int(data['amount'])
        lock_period = int(data['lockPeriod'])
        beneficiary = Web3.to_checksum_address(data['beneficiary'])
        
        tx_data = contract.functions.lockTokens(token, amount, lock_period, beneficiary)._encode_transaction_data()
        
        return jsonify({
            'success': True,
            'data': tx_data,
            'to': contract_address
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/encode/claim', methods=['POST'])
def encode_claim_tokens():
    try:
        data = request.json
        token = Web3.to_checksum_address(data['token'])
        lock_index = int(data['lockIndex'])
        
        tx_data = contract.functions.claimTokens(token, lock_index)._encode_transaction_data()
        
        return jsonify({
            'success': True,
            'data': tx_data,
            'to': contract_address
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

