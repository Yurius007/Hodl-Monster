let config = null;
let userAddress = null;
let provider = null;
let signer = null;
let currentTokenInfo = null;
let currentChain = null;

document.addEventListener('DOMContentLoaded', async () => {
    const pathParts = window.location.pathname.split('/').filter(p => p);
    currentChain = pathParts[0] || 'base';
    
    await loadAvailableChains();
    await loadConfig();
    setupEventListeners();
    checkWalletConnection();
});

async function loadAvailableChains() {
    try {
        const response = await fetch('/api/chains');
        const result = await response.json();
        
        if (result.success && result.chains.length > 0) {
            const menu = document.getElementById('chainDropdownMenu');
            const toggle = document.getElementById('chainSelector');
            menu.innerHTML = '';
            
            result.chains.forEach(chain => {
                const item = document.createElement('div');
                item.className = 'custom-dropdown-item';
                if (chain.route === currentChain) {
                    item.classList.add('active');
                    toggle.querySelector('.custom-dropdown-text').textContent = chain.chainName;
                }
                item.textContent = chain.chainName;
                item.dataset.value = chain.route;
                
                item.addEventListener('click', () => {
                    if (chain.route !== currentChain) {
                        window.location.href = `/${chain.route}`;
                    }
                });
                
                menu.appendChild(item);
            });
        }
    } catch (error) {
        console.error('Failed to load available chains:', error);
    }
}

async function loadConfig() {
    try {
        const response = await fetch(`/api/${currentChain}/config`);
        config = await response.json();
        
        const contractLink = document.getElementById('contractLink');
        if (config.contractAddress) {
            contractLink.href = `${config.blockExplorerUrl}/address/${config.contractAddress}`;
            contractLink.textContent = shortenAddress(config.contractAddress);
        } else {
            contractLink.textContent = 'Not deployed';
            contractLink.href = '#';
        }
        
        const chainFooter = document.getElementById('chainFooter');
        if (chainFooter) {
            chainFooter.textContent = `Chain: ${config.chainName} (${config.chainId})`;
        }
        
        if (config.testTokenAddress) {
            await loadTestTokenInfo(config.testTokenAddress);
        }
    } catch (error) {
        console.error('Failed to load config:', error);
        showTxStatus('Failed to load configuration', 'error');
    }
}

function setupEventListeners() {
    document.getElementById('connectBtn').addEventListener('click', connectWallet);
    
    setupCustomDropdowns();
    
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    
    document.getElementById('tokenAddress').addEventListener('blur', fetchTokenInfo);
    document.getElementById('tokenAddress').addEventListener('change', fetchTokenInfo);
    document.getElementById('tokenAddress').addEventListener('input', resetApprovalState);
    
    document.getElementById('lockAmount').addEventListener('input', resetApprovalState);
    
    document.getElementById('useSelfBtn').addEventListener('click', () => {
        if (userAddress) {
            document.getElementById('beneficiary').value = userAddress;
        }
    });
    
    document.getElementById('approveBtn').addEventListener('click', approveTokens);
    document.getElementById('lockForm').addEventListener('submit', lockTokens);
    
    document.getElementById('viewLocksBtn').addEventListener('click', viewLocks);
    
    document.getElementById('checkClaimableBtn').addEventListener('click', checkClaimable);
    
    document.getElementById('mintBtn').addEventListener('click', mintTestTokens);
    
    document.getElementById('copyAddressBtn').addEventListener('click', copyTestTokenAddress);
    
    document.getElementById('switchNetworkBtn').addEventListener('click', switchNetwork);
}

function setupCustomDropdowns() {
    document.querySelectorAll('.custom-dropdown').forEach(dropdown => {
        const toggle = dropdown.querySelector('.custom-dropdown-toggle');
        const menu = dropdown.querySelector('.custom-dropdown-menu');
        
        if (!toggle || !menu) return;
        
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdown.classList.contains('open');
            
            document.querySelectorAll('.custom-dropdown.open').forEach(d => {
                d.classList.remove('open');
            });
            
            if (!isOpen) {
                dropdown.classList.add('open');
            }
        });
        
        menu.querySelectorAll('.custom-dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                
                menu.querySelectorAll('.custom-dropdown-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                
                toggle.querySelector('.custom-dropdown-text').textContent = item.textContent;
                toggle.dataset.value = item.dataset.value;
                
                dropdown.classList.remove('open');
            });
        });
    });
    
    document.addEventListener('click', () => {
        document.querySelectorAll('.custom-dropdown.open').forEach(d => {
            d.classList.remove('open');
        });
    });
}

function resetApprovalState() {
    const lockBtn = document.getElementById('lockBtn');
    lockBtn.disabled = true;
}

async function loadTestTokenInfo(tokenAddress) {
    try {
        const response = await fetch(`/api/${currentChain}/token-info/${tokenAddress}`);
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('mintTokenSymbol').textContent = result.symbol;
            document.getElementById('mintTokenName').textContent = result.name;
            document.getElementById('mintTokenAddressDisplay').textContent = tokenAddress;
            document.getElementById('mintTokenInfo').classList.remove('hidden');
        }
    } catch (error) {
        console.error('Failed to load test token info:', error);
    }
}

function copyTestTokenAddress() {
    const address = document.getElementById('mintTokenAddressDisplay').textContent;
    navigator.clipboard.writeText(address).then(() => {
        const btn = document.getElementById('copyAddressBtn');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        btn.style.color = 'var(--success)';
        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.color = '';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        showTxStatus('Failed to copy address', 'error');
    });
}

async function checkWalletConnection() {
    if (typeof window.ethereum !== 'undefined') {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
            await connectWallet();
        }
    }
}

async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
        alert('Please install MetaMask or another Web3 wallet!');
        return;
    }
    
    try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        userAddress = accounts[0];
        
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        const currentChainId = parseInt(chainId, 16);
        
        updateWalletUI(currentChainId);
        
        provider = window.ethereum;
        
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length === 0) {
                disconnectWallet();
            } else {
                userAddress = accounts[0];
                updateWalletUI(currentChainId);
                if (currentTokenInfo) {
                    const tokenAddress = document.getElementById('tokenAddress').value;
                    fetchTokenBalance(tokenAddress);
                }
            }
        });
        
        window.ethereum.on('chainChanged', (chainId) => {
            const newChainId = parseInt(chainId, 16);
            updateWalletUI(newChainId);
        });
        
        if (currentChainId !== config.chainId) {
            await switchNetwork();
        }
        
        document.getElementById('connectBtn').textContent = 'Connected';
        document.getElementById('connectBtn').disabled = true;
        
    } catch (error) {
        console.error('Failed to connect wallet:', error);
        showTxStatus('Failed to connect wallet', 'error');
    }
}

function updateWalletUI(chainId) {
    const walletInfo = document.getElementById('walletInfo');
    const walletAddress = document.getElementById('walletAddress');
    const networkName = document.getElementById('networkName');
    const switchNetworkBtn = document.getElementById('switchNetworkBtn');
    
    walletInfo.classList.remove('hidden');
    walletAddress.textContent = shortenAddress(userAddress);
    
    if (chainId === config.chainId) {
        networkName.textContent = config.chainName || `Chain ${config.chainId}`;
        networkName.classList.remove('wrong');
        switchNetworkBtn.classList.add('hidden');
    } else {
        networkName.textContent = 'Wrong Network';
        networkName.classList.add('wrong');
        switchNetworkBtn.classList.remove('hidden');
    }
}

async function switchNetwork() {
    try {
        showTxStatus(`Switching to ${config.chainName}...`);
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x' + config.chainId.toString(16) }],
        });
        showTxStatus(`Switched to ${config.chainName}`, 'success');
    } catch (switchError) {
        if (switchError.code === 4902) {
            try {
                showTxStatus(`Adding ${config.chainName} to wallet...`);
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: '0x' + config.chainId.toString(16),
                        chainName: config.chainName || `Chain ${config.chainId}`,
                        nativeCurrency: {
                            name: 'ETH',
                            symbol: 'ETH',
                            decimals: 18
                        },
                        rpcUrls: [config.rpc],
                        blockExplorerUrls: [config.blockExplorerUrl]
                    }],
                });
                showTxStatus(`${config.chainName} added and switched!`, 'success');
            } catch (addError) {
                console.error('Failed to add network:', addError);
                showTxStatus('Failed to add network: ' + (addError.message || 'User rejected'), 'error');
            }
        } else if (switchError.code === 4001) {
            showTxStatus('Network switch cancelled', 'error');
        } else {
            console.error('Failed to switch network:', switchError);
            showTxStatus('Failed to switch network: ' + (switchError.message || 'Unknown error'), 'error');
        }
    }
}

function disconnectWallet() {
    userAddress = null;
    document.getElementById('walletInfo').classList.add('hidden');
    document.getElementById('connectBtn').textContent = 'Connect Wallet';
    document.getElementById('connectBtn').disabled = false;
}

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    const activeTabContent = document.getElementById(`${tabName}Tab`);
    activeTabContent.classList.add('active');
    
    const tabs = document.querySelector('.tabs');
    tabs.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function fetchTokenInfo() {
    const tokenAddress = document.getElementById('tokenAddress').value;
    const tokenInfoDiv = document.getElementById('tokenInfo');
    const balanceInfoDiv = document.getElementById('balanceInfo');
    
    if (!tokenAddress || tokenAddress.length !== 42 || !tokenAddress.startsWith('0x')) {
        tokenInfoDiv.classList.add('hidden');
        balanceInfoDiv.classList.add('hidden');
        currentTokenInfo = null;
        return;
    }
    
    try {
        const response = await fetch(`/api/${currentChain}/token-info/${tokenAddress}`);
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        currentTokenInfo = result;
        
        tokenInfoDiv.innerHTML = `
            <span class="token-symbol">${result.symbol}</span>
            <span class="token-name">${result.name}</span>
            <span class="token-name">(${result.decimals} decimals)</span>
        `;
        tokenInfoDiv.classList.remove('hidden');
        
        document.getElementById('lockAmount').placeholder = `Amount in ${result.symbol}`;
        
        if (userAddress) {
            await fetchTokenBalance(tokenAddress);
        } else {
            balanceInfoDiv.classList.add('hidden');
        }
        
    } catch (error) {
        console.error('Failed to fetch token info:', error);
        tokenInfoDiv.innerHTML = '<span style="color: var(--danger);">Failed to load token info</span>';
        tokenInfoDiv.classList.remove('hidden');
        balanceInfoDiv.classList.add('hidden');
        currentTokenInfo = null;
    }
}

async function fetchTokenBalance(tokenAddress) {
    const balanceInfoDiv = document.getElementById('balanceInfo');
    
    try {
        const response = await fetch(`/api/${currentChain}/token-balance/${tokenAddress}/${userAddress}`);
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        const balance = formatTokenAmount(result.balance, currentTokenInfo.decimals);
        
        balanceInfoDiv.innerHTML = `
            <span class="balance-label">Your balance:</span>
            <span class="balance-amount">${balance} ${currentTokenInfo.symbol}</span>
            <button type="button" class="use-max-btn" onclick="useMaxBalance('${result.balance}')">MAX</button>
        `;
        balanceInfoDiv.classList.remove('hidden');
        
    } catch (error) {
        console.error('Failed to fetch balance:', error);
        balanceInfoDiv.classList.add('hidden');
    }
}

function useMaxBalance(balance) {
    if (currentTokenInfo) {
        const formatted = formatTokenAmount(balance, currentTokenInfo.decimals);
        document.getElementById('lockAmount').value = formatted;
    }
}

function parseTokenAmount(amount, decimals) {
    const parts = amount.split('.');
    const whole = parts[0] || '0';
    const fraction = parts[1] || '0';
    
    const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
    
    const combined = whole + paddedFraction;
    return BigInt(combined);
}

function formatTokenAmount(amount, decimals) {
    const num = BigInt(amount);
    const divisor = BigInt(10 ** decimals);
    const whole = num / divisor;
    const fraction = num % divisor;
    
    if (fraction === BigInt(0)) {
        return whole.toString();
    }
    
    let fractionStr = fraction.toString().padStart(decimals, '0');
    fractionStr = fractionStr.replace(/0+$/, '');
    
    return `${whole}.${fractionStr}`;
}

async function approveTokens(e) {
    e.preventDefault();
    
    if (!userAddress) {
        alert('Please connect your wallet first');
        return;
    }
    
    const tokenAddress = document.getElementById('tokenAddress').value;
    const humanAmount = document.getElementById('lockAmount').value;
    
    if (!tokenAddress || !humanAmount) {
        alert('Please enter token address and amount');
        return;
    }
    
    if (!currentTokenInfo) {
        await fetchTokenInfo();
        if (!currentTokenInfo) {
            alert('Please enter a valid token address');
            return;
        }
    }
    
    try {
        const amount = parseTokenAmount(humanAmount, currentTokenInfo.decimals).toString();
        
        showTxStatus('Preparing approval...');
        
        const response = await fetch(`/api/${currentChain}/encode/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: tokenAddress,
                amount: amount
            })
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        showTxStatus('Please confirm the approval in your wallet...');
        
        const txHash = await window.ethereum.request({
            method: 'eth_sendTransaction',
            params: [{
                from: userAddress,
                to: result.to,
                data: result.data
            }]
        });
        
        showTxStatus('Approval submitted! Waiting for confirmation...');
        
        await waitForTransaction(txHash);
        
        showTxStatus('Tokens approved! You can now lock them.', 'success');
        
        document.getElementById('lockBtn').disabled = false;
        
    } catch (error) {
        console.error('Approval failed:', error);
        showTxStatus('Approval failed: ' + (error.message || error), 'error');
    }
}

async function lockTokens(e) {
    e.preventDefault();
    
    if (!userAddress) {
        alert('Please connect your wallet first');
        return;
    }
    
    const tokenAddress = document.getElementById('tokenAddress').value;
    const humanAmount = document.getElementById('lockAmount').value;
    const periodValue = parseInt(document.getElementById('lockPeriodValue').value);
    const periodUnit = parseInt(document.getElementById('lockPeriodUnit').dataset.value);
    const beneficiary = document.getElementById('beneficiary').value || userAddress;
    
    if (!tokenAddress || !humanAmount) {
        alert('Please enter token address and amount');
        return;
    }
    
    if (!currentTokenInfo) {
        await fetchTokenInfo();
        if (!currentTokenInfo) {
            alert('Please enter a valid token address');
            return;
        }
    }
    
    const lockPeriodSeconds = periodValue * periodUnit;
    
    const amount = parseTokenAmount(humanAmount, currentTokenInfo.decimals).toString();
    
    try {
        showTxStatus('Preparing lock transaction...');
        
        const response = await fetch(`/api/${currentChain}/encode/lock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: tokenAddress,
                amount: amount,
                lockPeriod: lockPeriodSeconds,
                beneficiary: beneficiary
            })
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        showTxStatus('Please confirm the transaction in your wallet...');
        
        const txHash = await window.ethereum.request({
            method: 'eth_sendTransaction',
            params: [{
                from: userAddress,
                to: result.to,
                data: result.data
            }]
        });
        
        showTxStatus('Transaction submitted! Waiting for confirmation...');
        
        await waitForTransaction(txHash);
        
        showTxStatus('Tokens locked successfully!', 'success');
        
        document.getElementById('lockForm').reset();
        document.getElementById('lockBtn').disabled = true;
        
    } catch (error) {
        console.error('Lock failed:', error);
        showTxStatus('Lock failed: ' + (error.message || error), 'error');
    }
}

async function viewLocks() {
    if (!userAddress) {
        alert('Please connect your wallet first');
        return;
    }
    
    const tokenAddress = document.getElementById('viewTokenAddress').value;
    
    if (!tokenAddress) {
        alert('Please enter a token address');
        return;
    }
    
    try {
        const tokenInfoResponse = await fetch(`/api/${currentChain}/token-info/${tokenAddress}`);
        const tokenInfo = await tokenInfoResponse.json();
        
        if (!tokenInfo.success) {
            throw new Error('Failed to load token info');
        }
        
        const response = await fetch(`/api/${currentChain}/locks/${userAddress}/${tokenAddress}`);
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        displayLocks(result.locks, tokenAddress, tokenInfo);
        
    } catch (error) {
        console.error('Failed to fetch locks:', error);
        showTxStatus('Failed to fetch locks: ' + error.message, 'error');
    }
}

function displayLocks(locks, tokenAddress, tokenInfo) {
    const summary = document.getElementById('locksSummary');
    const list = document.getElementById('locksList');
    
    if (locks.length === 0) {
        summary.innerHTML = '<p>No locks found for this token</p>';
        summary.classList.add('show');
        list.innerHTML = '';
        return;
    }
    
    let totalLocked = BigInt(0);
    let claimableCount = 0;
    const now = Math.floor(Date.now() / 1000);
    
    locks.forEach(lock => {
        if (BigInt(lock.amount) > 0) {
            totalLocked += BigInt(lock.amount);
            if (now >= lock.unlockTime) claimableCount++;
        }
    });
    
    summary.innerHTML = `
        <h3>Total Locks: ${locks.length}</h3>
        <p>Total Locked: ${formatTokenAmount(totalLocked.toString(), tokenInfo.decimals)} ${tokenInfo.symbol}</p>
        <p>Claimable: ${claimableCount}</p>
    `;
    summary.classList.add('show');
    
    list.innerHTML = locks.slice().reverse().map((lock, reversedIndex) => {
        const index = locks.length - 1 - reversedIndex;
        const isClaimable = now >= lock.unlockTime && BigInt(lock.amount) > 0;
        const isClaimed = BigInt(lock.amount) === BigInt(0);
        const status = isClaimed ? 'claimed' : (isClaimable ? 'claimable' : 'locked');
        const statusText = isClaimed ? 'Claimed' : (isClaimable ? 'Claimable' : 'Locked');
        
        return `
            <div class="lock-card ${status}">
                <div class="lock-card-header">
                    <span class="lock-index">Lock #${index}</span>
                    <span class="lock-status ${status}">${statusText}</span>
                </div>
                <div class="lock-details">
                    <div class="lock-detail">
                        <span class="lock-detail-label">Amount</span>
                        <span class="lock-detail-value">${formatTokenAmount(lock.amount, tokenInfo.decimals)} ${tokenInfo.symbol}</span>
                    </div>
                    <div class="lock-detail">
                        <span class="lock-detail-label">Unlock Time</span>
                        <span class="lock-detail-value">${formatDate(lock.unlockTime)}</span>
                    </div>
                </div>
                ${isClaimable ? `<button class="btn btn-success" onclick="claimLock('${tokenAddress}', ${index})">Claim Tokens</button>` : ''}
            </div>
        `;
    }).join('');
}

async function checkClaimable(e = null) {
    const providedTokenAddress = (e && typeof e === 'string') ? e : null;
    
    if (!userAddress) {
        alert('Please connect your wallet first');
        return;
    }
    
    const tokenAddress = providedTokenAddress || document.getElementById('claimTokenAddress').value;
    
    if (!tokenAddress) {
        alert('Please enter a token address');
        return;
    }
    
    try {
        const tokenInfoResponse = await fetch(`/api/${currentChain}/token-info/${tokenAddress}`);
        const tokenInfo = await tokenInfoResponse.json();
        
        if (!tokenInfo.success) {
            throw new Error('Failed to load token info');
        }
        
        const response = await fetch(`/api/${currentChain}/available/${userAddress}/${tokenAddress}`);
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        displayClaimable(result, tokenAddress, tokenInfo);
        
    } catch (error) {
        console.error('Failed to check claimable:', error);
        showTxStatus('Failed to check claimable: ' + error.message, 'error');
    }
}

function displayClaimable(data, tokenAddress, tokenInfo) {
    const summary = document.getElementById('claimableSummary');
    const list = document.getElementById('claimableList');
    
    if (data.claimableIndexes.length === 0) {
        summary.innerHTML = '<p>No tokens available to claim</p>';
        summary.classList.add('show');
        list.innerHTML = '';
        return;
    }
    
    summary.innerHTML = `
        <h3 class="text-success">Tokens Ready to Claim!</h3>
        <p>Total Available: ${formatTokenAmount(data.total, tokenInfo.decimals)} ${tokenInfo.symbol}</p>
        <p>Claimable Locks: ${data.claimableIndexes.length}</p>
    `;
    summary.classList.add('show');
    
    list.innerHTML = data.claimableIndexes.map(index => `
        <div class="lock-card claimable">
            <div class="lock-card-header">
                <span class="lock-index">Lock #${index}</span>
                <span class="lock-status claimable">Ready</span>
            </div>
            <button class="btn btn-success" onclick="claimLock('${tokenAddress}', ${index})">
                Claim Lock #${index}
            </button>
        </div>
    `).join('');
}

async function claimLock(tokenAddress, lockIndex) {
    if (!userAddress) {
        alert('Please connect your wallet first');
        return;
    }
    
    try {
        showTxStatus('Preparing claim transaction...');
        
        const response = await fetch(`/api/${currentChain}/encode/claim`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: tokenAddress,
                lockIndex: lockIndex
            })
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        showTxStatus('Please confirm the transaction in your wallet...');
        
        const txHash = await window.ethereum.request({
            method: 'eth_sendTransaction',
            params: [{
                from: userAddress,
                to: result.to,
                data: result.data
            }]
        });
        
        showTxStatus('Transaction submitted! Waiting for confirmation...');
        
        await waitForTransaction(txHash);
        
        showTxStatus('Tokens claimed successfully! ', 'success');
        
        checkClaimable(tokenAddress);
        
    } catch (error) {
        console.error('Claim failed:', error);
        showTxStatus('Claim failed: ' + (error.message || error), 'error');
    }
}

async function waitForTransaction(txHash) {
    return new Promise((resolve, reject) => {
        const checkReceipt = async () => {
            try {
                const receipt = await window.ethereum.request({
                    method: 'eth_getTransactionReceipt',
                    params: [txHash]
                });
                
                if (receipt) {
                    if (receipt.status === '0x1') {
                        resolve(receipt);
                    } else {
                        reject(new Error('Transaction failed'));
                    }
                } else {
                    setTimeout(checkReceipt, 2000);
                }
            } catch (error) {
                reject(error);
            }
        };
        
        checkReceipt();
    });
}

function showTxStatus(message, type = '') {
    const status = document.getElementById('txStatus');
    const messageEl = document.getElementById('txMessage');
    
    status.classList.remove('hidden', 'success', 'error');
    if (type) {
        status.classList.add(type);
    }
    
    messageEl.textContent = message;
    
    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            status.classList.add('hidden');
        }, 5000);
    }
}

function shortenAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDate(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
}

async function mintTestTokens() {
    if (!userAddress) {
        alert('Please connect your wallet first');
        return;
    }
    
    const tokenAddress = document.getElementById('mintTokenAddressDisplay').textContent;
    
    if (!tokenAddress || tokenAddress === '0x...') {
        alert('Test token address not configured');
        return;
    }
    
    try {
        showTxStatus('Preparing mint transaction...');
        
        const response = await fetch(`/api/${currentChain}/encode/mint`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: tokenAddress
            })
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        showTxStatus('Please confirm the transaction in your wallet...');
        
        const txHash = await window.ethereum.request({
            method: 'eth_sendTransaction',
            params: [{
                from: userAddress,
                to: result.to,
                data: result.data
            }]
        });
        
        showTxStatus('Transaction submitted! Waiting for confirmation...');
        
        await waitForTransaction(txHash);
        
        showTxStatus('Test tokens minted successfully!', 'success');
        
    } catch (error) {
        console.error('Mint failed:', error);
        showTxStatus('Mint failed: ' + (error.message || error), 'error');
    }
}

window.claimLock = claimLock;
window.useMaxBalance = useMaxBalance;
