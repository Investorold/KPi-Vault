import { simpleWalletService } from './simpleWalletService';

type FhevmModule = {
  initSDK: () => Promise<void | boolean>;
  createInstance: (config: any) => Promise<any>;
};

declare global {
  interface Window {
    fhevm?: FhevmModule;
    ethereum?: any;
    web3?: any;
  }
}

class FhevmService {
  private instance: any = null;
  private isInitialized = false;
  private readonly STORAGE_VERSION_KEY = 'fhevm_storage_version';
  private readonly CURRENT_STORAGE_VERSION = '0.91'; // Update this when SDK changes handle format

  /**
   * Clear all FHEVM-related storage (handles, keys, etc.)
   * This fixes "Incorrect Handle" errors after SDK updates
   */
  clearStaleHandles(): void {
    if (typeof window === 'undefined') return;

    try {
      // Clear localStorage keys that might contain FHEVM data
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.includes('fhevm') ||
          key.includes('relayer') ||
          key.includes('handle') ||
          key.includes('encryption') ||
          key.startsWith('zama_') ||
          key.includes('acl') ||
          key.includes('kms')
        )) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => {
        console.log('[FHEVM] Clearing stale storage key:', key);
        localStorage.removeItem(key);
      });

      // Clear IndexedDB databases (FHEVM SDK uses IndexedDB for handle storage)
      if ('indexedDB' in window) {
        // Try to delete known FHEVM IndexedDB databases
        const dbNames = ['fhevm', 'relayer', 'zama', 'acl', 'kms'];
        dbNames.forEach(dbName => {
          try {
            const deleteReq = indexedDB.deleteDatabase(dbName);
            deleteReq.onsuccess = () => {
              console.log(`[FHEVM] Deleted IndexedDB: ${dbName}`);
            };
            deleteReq.onerror = () => {
              // Ignore errors if DB doesn't exist
            };
          } catch (error) {
            // Ignore errors if DB doesn't exist
          }
        });
      }

      console.log('[FHEVM] ✅ Cleared stale handles and storage');
    } catch (error) {
      console.warn('[FHEVM] Error clearing storage:', error);
    }
  }

  /**
   * Check if storage needs to be cleared (based on SDK version)
   */
  private checkStorageVersion(): void {
    if (typeof window === 'undefined') return;

    try {
      const storedVersion = localStorage.getItem(this.STORAGE_VERSION_KEY);
      if (storedVersion !== this.CURRENT_STORAGE_VERSION) {
        console.log(`[FHEVM] Storage version mismatch: ${storedVersion} → ${this.CURRENT_STORAGE_VERSION}`);
        this.clearStaleHandles();
        localStorage.setItem(this.STORAGE_VERSION_KEY, this.CURRENT_STORAGE_VERSION);
      }
    } catch (error) {
      console.warn('[FHEVM] Error checking storage version:', error);
    }
  }

  /**
   * Reset the FHEVM instance to force reinitialization
   * Use this when contract address changes or network switches
   */
  reset(): void {
    this.instance = null;
    this.isInitialized = false;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      if (typeof window === 'undefined') {
        throw new Error('FHEVM SDK can only be initialised in a browser environment.');
      }

      // Clear stale handles BEFORE initialization (fixes "Incorrect Handle" after SDK updates)
      this.checkStorageVersion();

      if (typeof window !== 'undefined' && !window.crossOriginIsolated) {
        throw new Error(
          'Browser session is not cross-origin isolated. Start the frontend with `npm run dev` or serve the build with COOP/COEP headers.'
        );
      }

      let selectedProvider = simpleWalletService.selectProvider();

      if (!selectedProvider) {
        if ((window as any).ethereum?.providers && (window as any).ethereum.providers.length > 1) {
          const metaMaskProvider = (window as any).ethereum.providers.find((p: any) => p.isMetaMask);
          selectedProvider = metaMaskProvider || (window as any).ethereum.providers[0];
        } else if (window.ethereum) {
          selectedProvider = window.ethereum;
        }
      }

      if (!selectedProvider) {
        selectedProvider = window.ethereum || (window as any).web3?.currentProvider;
      }

      if (!selectedProvider) {
        throw new Error('No Ethereum provider detected. Please install MetaMask or a compatible wallet.');
      }

      const sdkModule = await this.loadFhevmModule();
      const { initSDK, createInstance } = sdkModule;

      if (!initSDK || typeof initSDK !== 'function') {
        throw new Error('initSDK is not available from FHEVM SDK.');
      }

      await initSDK();

      // Use config matching Contract Addresses page (most recent)
      const config = {
        chainId: 11155111,
        gatewayChainId: 10901, // Contract Addresses page says: "GATEWAY_CHAIN_ID: 10901"
        relayerUrl: 'https://relayer.testnet.zama.org', // Contract Addresses page says: "RELAYER_URL: https://relayer.testnet.zama.org"
        // Official Zama FHEVM Sepolia addresses (updated Nov 2025)
        aclContractAddress: '0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D', // ACL_CONTRACT
        inputVerifierContractAddress: '0xBBC1fFCdc7C316aAAd72E807D9b0272BE8F84DA0', // INPUT_VERIFIER_CONTRACT
        kmsContractAddress: '0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A', // KMS_VERIFIER_CONTRACT
        verifyingContractAddressDecryption: '0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478', // DECRYPTION_ADDRESS
        verifyingContractAddressInputVerification: '0x483b9dE06E4E4C7D35CCf5837A1668487406D955', // INPUT_VERIFICATION_ADDRESS
        network: selectedProvider,
        timeout: 60000,
        retries: 5,
        enableLogging: true,
        enableMetrics: true
      };

      if (selectedProvider && selectedProvider.chainId) {
        const chainId = parseInt(selectedProvider.chainId);
        if (chainId !== 11155111) {
          throw new Error(`Please switch to Sepolia testnet (Chain ID 11155111). Current: ${chainId}`);
        }
      }

      let lastError: Error | null = null;
      const maxRetries = 3;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          this.instance = await createInstance(config);
          break;
        } catch (error) {
          lastError = error as Error;
          if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      if (!this.instance) {
        const fallbackConfig = {
          chainId: 11155111,
          gatewayChainId: 10901, // Contract Addresses page says: "GATEWAY_CHAIN_ID: 10901"
          relayerUrl: 'https://relayer.testnet.zama.org',
          network: selectedProvider
        };

        try {
          this.instance = await createInstance(fallbackConfig);
        } catch (fallbackError) {
          throw new Error(`FHEVM initialization failed: ${lastError?.message || fallbackError}`);
        }
      }

      this.isInitialized = true;
    } catch (error: any) {
      const rawMessage = error?.message || String(error);
      let hint = '';

      if (rawMessage.includes('magic word') || rawMessage.includes('Incorrect response MIME type')) {
        hint = 'Ensure your static host serves `.wasm` files with the `application/wasm` MIME type.';
      } else if (rawMessage.includes('cross-origin')) {
        hint = 'Confirm COOP/COEP headers are present; the Vite config adds them for dev/preview.';
      }

      throw new Error(`Failed to initialize FHEVM SDK: ${rawMessage}${hint ? ` (${hint})` : ''}`);
    }
  }

  getInstance(): any {
    if (!this.instance) {
      throw new Error('FHEVM instance not initialized');
    }
    return this.instance;
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  private async loadFhevmModule(): Promise<FhevmModule> {
    if (window.fhevm && typeof window.fhevm.initSDK === 'function') {
      return window.fhevm;
    }

    // PRIORITIZE REMOTE SDK (always latest v0.3.0+ compatible version)
    // Skip old local bundle which is v0.2.0
    try {
      const remoteUrl = 'https://relayer.testnet.zama.org/sdk/relayer-sdk-js.js';
      console.log('[FHEVM] Loading SDK from remote (v0.3.0+ compatible):', remoteUrl);
      // @ts-ignore - remote bundle has no types
      const remoteModule = await import(/* @vite-ignore */ remoteUrl);
      if (remoteModule && typeof remoteModule.initSDK === 'function') {
        window.fhevm = remoteModule;
        console.log('[FHEVM] ✅ Successfully loaded remote SDK bundle');
        return remoteModule;
      }
    } catch (error) {
      console.warn('[FHEVM] Failed to load remote FHEVM SDK bundle:', error);
    }

    // Fallback to local bundle only if remote fails
    try {
      const localUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/relayer-sdk/relayer-sdk-js.js`
        : '/relayer-sdk/relayer-sdk-js.js';
      console.warn('[FHEVM] Falling back to local bundle (may be old version):', localUrl);
      // @ts-ignore - local bundle has no types
      const localModule = await import(/* @vite-ignore */ localUrl);
      if (localModule && typeof localModule.initSDK === 'function') {
        window.fhevm = localModule;
        return localModule;
      }
    } catch (error) {
      console.warn('[FHEVM] Failed to load local FHEVM SDK bundle:', error);
    }

    throw new Error('Could not load FHEVM SDK module. Ensure the relayer bundle is available.');
  }
}

export const fhevmService = new FhevmService();



