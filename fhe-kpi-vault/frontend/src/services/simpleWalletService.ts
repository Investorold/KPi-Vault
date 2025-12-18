import { ethers } from 'ethers';
import { secureLogger } from '../utils/secureLogger';

declare global {
  interface Window {
    ethereum?: any;
    okxwallet?: any;
    phantom?: { ethereum?: any };
    zerionWallet?: any;
    evmAsk?: any;
    __stableProvider?: any;
    __selectedProvider?: any;
  }
}

class SimpleWalletService {
  private provider: ethers.BrowserProvider | null = null;
  private signer: ethers.Signer | null = null;
  private isConnected = false;
  private address = '';
  private walletName = '';

  private readonly STORAGE_KEY = 'fhevm_wallet_connection';
  private readonly INACTIVITY_TIMEOUT = 48 * 60 * 60 * 1000; // 48 hours

  selectProvider() {
    try {
      if (window.__stableProvider) {
        return window.__stableProvider;
      }

      if (window.__selectedProvider) {
        return window.__selectedProvider;
      }

      let selectedProvider = null;

      // Try to access window.ethereum safely (it might be read-only due to extension conflicts)
      try {
        if (window.ethereum?.providers && Array.isArray(window.ethereum.providers)) {
          // Multiple providers detected - prefer MetaMask
          selectedProvider = window.ethereum.providers.find((p: any) => p.isMetaMask) || window.ethereum.providers[0];
        } else if (window.ethereum) {
          selectedProvider = window.ethereum;
        }
      } catch (e) {
        // window.ethereum might be read-only due to extension conflicts
        secureLogger.warn('Could not access window.ethereum directly, trying alternative methods:', e);
        // Try to access via providers array if available
        try {
          if ((window as any).ethereum?.providers?.length > 0) {
            selectedProvider = (window as any).ethereum.providers.find((p: any) => p.isMetaMask) || (window as any).ethereum.providers[0];
          }
        } catch (e2) {
          secureLogger.warn('Alternative provider access also failed:', e2);
        }
      }

      if (!selectedProvider && window.evmAsk) {
        selectedProvider = window.evmAsk;
      }

      if (selectedProvider) {
        window.__stableProvider = selectedProvider;
        window.__selectedProvider = selectedProvider;
        return selectedProvider;
      }

      return null;
    } catch (error) {
      secureLogger.error('Provider conflict resolution failed:', error);
      return null;
    }
  }

  async loadPersistedConnection(): Promise<boolean> {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) {
        secureLogger.debug('No stored wallet connection found');
        return false;
      }

      const { address, timestamp } = JSON.parse(stored);
      const timeSinceLastActivity = Date.now() - timestamp;
      
      if (timeSinceLastActivity > this.INACTIVITY_TIMEOUT) {
        secureLogger.debug(`Wallet connection expired (${Math.round(timeSinceLastActivity / (60 * 60 * 1000))} hours old)`);
        localStorage.removeItem(this.STORAGE_KEY);
        return false;
      }

      // Wait a bit for wallet extension to be ready
      let selectedProvider = this.selectProvider();
      if (!selectedProvider) {
        // Retry after a short delay - wallet might not be ready yet
        await new Promise(resolve => setTimeout(resolve, 500));
        selectedProvider = this.selectProvider();
        if (!selectedProvider) {
          secureLogger.debug('No wallet provider available for restore');
          return false;
        }
      }

      this.provider = new ethers.BrowserProvider(selectedProvider);
      
      // Request accounts - this should work if wallet is unlocked
      let accounts: string[] = [];
      try {
        accounts = await selectedProvider.request({ method: 'eth_accounts' });
      } catch (requestError: any) {
        secureLogger.debug('eth_accounts request failed:', requestError?.message || requestError);
        // If request fails, wallet might be locked - don't remove storage, just return false
        return false;
      }
      
      if (!accounts || accounts.length === 0) {
        secureLogger.debug('No accounts returned from wallet (wallet may be locked)');
        // Don't remove storage - wallet might just be locked
        return false;
      }
      
      if (accounts[0].toLowerCase() !== address.toLowerCase()) {
        secureLogger.debug(`Account mismatch: stored ${address}, got ${accounts[0]}`);
        localStorage.removeItem(this.STORAGE_KEY);
        return false;
      }

      // Successfully restored!
      this.signer = await this.provider.getSigner();
      this.address = address;
      this.isConnected = true;
      this.walletName = 'MetaMask';
      this.saveConnection(); // Refresh timestamp
      secureLogger.debug(`Wallet connection restored for ${address.substring(0, 6)}...`);
      return true;
    } catch (error: any) {
      secureLogger.debug('Failed to restore wallet connection:', error?.message || error);
      // Don't remove storage on error - might be temporary (wallet locked, etc.)
      return false;
    }
  }

  private saveConnection() {
    if (this.address) {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
        address: this.address,
        timestamp: Date.now()
      }));
    }
  }

  /**
   * Update activity timestamp - call this on user interactions
   * This keeps the wallet connected if user is active
   */
  updateActivity() {
    if (this.isConnected && this.address) {
      this.saveConnection(); // Refresh timestamp
    }
  }

  async connect(): Promise<void> {
    const selectedProvider = this.selectProvider();
    if (!selectedProvider) {
      throw new Error('No wallet provider available. Install MetaMask or a compatible wallet.');
    }

    this.provider = new ethers.BrowserProvider(selectedProvider);
    this.signer = await this.provider.getSigner();

    const address = await this.signer.getAddress();
    const network = await this.provider.getNetwork();

    this.isConnected = true;
    this.address = address;
    this.walletName = 'MetaMask';
    this.saveConnection();

    if (network.chainId !== 11155111n) {
      try {
        await selectedProvider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xaa36a7' }]
        });
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          await selectedProvider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0xaa36a7',
              chainName: 'Sepolia Testnet',
              nativeCurrency: {
                name: 'Sepolia ETH',
                symbol: 'ETH',
                decimals: 18
              },
              rpcUrls: ['https://ethereum-sepolia.publicnode.com'],
              blockExplorerUrls: ['https://sepolia.etherscan.io']
            }]
          });
        } else {
          throw switchError;
        }
      }
    }
  }

  disconnect() {
    this.provider = null;
    this.signer = null;
    this.isConnected = false;
    this.address = '';
    this.walletName = '';
    localStorage.removeItem(this.STORAGE_KEY);
    // Silent disconnect - no console output (production-safe)
  }

  getProvider() {
    return this.provider;
  }

  getSigner() {
    return this.signer;
  }

  getAddress() {
    return this.address;
  }

  getWalletName() {
    return this.walletName;
  }

  isWalletConnected() {
    return this.isConnected;
  }
}

export const simpleWalletService = new SimpleWalletService();

