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
    
    document.getElementById('batchUseSelfBtn').addEventListener('click', () => {
        if (userAddress) {
            document.getElementById('batchBeneficiary').value = userAddress;
        }
    });
    
    document.getElementById('addBatchTokenBtn').addEventListener('click', addBatchTokenEntry);
    document.getElementById('batchTokensContainer').addEventListener('input', handleBatchTokenInput);
    document.getElementById('batchTokensContainer').addEventListener('blur', handleBatchTokenBlur, true);
    document.getElementById('batchTokensContainer').addEventListener('click', handleBatchTokenRemove);
    
    // Add MAX button listener for initial entry
    document.querySelectorAll('.btn-max').forEach(btn => {
        btn.addEventListener('click', handleMaxClick);
    });
    
    document.getElementById('batchApproveAllBtn').addEventListener('click', batchApproveAllTokens);
    document.getElementById('batchLockForm').addEventListener('submit', batchLockMultipleTokens);
    
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
    
    // Auto-load locks when View Locks tab is opened
    if (tabName === 'view' && userAddress) {
        viewLocks();
    }
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

// Batch Lock Functions
let batchTokensInfo = {};
let batchTokenCount = 1;

function addBatchTokenEntry() {
    if (batchTokenCount >= 10) {
        alert('Maximum 10 tokens allowed per batch');
        return;
    }
    
    batchTokenCount++;
    const container = document.getElementById('batchTokensContainer');
    const entry = document.createElement('div');
    entry.className = 'batch-lock-entry';
    entry.dataset.index = batchTokenCount - 1;
    entry.innerHTML = `
        <div class="batch-lock-row">
            <div class="batch-input-group">
                <input type="text" class="batch-token-address" placeholder="Token Address (0x...)" required>
                <div class="batch-token-info hidden"></div>
            </div>
            <div class="batch-input-group">
                <input type="text" class="batch-amount" placeholder="Amount" required>
                <div class="batch-balance hidden"></div>
            </div>
            <button type="button" class="btn-max" disabled>MAX</button>
            <button type="button" class="btn-remove-batch">×</button>
        </div>
    `;
    container.appendChild(entry);
    
    // Add event listener for MAX button
    const maxBtn = entry.querySelector('.btn-max');
    maxBtn.addEventListener('click', handleMaxClick);
    
    updateBatchRemoveButtons();
    updateBatchSummary();
}

function handleBatchTokenRemove(e) {
    if (e.target.classList.contains('btn-remove-batch')) {
        const entry = e.target.closest('.batch-lock-entry');
        const tokenInput = entry.querySelector('.batch-token-address');
        if (tokenInput && tokenInput.value) {
            delete batchTokensInfo[tokenInput.value.toLowerCase()];
        }
        entry.remove();
        batchTokenCount--;
        updateBatchRemoveButtons();
        updateBatchSummary();
        resetBatchApprovalState();
    }
}

function updateBatchRemoveButtons() {
    const entries = document.querySelectorAll('.batch-lock-entry');
    entries.forEach((entry, index) => {
        const removeBtn = entry.querySelector('.btn-remove-batch');
        removeBtn.disabled = entries.length === 1;
    });
}

function handleBatchTokenInput(e) {
    if (e.target.classList.contains('batch-token-address') || e.target.classList.contains('batch-amount')) {
        resetBatchApprovalState();
        updateBatchSummary();
    }
}

function handleBatchTokenBlur(e) {
    if (e.target.classList.contains('batch-token-address')) {
        fetchBatchTokenInfo(e.target);
    }
}

async function fetchBatchTokenInfo(inputElement) {
    const tokenAddress = inputElement.value.trim();
    const entry = inputElement.closest('.batch-lock-entry');
    const infoDiv = entry.querySelector('.batch-token-info');
    const balanceSpan = entry.querySelector('.batch-balance');
    const maxBtn = entry.querySelector('.btn-max');
    
    if (!tokenAddress || tokenAddress.length !== 42) {
        infoDiv.classList.add('hidden');
        balanceSpan.classList.add('hidden');
        maxBtn.disabled = true;
        delete batchTokensInfo[tokenAddress.toLowerCase()];
        return;
    }
    
    // Check if already fetched
    if (batchTokensInfo[tokenAddress.toLowerCase()]) {
        return;
    }
    
    try {
        const response = await fetch(`/api/${currentChain}/token-info/${tokenAddress}`);
        const result = await response.json();
        
        if (result.success) {
            // Fetch balance if user is connected
            if (userAddress) {
                try {
                    const balanceResponse = await fetch(`/api/${currentChain}/token-balance/${tokenAddress}/${userAddress}`);
                    const balanceResult = await balanceResponse.json();
                    
                    if (balanceResult.success) {
                        const balance = formatTokenAmount(balanceResult.balance, result.decimals);
                        
                        // Store balance for MAX button
                        result.userBalance = balance;
                        result.userBalanceRaw = balanceResult.balance;
                        
                        // Display balance
                        balanceSpan.textContent = `${balance} ${result.symbol}`;
                        balanceSpan.classList.remove('hidden');
                        maxBtn.disabled = false;
                    }
                } catch (error) {
                    console.error('Failed to fetch balance:', error);
                }
            }
            
            batchTokensInfo[tokenAddress.toLowerCase()] = result;
            infoDiv.innerHTML = `<strong>${result.symbol}</strong> - ${result.name}`;
            infoDiv.classList.remove('hidden');
        } else {
            infoDiv.innerHTML = `<span style="color: var(--danger)">Invalid token</span>`;
            infoDiv.classList.remove('hidden');
            balanceSpan.classList.add('hidden');
            maxBtn.disabled = true;
        }
    } catch (error) {
        console.error('Failed to fetch token info:', error);
        infoDiv.classList.add('hidden');
        balanceSpan.classList.add('hidden');
        maxBtn.disabled = true;
        delete batchTokensInfo[tokenAddress.toLowerCase()];
    }
}

function handleMaxClick(e) {
    const entry = e.target.closest('.batch-lock-entry');
    const tokenInput = entry.querySelector('.batch-token-address');
    const amountInput = entry.querySelector('.batch-amount');
    const tokenAddress = tokenInput.value.trim().toLowerCase();
    
    const tokenInfo = batchTokensInfo[tokenAddress];
    if (tokenInfo && tokenInfo.userBalance) {
        amountInput.value = tokenInfo.userBalance;
        resetBatchApprovalState();
    }
}

function resetBatchApprovalState() {
    const lockBtn = document.getElementById('batchLockBtn');
    lockBtn.disabled = true;
}

function updateBatchSummary() {
    const entries = document.querySelectorAll('.batch-lock-entry');
    document.getElementById('batchTokenCount').textContent = entries.length;
    document.getElementById('batchSummaryInfo').classList.remove('hidden');
}

async function batchApproveAllTokens() {
    if (!userAddress) {
        alert('Please connect your wallet first');
        return;
    }
    
    const entries = document.querySelectorAll('.batch-lock-entry');
    const approvals = [];
    
    for (const entry of entries) {
        const tokenAddress = entry.querySelector('.batch-token-address').value.trim();
        const amountInput = entry.querySelector('.batch-amount').value;
        
        if (!tokenAddress || !amountInput) {
            alert('Please fill in all token addresses and amounts');
            return;
        }
        
        const tokenInfo = batchTokensInfo[tokenAddress.toLowerCase()];
        if (!tokenInfo) {
            alert(`Please enter a valid token address: ${tokenAddress}`);
            return;
        }
        
        try {
            const amount = parseTokenAmount(amountInput, tokenInfo.decimals);
            approvals.push({ tokenAddress, amount: amount.toString(), symbol: tokenInfo.symbol });
        } catch (error) {
            alert(`Invalid amount for ${tokenInfo.symbol}: ${amountInput}`);
            return;
        }
    }
    
    if (approvals.length === 0) {
        alert('No tokens to approve');
        return;
    }
    
    try {
        showTxStatus(`Approving ${approvals.length} token(s)...`);
        
        for (let i = 0; i < approvals.length; i++) {
            const approval = approvals[i];
            showTxStatus(`Approving ${approval.symbol} (${i + 1}/${approvals.length})...`);
            
            const response = await fetch(`/api/${currentChain}/encode/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: approval.tokenAddress,
                    amount: approval.amount
                })
            });
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error);
            }
            
            showTxStatus(`Please confirm ${approval.symbol} approval in your wallet...`);
            
            const txHash = await window.ethereum.request({
                method: 'eth_sendTransaction',
                params: [{
                    from: userAddress,
                    to: result.to,
                    data: result.data
                }]
            });
            
            showTxStatus(`${approval.symbol} approval submitted! Waiting for confirmation...`);
            await waitForTransaction(txHash);
        }
        
        showTxStatus(`All ${approvals.length} token(s) approved! You can now lock them.`, 'success');
        document.getElementById('batchLockBtn').disabled = false;
        
    } catch (error) {
        console.error('Approval failed:', error);
        showTxStatus('Approval failed: ' + (error.message || error), 'error');
    }
}

async function batchLockMultipleTokens(e) {
    e.preventDefault();
    
    if (!userAddress) {
        alert('Please connect your wallet first');
        return;
    }
    
    const beneficiary = document.getElementById('batchBeneficiary').value || userAddress;
    const periodValue = parseInt(document.getElementById('batchLockPeriodValue').value);
    const periodUnit = parseInt(document.getElementById('batchLockPeriodUnit').dataset.value);
    
    if (!periodValue) {
        alert('Please enter a lock period');
        return;
    }
    
    const lockPeriodSeconds = periodValue * periodUnit;
    
    // Collect all token entries
    const entries = document.querySelectorAll('.batch-lock-entry');
    const tokenAddresses = [];
    const amounts = [];
    
    for (const entry of entries) {
        const tokenAddress = entry.querySelector('.batch-token-address').value.trim();
        const amountInput = entry.querySelector('.batch-amount').value;
        
        if (!tokenAddress || !amountInput) {
            alert('Please fill in all fields');
            return;
        }
        
        const tokenInfo = batchTokensInfo[tokenAddress.toLowerCase()];
        if (!tokenInfo) {
            alert('Please enter valid token addresses');
            return;
        }
        
        try {
            const amount = parseTokenAmount(amountInput, tokenInfo.decimals);
            tokenAddresses.push(tokenAddress);
            amounts.push(amount.toString());
        } catch (error) {
            alert(`Invalid amount: ${amountInput}`);
            return;
        }
    }
    
    try {
        showTxStatus('Preparing multi-token lock transaction...');
        
        const response = await fetch(`/api/${currentChain}/encode/multi-token-lock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tokenAddresses: tokenAddresses,
                amounts: amounts,
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
        
        showTxStatus(`${tokenAddresses.length} token(s) locked successfully in 1 lock!`, 'success');
        
        // Reset form
        document.getElementById('batchLockForm').reset();
        document.getElementById('batchLockBtn').disabled = true;
        
        // Reset to single entry
        const container = document.getElementById('batchTokensContainer');
        container.innerHTML = `
            <div class="batch-lock-entry" data-index="0">
                <div class="batch-lock-row">
                    <div class="batch-input-group">
                        <label>Token Address</label>
                        <input type="text" class="batch-token-address" placeholder="0x..." required>
                        <div class="batch-token-info hidden"></div>
                    </div>
                    <div class="batch-input-group">
                        <label>Amount</label>
                        <input type="text" class="batch-amount" placeholder="100" required>
                    </div>
                    <button type="button" class="btn-remove-batch" disabled>×</button>
                </div>
            </div>
        `;
        batchTokenCount = 1;
        batchTokensInfo = {};
        updateBatchSummary();
        
    } catch (error) {
        console.error('Multi-token lock failed:', error);
        showTxStatus('Multi-token lock failed: ' + (error.message || error), 'error');
    }
}

async function viewLocks() {
    if (!userAddress) {
        alert('Please connect your wallet first');
        return;
    }
    
    // Show loading state
    const summary = document.getElementById('locksSummary');
    const list = document.getElementById('locksList');
    summary.innerHTML = '<div class="spinner"></div><p>Loading your locks...</p>';
    summary.classList.add('show');
    list.innerHTML = '';
    
    try {
        const response = await fetch(`/api/${currentChain}/all-locks/${userAddress}`);
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        displayAllLocks(result.locks, result.tokenCount);
        
    } catch (error) {
        console.error('Failed to fetch locks:', error);
        summary.innerHTML = '<p class="error-text">Failed to fetch locks. Please try again.</p>';
        showTxStatus('Failed to fetch locks: ' + error.message, 'error');
    }
}

function displayAllLocks(locks, tokenCount) {
    const summary = document.getElementById('locksSummary');
    const list = document.getElementById('locksList');
    
    if (locks.length === 0) {
        summary.innerHTML = '<p>No locks found for your address</p>';
        summary.classList.add('show');
        list.innerHTML = '';
        return;
    }
    
    const now = Math.floor(Date.now() / 1000);
    let totalClaimable = 0;
    
    locks.forEach(lock => {
        if (now >= lock.unlockTime && BigInt(lock.amount) > 0) totalClaimable++;
    });
    
    summary.innerHTML = `
        <h3>Total Locks: ${locks.length} across ${tokenCount} token(s)</h3>
        <p>Claimable: ${totalClaimable}</p>
    `;
    summary.classList.add('show');
    
    // Separate single and multi-token locks
    const singleLocks = locks.filter(lock => lock.type === 'single');
    const multiLocks = locks.filter(lock => lock.type === 'multi');
    
    // Group single locks by token
    const locksByToken = {};
    singleLocks.forEach(lock => {
        if (!locksByToken[lock.token]) {
            locksByToken[lock.token] = {
                symbol: lock.tokenSymbol,
                name: lock.tokenName,
                decimals: lock.tokenDecimals,
                locks: []
            };
        }
        locksByToken[lock.token].locks.push(lock);
    });
    
    // Group multi-token locks by multiLockIndex
    const locksByMultiIndex = {};
    multiLocks.forEach(lock => {
        if (!locksByMultiIndex[lock.multiLockIndex]) {
            locksByMultiIndex[lock.multiLockIndex] = {
                unlockTime: lock.unlockTime,
                tokens: []
            };
        }
        locksByMultiIndex[lock.multiLockIndex].tokens.push(lock);
    });
    
    let html = '';
    
    // Display single token locks grouped by token
    Object.entries(locksByToken).forEach(([tokenAddress, tokenData]) => {
        const tokenLocks = tokenData.locks.map(lock => {
            const isClaimable = now >= lock.unlockTime && BigInt(lock.amount) > 0;
            const status = isClaimable ? 'claimable' : 'locked';
            const statusText = isClaimable ? 'Claimable' : 'Locked';
            
            return `
                <div class="lock-card ${status}">
                    <div class="lock-card-header">
                        <span class="lock-index">Lock #${lock.tokenIndex}</span>
                        <span class="lock-status ${status}">${statusText}</span>
                    </div>
                    <div class="lock-details">
                        <div class="lock-detail">
                            <span class="lock-detail-label">Amount</span>
                            <span class="lock-detail-value">${formatTokenAmount(lock.amount, tokenData.decimals)} ${tokenData.symbol}</span>
                        </div>
                        <div class="lock-detail">
                            <span class="lock-detail-label">Unlock Time</span>
                            <span class="lock-detail-value">${formatDate(lock.unlockTime)}</span>
                        </div>
                    </div>
                    ${isClaimable ? `<button class="btn btn-success" onclick='claimLock(${JSON.stringify(lock)})'>Claim Tokens</button>` : ''}
                </div>
            `;
        }).join('');
        
        html += `
            <div class="token-group">
                <div class="token-group-header">
                    <h3>${tokenData.name} (${tokenData.symbol})</h3>
                    <span class="token-address">${shortenAddress(tokenAddress)}</span>
                </div>
                <div class="token-locks">
                    ${tokenLocks}
                </div>
            </div>
        `;
    });
    
    // Display multi-token locks grouped by batch
    Object.entries(locksByMultiIndex).forEach(([multiIndex, batchData]) => {
        const isClaimable = now >= batchData.unlockTime;
        const status = isClaimable ? 'claimable' : 'locked';
        const statusText = isClaimable ? 'Claimable' : 'Locked';
        
        const tokensDisplay = batchData.tokens.map(lock => `
            <div class="lock-detail">
                <span class="lock-detail-label">${lock.tokenSymbol}</span>
                <span class="lock-detail-value">${formatTokenAmount(lock.amount, lock.tokenDecimals)} ${lock.tokenSymbol}</span>
            </div>
        `).join('');
        
        // Use the first token's data for the claim button
        const claimData = batchData.tokens[0];
        
        html += `
            <div class="token-group">
                <div class="token-group-header">
                    <h3>Multi-Token Lock #${multiIndex}</h3>
                    <span class="lock-status ${status}">${statusText}</span>
                </div>
                <div class="token-locks">
                    <div class="lock-card ${status}">
                        <div class="lock-card-header">
                            <span class="lock-index">${batchData.tokens.length} Token(s)</span>
                            <span class="lock-detail-value">${formatDate(batchData.unlockTime)}</span>
                        </div>
                        <div class="lock-details">
                            ${tokensDisplay}
                        </div>
                        ${isClaimable ? `<button class="btn btn-success" onclick='claimLock(${JSON.stringify(claimData)})'>Claim All Tokens</button>` : ''}
                    </div>
                </div>
            </div>
        `;
    });
    
    list.innerHTML = html;
}

async function claimLock(lockData) {
    if (!userAddress) {
        alert('Please connect your wallet first');
        return;
    }
    
    try {
        showTxStatus('Preparing claim transaction...');
        
        let response;
        
        if (lockData.type === 'multi') {
            // Multi-token lock claim
            response = await fetch(`/api/${currentChain}/encode/claim-multi-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lockIndex: lockData.multiLockIndex
                })
            });
        } else {
            // Single token lock claim
            response = await fetch(`/api/${currentChain}/encode/claim`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: lockData.token,
                    lockIndex: lockData.tokenIndex
                })
            });
        }
        
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
        
        if (lockData.type === 'multi') {
            showTxStatus('Multi-token lock claimed successfully!', 'success');
        } else {
            showTxStatus('Tokens claimed successfully!', 'success');
        }
        
        // Refresh the locks view
        viewLocks();
        
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
