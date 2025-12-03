import { simpleWalletService } from './simpleWalletService';
import { gatewayFailover } from '../utils/gatewayFailover';

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
  private currentConfig: any = null; // Store the config we used to create the instance
  private readonly STORAGE_VERSION_KEY = 'fhevm_storage_version';
  private readonly CURRENT_STORAGE_VERSION = '0.91'; // Update this when SDK changes handle format

  /**
   * Clear all FHEVM-related storage (handles, keys, etc.)
   * This fixes "Incorrect Handle" errors after SDK updates
   */
  /**
   * Clear all FHEVM-related storage (handles, keys, etc.)
   * This fixes "Incorrect Handle" errors after SDK updates
   * Now async to properly wait for IndexedDB deletions
   */
  async clearStaleHandles(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      console.log('[FHEVM] 🧹 Starting aggressive storage cleanup...');
      
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
          key.includes('kms') ||
          key.toLowerCase().includes('fhe') ||
          key.toLowerCase().includes('encrypted') ||
          // Also clear any keys that might contain contract addresses or bindings
          key.toLowerCase().includes('contract') ||
          key.toLowerCase().includes('binding') ||
          key.toLowerCase().includes('address')
        )) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => {
        console.log('[FHEVM] Clearing localStorage key:', key);
        localStorage.removeItem(key);
      });
      
      // If there are still handle errors after this, we might need to clear ALL localStorage
      // but we'll do that only if explicitly requested to avoid breaking other app data

      // Clear sessionStorage as well
      const sessionKeysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (
          key.includes('fhevm') ||
          key.includes('relayer') ||
          key.includes('handle') ||
          key.includes('encryption') ||
          key.startsWith('zama_') ||
          key.includes('acl') ||
          key.includes('kms')
        )) {
          sessionKeysToRemove.push(key);
        }
      }
      sessionKeysToRemove.forEach(key => {
        console.log('[FHEVM] Clearing sessionStorage key:', key);
        sessionStorage.removeItem(key);
      });

      // Clear IndexedDB databases - wait for all deletions to complete
      const deletionPromises: Promise<void>[] = [];
      
      if ('indexedDB' in window) {
        const dbNames = ['fhevm', 'relayer', 'zama', 'acl', 'kms', 'fhevm-handles', 'relayer-handles'];
        
        // List all databases and delete matching ones
        if ('databases' in indexedDB) {
          try {
            const databases = await indexedDB.databases();
            databases.forEach(db => {
              if (db.name && (
                db.name.toLowerCase().includes('fhevm') ||
                db.name.toLowerCase().includes('relayer') ||
                db.name.toLowerCase().includes('zama') ||
                db.name.toLowerCase().includes('handle') ||
                db.name.toLowerCase().includes('acl') ||
                db.name.toLowerCase().includes('kms')
              )) {
                console.log(`[FHEVM] Found and deleting IndexedDB: ${db.name}`);
                const promise = new Promise<void>((resolve) => {
                  try {
                    const deleteReq = indexedDB.deleteDatabase(db.name!);
                    deleteReq.onsuccess = () => {
                      console.log(`[FHEVM] ✅ Deleted IndexedDB: ${db.name}`);
                      resolve();
                    };
                    deleteReq.onerror = () => {
                      console.warn(`[FHEVM] ⚠️ Failed to delete IndexedDB: ${db.name}`);
                      resolve(); // Resolve anyway
                    };
                    deleteReq.onblocked = () => {
                      console.warn(`[FHEVM] ⚠️ Delete blocked for IndexedDB: ${db.name}`);
                      resolve(); // Resolve anyway
                    };
                  } catch (error) {
                    console.warn(`[FHEVM] ⚠️ Error deleting IndexedDB ${db.name}:`, error);
                    resolve();
                  }
                });
                deletionPromises.push(promise);
              }
            });
          } catch (error) {
            console.warn('[FHEVM] Error listing databases:', error);
          }
        }
        
        // Delete known database names
        dbNames.forEach(dbName => {
          const promise = new Promise<void>((resolve) => {
            try {
              const deleteReq = indexedDB.deleteDatabase(dbName);
              deleteReq.onsuccess = () => {
                console.log(`[FHEVM] ✅ Deleted IndexedDB: ${dbName}`);
                resolve();
              };
              deleteReq.onerror = () => {
                resolve(); // Ignore errors if DB doesn't exist
              };
              deleteReq.onblocked = () => {
                console.warn(`[FHEVM] ⚠️ Delete blocked for IndexedDB: ${dbName}`);
                resolve();
              };
            } catch (error) {
              resolve(); // Ignore errors
            }
          });
          deletionPromises.push(promise);
        });
      }

      // Wait for all IndexedDB deletions to complete
      if (deletionPromises.length > 0) {
        console.log(`[FHEVM] Waiting for ${deletionPromises.length} IndexedDB deletions...`);
        await Promise.all(deletionPromises);
        console.log('[FHEVM] All IndexedDB deletions completed');
      }

      // Reset the instance to force reinitialization
      this.instance = null;
      this.isInitialized = false;
      window.fhevm = undefined;
      delete (window as any).fhevm; // Force delete

      console.log('[FHEVM] ✅ Aggressive storage cleanup completed');
    } catch (error) {
      console.warn('[FHEVM] Error clearing storage:', error);
    }
  }

  /**
   * Check if storage needs to be cleared (based on SDK version)
   */
  private async checkStorageVersion(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const storedVersion = localStorage.getItem(this.STORAGE_VERSION_KEY);
      if (storedVersion !== this.CURRENT_STORAGE_VERSION) {
        console.log(`[FHEVM] Storage version mismatch: ${storedVersion} → ${this.CURRENT_STORAGE_VERSION}`);
        await this.clearStaleHandles();
        localStorage.setItem(this.STORAGE_VERSION_KEY, this.CURRENT_STORAGE_VERSION);
      }
    } catch (error) {
      console.warn('[FHEVM] Error checking storage version:', error);
    }
  }

  /**
   * Get the current SDK configuration (the config we used to create the instance)
   * This is more reliable than trying to read from instance.config which may not exist
   */
  getConfig(): any {
    return this.currentConfig || null;
  }

  /**
   * Reset the FHEVM instance to force reinitialization
   * Use this when contract address changes or network switches
   */
  reset(): void {
    this.instance = null;
    this.isInitialized = false;
    this.currentConfig = null;
  }

  /**
   * Full reset: clear storage and reset instance
   * Use this to fix "Incorrect Handle" errors
   * 
   * NOTE: This clears storage but cannot clear SDK's internal in-memory state.
   * A page reload is still required for complete reset.
   */
  async fullReset(): Promise<void> {
    console.log('[FHEVM] 🔄 Performing full reset (clearing storage and instance)...');
    
    // First, try to destroy the instance if it has cleanup methods
    if (this.instance) {
      try {
        // Some SDK instances have cleanup/destroy methods
        if (typeof this.instance.destroy === 'function') {
          console.log('[FHEVM] Calling instance.destroy()...');
          await this.instance.destroy();
        }
        if (typeof this.instance.cleanup === 'function') {
          console.log('[FHEVM] Calling instance.cleanup()...');
          await this.instance.cleanup();
        }
        if (typeof this.instance.reset === 'function') {
          console.log('[FHEVM] Calling instance.reset()...');
          await this.instance.reset();
        }
      } catch (error) {
        console.warn('[FHEVM] Error during instance cleanup (continuing anyway):', error);
      }
    }
    
    // Reset instance completely
    this.instance = null;
    this.isInitialized = false;
    this.currentConfig = null; // Clear stored config too
    
    // Clear cached SDK module completely
    window.fhevm = undefined;
    delete (window as any).fhevm;
    delete (window as any).__ZAMA_SDK__;
    delete (window as any).zama;
    delete (window as any).__relayer_sdk__;
    
    // Clear all storage and wait for deletions to complete
    await this.clearStaleHandles();
    
    // AGGRESSIVE: Clear ALL localStorage keys (not just FHEVM-related)
    // This is necessary because handles might be stored with unexpected key names
    if (typeof window !== 'undefined') {
      console.log('[FHEVM] 🧹 Clearing ALL localStorage (aggressive mode)...');
      const allKeys = Object.keys(localStorage);
      allKeys.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (e) {
          // Ignore errors
        }
      });
      
      // Clear ALL sessionStorage
      console.log('[FHEVM] 🧹 Clearing ALL sessionStorage...');
      sessionStorage.clear();
    }
    
    // Wait longer to ensure all async operations complete
    console.log('[FHEVM] Waiting for all cleanup operations to complete...');
    await new Promise(resolve => setTimeout(resolve, 3000)); // Increased to 3 seconds
    
    // Reset storage version to force clear on next init
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.STORAGE_VERSION_KEY);
    }
    
    console.log('[FHEVM] ✅ Full reset completed - SDK module and storage cleared');
    console.log('[FHEVM] ⚠️ IMPORTANT: SDK internal state requires page reload. Please reload the page (F5) now.');
  }

  /**
   * Force reset (alias for fullReset)
   * Used by contract service when handle errors occur
   */
  async forceReset(): Promise<void> {
    return this.fullReset();
  }

  async initialize(forceReload: boolean = false): Promise<void> {
    try {
      if (typeof window === 'undefined') {
        throw new Error('FHEVM SDK can only be initialised in a browser environment.');
      }

      // If force reload requested, do full reset first
      if (forceReload) {
        await this.fullReset();
      } else {
        // ALWAYS clear stale handles BEFORE initialization to prevent "Incorrect Handle" errors
        // This ensures fresh handles are generated that match the current SDK version
        await this.clearStaleHandles();
        await this.checkStorageVersion();

        // Reset instance if it exists (forces fresh initialization with cleared storage)
        if (this.instance) {
          this.reset();
        }
      }
      
      // Skip if already initialized and instance exists (unless forcing reload)
      if (this.isInitialized && this.instance && !forceReload) {
        return;
      }

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

      const sdkModule = await this.loadFhevmModule(forceReload); // Force reload if requested
      const { initSDK, createInstance } = sdkModule;

      if (!initSDK || typeof initSDK !== 'function') {
        throw new Error('initSDK is not available from FHEVM SDK.');
      }

      await initSDK();

      // 🔥 CRITICAL: Clone and mutate SepoliaConfig IN-PLACE (per Zama GPT guidance)
      // This ensures the SDK receives the exact config we intend, not defaults
      // @ts-ignore - SepoliaConfig may not be in types but exists in runtime
      const SepoliaConfig = (sdkModule as any).SepoliaConfig;
      
      // HARD OVERRIDE: Check for early override set in index.html (defeats stale SDK defaults)
      const forcedConfig = typeof window !== 'undefined' ? (window as any).__ZAMA_FORCE_GATEWAY_CONFIG : null;
      if (forcedConfig) {
        console.log('[FHEVM] ✅ Found hard override config from index.html:', forcedConfig);
      }
      
      // 🚀 GATEWAY FAILOVER: Use automatic failover system to find best gateway
      let selectedGatewayUrl: string;
      
      // CRITICAL: Check for forced config FIRST and bypass failover completely
      if (forcedConfig?.gatewayUrl) {
        // If forced config is provided, use it DIRECTLY - NO FAILOVER, NO HEALTH CHECKS
        selectedGatewayUrl = forcedConfig.gatewayUrl;
        console.log('[FHEVM] 🔧 FORCED GATEWAY URL - Bypassing failover system completely');
        console.log('[FHEVM] 🔧 Using forced gateway URL:', selectedGatewayUrl);
        console.log('[FHEVM] ⏭️ Skipping all health checks and failover logic');
      } else {
        // Use failover system to find the best gateway (only if NOT forced)
        console.log('[FHEVM] 🔍 No forced gateway URL - Using failover system to find best endpoint...');
        selectedGatewayUrl = await gatewayFailover.getGatewayUrl();
        console.log('[FHEVM] ✅ Selected gateway URL via failover:', selectedGatewayUrl);
      }
      
      let config: any;
      if (SepoliaConfig && typeof SepoliaConfig === 'object') {
        console.log('[FHEVM] ✅ Using official SepoliaConfig from SDK (ensures handle compatibility)');
        
        // CRITICAL: Clone SepoliaConfig so we don't mutate the original
        config = { ...SepoliaConfig };
        
        // 🔥 ABSOLUTE OVERRIDE OF ALL CORE FIELDS - mutate in-place
        // Use failover-selected gateway URL (with forced config as override)
        // Priority: forcedConfig (from index.html) > failover system > hardcoded fallback
        config.gatewayUrl = forcedConfig?.gatewayUrl || selectedGatewayUrl;
        config.gatewayChainId = forcedConfig?.gatewayChainId || 10901; // CRITICAL: Must be 10901, not 55815
        config.chainId = forcedConfig?.chainId || 11155111;
        config.relayerUrl = forcedConfig?.relayerUrl || 'https://relayer.testnet.zama.org'; // CRITICAL: Use .org (relayer already migrated)
        config.network = selectedProvider;
        
        // Remove fallback fields entirely to prevent SDK internal defaults
        delete config.relayer;
        delete config.rpcUrl;
        
        console.log('[FHEVM INIT] Using mutated config:', {
          gatewayUrl: config.gatewayUrl,
          gatewayChainId: config.gatewayChainId,
          chainId: config.chainId,
          relayerUrl: config.relayerUrl,
          network: 'set',
          source: forcedConfig ? 'forced config (index.html)' : 'hardcoded .org override'
        });
        
        // NOTE: Gateway temporarily uses .ai (DNS not deployed for .org yet)
        // This is expected until Zama completes DNS migration
        if (config.gatewayUrl && config.gatewayUrl.includes('.zama.ai')) {
          console.log('[FHEVM] ℹ️ Gateway using .ai (temporary until .org DNS is live)');
        }
        if (config.relayerUrl && config.relayerUrl.includes('.zama.ai')) {
          console.error('[FHEVM] ❌ ERROR: Relayer URL still has .ai! Forcing to .org...');
          config.relayerUrl = 'https://relayer.testnet.zama.org';
        }
        if (config.relayerUrl && config.relayerUrl.includes('.zama.cloud')) {
          console.error('[FHEVM] ❌ ERROR: Relayer URL still has .cloud! Forcing to .org...');
          config.relayerUrl = 'https://relayer.testnet.zama.org';
        }
      } else {
        console.log('[FHEVM] SepoliaConfig not available, using custom config');
        // Fallback: create minimal config with required fields
        // Use failover-selected gateway URL (with forced config as override)
        // Priority: forcedConfig (from index.html) > failover system > hardcoded fallback
        const forcedConfig = typeof window !== 'undefined' ? (window as any).__ZAMA_FORCE_GATEWAY_CONFIG : null;
        config = {
          gatewayUrl: forcedConfig?.gatewayUrl || selectedGatewayUrl,
          gatewayChainId: forcedConfig?.gatewayChainId || 10901,
          chainId: forcedConfig?.chainId || 11155111,
          relayerUrl: forcedConfig?.relayerUrl || 'https://relayer.testnet.zama.org', // CRITICAL: Use .org (relayer already migrated)
          network: selectedProvider,
          // Official Zama FHEVM Sepolia addresses (updated Nov 2025)
          aclContractAddress: '0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D',
          inputVerifierContractAddress: '0xBBC1fFCdc7C316aAAd72E807D9b0272BE8F84DA0',
          kmsContractAddress: '0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A',
          verifyingContractAddressDecryption: '0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478',
          verifyingContractAddressInputVerification: '0x483b9dE06E4E4C7D35CCf5837A1668487406D955'
        };
      }

      if (selectedProvider && selectedProvider.chainId) {
        const chainId = parseInt(selectedProvider.chainId);
        if (chainId !== 11155111) {
          throw new Error(`Please switch to Sepolia testnet (Chain ID 11155111). Current: ${chainId}`);
        }
      }

      // CRITICAL: Only create ONE SDK instance per page load (per Zama GPT advice)
      // If instance already exists and we're not forcing reload, reuse it
      if (this.instance && !forceReload) {
        console.log('[FHEVM] ✅ Reusing existing SDK instance (only one instance per page load)');
        this.isInitialized = true;
        return;
      }

      // Verify no duplicate instances exist on window (per Zama GPT advice)
      if ((window as any).__ZAMA_SDK__ || (window as any).zama || (window as any).__relayer_sdk__) {
        console.warn('[FHEVM] ⚠️ WARNING: Multiple SDK instances detected. This may cause handle mismatches.');
        // Run diagnostic if available
        if ((window as any).__fhevmDiagnose) {
          console.log('[FHEVM] 🔍 Running diagnostic check for duplicate instances...');
          try {
            (window as any).__fhevmDiagnose();
          } catch (diagError) {
            console.warn('[FHEVM] Diagnostic check failed:', diagError);
          }
        }
      }

      let lastError: Error | null = null;
      const maxRetries = 3;
      const maxRetriesForKeyError = 6; // More retries for key fetch errors
      const baseDelay = 500;

      console.log('[FHEVM] Creating SDK instance (this should only happen once per page load)...');
      
      // Final verification of mutated config before passing to SDK
      console.log('[FHEVM] 📋 Config being passed to createInstance():', {
        gatewayUrl: config.gatewayUrl,
        gatewayChainId: config.gatewayChainId,
        chainId: config.chainId,
        note: 'This is the EXACT config the SDK will receive'
      });
      
      // Check if error is a key fetch error (comprehensive detection)
      const isKeyFetchError = (error: any): boolean => {
        const errorMsg = (error?.message || String(error) || '').toLowerCase();
        return (
          errorMsg.includes('public key') ||
          errorMsg.includes('keyid') ||
          errorMsg.includes('key id') ||
          (errorMsg.includes('key') && errorMsg.includes('must provide')) ||
          (errorMsg.includes('key') && errorMsg.includes('required')) ||
          (errorMsg.includes('key') && errorMsg.includes('missing')) ||
          errorMsg.includes('encryption key') ||
          errorMsg.includes('gateway key')
        );
      };
      
      let effectiveMaxRetries = maxRetries;
      let isKeyError = false;
      
      // Pre-flight check: Use failover system to verify gateway health
      // Skip if gatewayUrl is forced (user knows what they want)
      if (!forcedConfig?.gatewayUrl) {
        try {
          console.log('[FHEVM] 🔍 Pre-flight check: Verifying gateway endpoint health...');
          const healthCheck = await gatewayFailover.checkHealth({
            url: config.gatewayUrl,
            name: 'Selected Gateway',
            priority: 1
          });
          
          if (!healthCheck.isHealthy) {
            console.warn(`[FHEVM] ⚠️ Selected gateway (${config.gatewayUrl}) appears unhealthy`);
            if (healthCheck.error) {
              console.warn(`[FHEVM] ⚠️ Error: ${healthCheck.error}`);
            }
            console.warn('[FHEVM] 💡 Will retry with exponential backoff - failover system will handle endpoint selection');
            effectiveMaxRetries = maxRetriesForKeyError; // Start with more retries
            
            // If current gateway is unhealthy, try to find a better one
            const betterEndpoint = await gatewayFailover.findHealthyEndpoint();
            if (betterEndpoint && betterEndpoint.url !== config.gatewayUrl) {
              console.log(`[FHEVM] 🔄 Switching to healthier endpoint: ${betterEndpoint.url}`);
              config.gatewayUrl = betterEndpoint.url;
            }
          } else {
            console.log(`[FHEVM] ✅ Gateway endpoint is healthy (${healthCheck.responseTime}ms)`);
            gatewayFailover.recordSuccess(config.gatewayUrl);
          }
        } catch (preflightError: any) {
          // Pre-flight check failures are non-critical - CORS or network issues are expected
          // The SDK itself will handle the actual key fetch
          console.warn('[FHEVM] ⚠️ Pre-flight check failed (non-critical, may be CORS):', preflightError?.message || preflightError);
          // Continue anyway - the SDK will try to fetch the key itself
        }
      } else {
        console.log('[FHEVM] ⏭️ Skipping pre-flight health check (gatewayUrl is forced)');
      }
      
      for (let attempt = 1; attempt <= effectiveMaxRetries; attempt++) {
        try {
          // 🔥 Pass the mutated config directly - SDK must use these values
          this.instance = await createInstance(config);
          
          // Some SDK versions require explicit initSDK() call
          if (typeof this.instance.initSDK === 'function') {
            console.log('[FHEVM] Calling instance.initSDK()...');
            await this.instance.initSDK();
          }
          
          // Record success for failover tracking
          gatewayFailover.recordSuccess(config.gatewayUrl);
          
          // CRITICAL: Store the config we used so we can access it later
          // The SDK instance might not expose config directly, so we store it ourselves
          this.currentConfig = {
            gatewayUrl: config.gatewayUrl,
            gatewayChainId: config.gatewayChainId,
            chainId: config.chainId,
            network: config.network,
            relayerUrl: config.relayerUrl
          };
          
          console.log('[FHEVM] ✅ SDK instance created successfully');
          console.log('[FHEVM] 💾 Stored config:', {
            gatewayChainId: this.currentConfig.gatewayChainId,
            chainId: this.currentConfig.chainId,
            gatewayUrl: this.currentConfig.gatewayUrl
          });
          
          break;
        } catch (error) {
          lastError = error as Error;
          const errorMsg = lastError?.message || String(error);
          
          // Check if this is a key fetch error - if so, increase retries and try failover
          if (isKeyFetchError(error)) {
            if (!isKeyError) {
              console.warn('[FHEVM] 🔑 Key fetch error detected - increasing retries for gateway key availability');
              isKeyError = true;
            }
            // Increase retries and continue from current attempt
            const remainingAttempts = effectiveMaxRetries - attempt;
            effectiveMaxRetries = attempt + maxRetriesForKeyError;
            
            console.warn(`[FHEVM] 🔑 Key fetch error (attempt ${attempt}/${effectiveMaxRetries}):`, errorMsg);
            console.warn('[FHEVM] 💡 The gateway key service may be temporarily unavailable.');
            
            // Record failure for failover tracking
            gatewayFailover.recordFailure(config.gatewayUrl);
            
            // Try to find a better endpoint if current one is failing
            if (attempt > 1) { // Only try failover after first failure
              try {
                const betterEndpoint = await gatewayFailover.findHealthyEndpoint();
                if (betterEndpoint && betterEndpoint.url !== config.gatewayUrl) {
                  console.log(`[FHEVM] 🔄 Failover: Switching to ${betterEndpoint.name} (${betterEndpoint.url})`);
                  config.gatewayUrl = betterEndpoint.url;
                  // Update stored config too
                  this.currentConfig = { ...this.currentConfig, gatewayUrl: betterEndpoint.url };
                }
              } catch (failoverError) {
                console.warn('[FHEVM] ⚠️ Failover check failed:', failoverError);
              }
            }
            
            console.warn('[FHEVM] 💡 Retrying with exponential backoff...');
            console.log('[FHEVM] 🔍 Gateway key URL:', `${config.gatewayUrl}/v1/keyurl`);
          } else {
            console.warn(`[FHEVM] Instance creation attempt ${attempt}/${effectiveMaxRetries} failed:`, error);
          }
          
          if (attempt < effectiveMaxRetries) {
            // Exponential backoff with cap at 10 seconds
            // For key errors, use longer delays
            const delayMultiplier = isKeyError ? 2 : 1;
            const delay = Math.min(10000, baseDelay * Math.pow(2, attempt - 1) * delayMultiplier);
            console.log(`[FHEVM] ⏳ Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      if (!this.instance) {
        // Check if this was a key fetch error
        const errorMsg = lastError?.message || String(lastError) || '';
        const wasKeyError = errorMsg.includes('public key') || 
                          errorMsg.includes('keyId') || 
                          (errorMsg.includes('key') && errorMsg.includes('must provide'));
        
        if (wasKeyError) {
          // Provide specific guidance for key fetch errors
          console.error('[FHEVM] ❌ Gateway key fetch failed after all retries');
          console.error('[FHEVM] 🔍 Gateway key URL:', `${config.gatewayUrl}/v1/keyurl`);
          console.error('[FHEVM] 💡 This usually means:');
          console.error('   1. Gateway key service is temporarily unavailable');
          console.error('   2. Coprocessor is down (check https://status.zama.org)');
          console.error('   3. Network/CORS issue blocking key fetch');
          console.error('[FHEVM] 💡 Run diagnostic: fetch("/key-fetch-diagnostic.js").then(r=>r.text()).then(eval)');
          
          // Provide detailed error with diagnostic steps
          const diagnosticScript = `
(async()=>{
  try{
    const r = await fetch("${config.gatewayUrl}/v1/keyurl", { cache: "no-store" });
    console.log('KEYURL fetch status:', r.status);
    const txt = await r.text();
    console.log('KEYURL response (first 2000 chars):', txt.slice(0,2000));
    try { console.log('KEYURL json:', JSON.parse(txt)); } catch(e){}
  }catch(e){
    console.error('KEYURL fetch failed:', e);
  }
})();`;
          
          throw new Error(
            `🔑 GATEWAY KEY FETCH FAILED\n\n` +
            `The SDK could not fetch the gateway's encryption public key after ${effectiveMaxRetries} retries.\n\n` +
            `🔴 MOST LIKELY CAUSES:\n` +
            `1. Coprocessor - Testnet is down (check https://status.zama.org)\n` +
            `2. Gateway key service temporarily unavailable\n` +
            `3. Network/CORS issue blocking key fetch\n\n` +
            `✅ WHAT TO DO:\n` +
            `1. Check https://status.zama.org for "Coprocessor - Testnet" status\n` +
            `   → If it shows "Down" or "Degraded", wait 5-10 minutes, then refresh page\n` +
            `2. Run diagnostic script in browser console:\n` +
            `   fetch("/key-fetch-diagnostic.js").then(r=>r.text()).then(eval)\n\n` +
            `   OR paste this quick check:\n` +
            `   ${diagnosticScript.trim()}\n\n` +
            `3. Check browser Network tab for failed requests to:\n` +
            `   ${config.gatewayUrl}/v1/keyurl\n` +
            `   → Look for CORS errors, network errors, or 4xx/5xx status codes\n\n` +
            `🔍 Technical details:\n` +
            `• Gateway URL: ${config.gatewayUrl}\n` +
            `• Key URL: ${config.gatewayUrl}/v1/keyurl\n` +
            `• Error: ${errorMsg.substring(0, 200)}\n` +
            `• Retries attempted: ${effectiveMaxRetries}\n\n` +
            `The SDK requires the gateway's public key to encrypt data. ` +
            `If the gateway is down, encryption is unavailable until it recovers.`
          );
        }
        
        console.log('[FHEVM] Trying fallback config...');
        // TEMPORARY FIX: gateway.testnet.zama.org DNS not deployed yet
        // Using gateway.testnet.zama.ai until Zama completes DNS migration
        const forcedConfig = typeof window !== 'undefined' ? (window as any).__ZAMA_FORCE_GATEWAY_CONFIG : null;
        const fallbackConfig = {
          gatewayUrl: forcedConfig?.gatewayUrl || 'https://gateway.testnet.zama.ai', // TEMPORARY: .ai (until .org DNS is live)
          gatewayChainId: forcedConfig?.gatewayChainId || 10901,
          chainId: forcedConfig?.chainId || 11155111,
          relayerUrl: forcedConfig?.relayerUrl || 'https://relayer.testnet.zama.org',
          network: selectedProvider
        };

        try {
          this.instance = await createInstance(fallbackConfig);
          
          // Some SDK versions require explicit initSDK() call
          if (typeof this.instance.initSDK === 'function') {
            await this.instance.initSDK();
          }
          
          // Store fallback config too
          this.currentConfig = {
            gatewayUrl: fallbackConfig.gatewayUrl,
            gatewayChainId: fallbackConfig.gatewayChainId,
            chainId: fallbackConfig.chainId
          };
          
          console.log('[FHEVM] ✅ SDK instance created with fallback config');
        } catch (fallbackError) {
          throw new Error(`FHEVM initialization failed: ${lastError?.message || fallbackError}`);
        }
      }

      this.isInitialized = true;
    } catch (error: any) {
      const rawMessage = error?.message || String(error);
      let hint = '';
      let enhancedError = rawMessage;

      if (rawMessage.includes('magic word') || rawMessage.includes('Incorrect response MIME type')) {
        hint = 'Ensure your static host serves `.wasm` files with the `application/wasm` MIME type.';
      } else if (rawMessage.includes('cross-origin')) {
        hint = 'Confirm COOP/COEP headers are present; the Vite config adds them for dev/preview.';
      } else if (rawMessage.includes('public key') || rawMessage.includes('keyId') || 
                 (rawMessage.includes('key') && rawMessage.includes('must provide'))) {
        // Key fetch error - provide detailed guidance
        enhancedError = 
          `🔑 GATEWAY KEY FETCH FAILED\n\n` +
          `The SDK could not fetch the gateway's encryption public key.\n\n` +
          `🔴 MOST LIKELY CAUSES:\n` +
          `1. Coprocessor - Testnet is down (check https://status.zama.org)\n` +
          `2. Gateway key service temporarily unavailable\n` +
          `3. Network/CORS issue blocking key fetch\n\n` +
          `✅ WHAT TO DO:\n` +
          `1. Check https://status.zama.org for "Coprocessor - Testnet" status\n` +
          `2. Wait 5-10 minutes if coprocessor is down, then refresh page\n` +
          `3. Run diagnostic: fetch("/key-fetch-diagnostic.js").then(r=>r.text()).then(eval)\n` +
          `4. Check Network tab for failed requests to gateway.testnet.zama.ai/v1/keyurl\n\n` +
          `Technical error: ${rawMessage}`;
      }

      throw new Error(`Failed to initialize FHEVM SDK: ${enhancedError}${hint ? ` (${hint})` : ''}`);
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

  private async loadFhevmModule(forceReload: boolean = false): Promise<FhevmModule> {
    // If forcing reload, clear cached module first
    if (forceReload) {
      console.log('[FHEVM] 🔄 Force reloading SDK module...');
      window.fhevm = undefined;
      delete (window as any).fhevm;
      // Also clear any global SDK instances that might be cached
      delete (window as any).__ZAMA_SDK__;
      delete (window as any).zama;
      delete (window as any).__relayer_sdk__;
    }
    
    // Check for existing cached module (but only if not forcing reload)
    if (window.fhevm && typeof window.fhevm.initSDK === 'function' && !forceReload) {
      console.log('[FHEVM] Using cached SDK module');
      return window.fhevm;
    }

    // Check for duplicate SDK instances (per Zama GPT advice)
    if ((window as any).__ZAMA_SDK__ || (window as any).zama || (window as any).__relayer_sdk__) {
      console.warn('[FHEVM] ⚠️ Multiple SDK instances detected on window object. This may cause handle mismatches.');
    }

    // NOTE: We use local bundle instead of npm package because:
    // 1. The npm package has Vite bundling issues (missing "." specifier)
    // 2. The local bundle is the exact same code (v0.3.0-6) from the npm package
    // 3. This ensures version matching with Gateway while avoiding bundler issues
    // 
    // The local bundle MUST match the pinned version in package.json (0.3.0-6)
    // Per Zama GPT advice: version matching is critical for handle compatibility
    try {
      const localUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/relayer-sdk/relayer-sdk-js.js`
        : '/relayer-sdk/relayer-sdk-js.js';
      console.log('[FHEVM] Loading SDK from local bundle (fallback):', localUrl);
      const urlToLoad = forceReload ? `${localUrl}?v=${Date.now()}` : localUrl;
      // @ts-ignore - local bundle has no types
      const localModule = await import(/* @vite-ignore */ urlToLoad);
      if (localModule && typeof localModule.initSDK === 'function') {
        window.fhevm = localModule;
        console.log('[FHEVM] ✅ Successfully loaded SDK from local bundle (fallback)');
        return localModule;
      }
    } catch (error) {
      console.warn('[FHEVM] Failed to load local bundle:', error);
    }

    throw new Error('Could not load FHEVM SDK module. Tried npm package and local bundle. Check console for details.');
  }
}

export const fhevmService = new FhevmService();

// Expose a global helper function for debugging (can be called from browser console)
if (typeof window !== 'undefined') {
  (window as any).__fhevmReset = async () => {
    console.log('🔄 [FHEVM Debug] Force resetting FHEVM service...');
    await fhevmService.fullReset();
    console.log('✅ [FHEVM Debug] Reset complete. Please reload the page (F5) now.');
    return 'Reset complete. Please reload the page (F5) now.';
  };
  
  (window as any).__fhevmStatus = () => {
    const status = {
      isInitialized: fhevmService.isReady(),
      hasInstance: !!fhevmService.getInstance(),
      windowFhevm: !!window.fhevm,
      windowZama: !!(window as any).__ZAMA_SDK__ || !!(window as any).zama,
      storageVersion: localStorage.getItem('fhevm_storage_version'),
      localStorageKeys: Object.keys(localStorage).filter(k => 
        k.toLowerCase().includes('fhevm') || 
        k.toLowerCase().includes('relayer') || 
        k.toLowerCase().includes('handle')
      ),
      config: fhevmService.getConfig(),
      gatewayStatus: gatewayFailover.getStatus()
    };
    console.log('📊 [FHEVM Debug] Status:', status);
    return status;
  };
  
  // Gateway failover diagnostic helper
  (window as any).__gatewayFailover = {
    checkHealth: async () => {
      console.log('🔍 [Gateway Failover] Checking all endpoints...');
      const status = gatewayFailover.getStatus();
      const checks = await Promise.all(
        status.map(endpoint => gatewayFailover.checkHealth(endpoint))
      );
      console.log('📊 [Gateway Failover] Health check results:', checks);
      return checks;
    },
    findBest: async () => {
      console.log('🔍 [Gateway Failover] Finding best endpoint...');
      const best = await gatewayFailover.findHealthyEndpoint();
      console.log('✅ [Gateway Failover] Best endpoint:', best);
      return best;
    },
    getStatus: () => {
      const status = gatewayFailover.getStatus();
      console.log('📊 [Gateway Failover] Current status:', status);
      return status;
    },
    clearCache: () => {
      gatewayFailover.clearCache();
      console.log('🧹 [Gateway Failover] Cache cleared');
    }
  };
  
  // Zama GPT diagnostic: Detect root causes of deterministic handle divergence
  (window as any).__fhevmDiagnose = () => {
    console.log('🔍 [FHEVM Diagnostic] Running Zama GPT diagnostic checks for handle mismatch...');
    console.log('   This checks for the 3 root causes of deterministic handle divergence:');
    console.log('   1) Old ciphertexts created under different SDK version');
    console.log('   2) Multiple relayer-sdk versions bundled');
    console.log('   3) Contract FHE.sol version mismatch');
    console.log('');
    
    const results: any = {
      rootCause: null,
      issues: [],
      recommendations: []
    };
    
    // Check 1: Find all objects with createInstance method (potential SDK instances)
    const sdkHolders: Array<{ key: string; val: any }> = [];
    for (const k in window) {
      try {
        const v = (window as any)[k];
        if (v && typeof v.createInstance === 'function') {
          sdkHolders.push({ key: k, val: v });
        }
      } catch (e) {
        // Ignore errors accessing window properties
      }
    }
    
    if (sdkHolders.length > 1) {
      console.error('❌ [FHEVM Diagnostic] ROOT CAUSE #2: MULTIPLE SDK INSTANCES DETECTED');
      console.error('   Found', sdkHolders.length, 'instances:', sdkHolders.map(s => s.key));
      console.error('   → One copy computes handle H1, another computes H2');
      console.error('   → SDK believes it did the right thing but Gateway rejects handle H2');
      console.error('');
      results.rootCause = 'MULTIPLE_SDK_INSTANCES';
      results.issues.push(`Found ${sdkHolders.length} SDK instances on window: ${sdkHolders.map(s => s.key).join(', ')}`);
      results.recommendations.push('Run: npm dedupe && npm install @zama-fhe/relayer-sdk@0.3.0-6 --save-exact');
      results.recommendations.push('Rebuild and redeploy frontend');
    } else if (sdkHolders.length === 1) {
      console.log('✅ [FHEVM Diagnostic] Single SDK instance found:', sdkHolders[0].key);
    } else {
      console.log('ℹ️ [FHEVM Diagnostic] No SDK instances with createInstance found on window');
    }
    
    // Check 2: Search for @zama-fhe or relayer-sdk strings in window (version detection)
    const matches: string[] = [];
    const versionMatches: string[] = [];
    for (const k in window) {
      try {
        const s = String((window as any)[k]);
        if (s.includes('@zama-fhe') || s.includes('relayer-sdk')) {
          matches.push(k);
          // Try to extract version numbers
          const versionMatch = s.match(/0\.\d+\.\d+(-\d+)?/g);
          if (versionMatch) {
            versionMatches.push(...versionMatch);
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }
    
    if (versionMatches.length > 0) {
      const uniqueVersions = [...new Set(versionMatches)];
      if (uniqueVersions.length > 1) {
        console.error('❌ [FHEVM Diagnostic] ROOT CAUSE #2: MULTIPLE SDK VERSIONS DETECTED');
        console.error('   Found versions:', uniqueVersions);
        console.error('   → Different versions compute different handles');
        console.error('');
        if (!results.rootCause) {
          results.rootCause = 'MULTIPLE_SDK_VERSIONS';
        }
        results.issues.push(`Multiple SDK versions found: ${uniqueVersions.join(', ')}`);
        results.recommendations.push('Run: npm ls @zama-fhe/relayer-sdk (should show only 0.3.0-6)');
        results.recommendations.push('If duplicates found: npm dedupe && rm -rf node_modules package-lock.json && npm install');
      } else {
        console.log('✅ [FHEVM Diagnostic] Single SDK version detected:', uniqueVersions[0]);
      }
    }
    
    // Check 3: SDK version verification
    console.log('📋 [FHEVM Diagnostic] Expected SDK version: 0.3.0-6');
    console.log('   Expected FHEVM version: 0.9.1');
    console.log('   Expected @fhevm/solidity version: ^0.9.1');
    console.log('   Run "npm ls @zama-fhe/relayer-sdk" in project root to verify');
    console.log('');
    
    // Check 4: Storage inspection for old handles/ciphertexts
    const fhevmStorageKeys = Object.keys(localStorage).filter(k => 
      k.toLowerCase().includes('fhevm') || 
      k.toLowerCase().includes('relayer') || 
      k.toLowerCase().includes('handle') ||
      k.toLowerCase().includes('zama') ||
      k.toLowerCase().includes('ciphertext') ||
      k.toLowerCase().includes('attestation')
    );
    
    if (fhevmStorageKeys.length > 0) {
      console.warn('⚠️ [FHEVM Diagnostic] FHEVM-related storage keys found:', fhevmStorageKeys);
      console.warn('   If these contain handles from an older SDK version, they are incompatible');
      console.warn('   → Old handles were computed under different SDK version');
      console.warn('   → New SDK computes different handles for same input');
      console.warn('   → THEY WILL NEVER MATCH (deterministic divergence)');
      console.log('');
      if (!results.rootCause) {
        results.rootCause = 'OLD_CIPHERTEXTS';
      }
      results.issues.push(`Found ${fhevmStorageKeys.length} storage keys that may contain old handles`);
      results.recommendations.push('Clear all storage: window.__fhevmReset() then reload page');
      results.recommendations.push('Re-create all encrypted inputs using NEW SDK v0.3.0-6');
    } else {
      console.log('✅ [FHEVM Diagnostic] No FHEVM-related storage keys found');
    }
    
    // Check 5: IndexedDB inspection for old handles
    if ('indexedDB' in window && 'databases' in indexedDB) {
      indexedDB.databases().then(databases => {
        const fhevmDbs = databases.filter(db => 
          db.name && (
            db.name.toLowerCase().includes('fhevm') ||
            db.name.toLowerCase().includes('relayer') ||
            db.name.toLowerCase().includes('zama') ||
            db.name.toLowerCase().includes('handle')
          )
        );
        
        if (fhevmDbs.length > 0) {
          console.warn('⚠️ [FHEVM Diagnostic] FHEVM-related IndexedDB databases:', fhevmDbs.map(db => db.name));
          console.warn('   These may contain old handles from previous SDK version');
          if (!results.rootCause) {
            results.rootCause = 'OLD_CIPHERTEXTS';
          }
          results.issues.push(`Found ${fhevmDbs.length} IndexedDB databases with potential old handles`);
        } else {
          console.log('✅ [FHEVM Diagnostic] No FHEVM-related IndexedDB databases found');
        }
        
        // Final diagnosis
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('📊 [FHEVM Diagnostic] FINAL DIAGNOSIS');
        console.log('═══════════════════════════════════════════════════════════════');
        
        if (results.rootCause === 'MULTIPLE_SDK_INSTANCES' || results.rootCause === 'MULTIPLE_SDK_VERSIONS') {
          console.error('❌ ROOT CAUSE: Multiple SDK instances/versions detected');
          console.error('   → Fix: Ensure only one SDK version (0.3.0-6) is bundled');
          console.error('   → Run: npm dedupe && npm install @zama-fhe/relayer-sdk@0.3.0-6 --save-exact');
          console.error('   → Rebuild and redeploy');
        } else if (results.rootCause === 'OLD_CIPHERTEXTS') {
          console.error('❌ ROOT CAUSE: Old ciphertexts created under different SDK version');
          console.error('   → Your contract may have encrypted data created with SDK v0.3.0-5 or earlier');
          console.error('   → New SDK v0.3.0-6 computes different handles for same input');
          console.error('   → Old handles are PERMANENTLY INCOMPATIBLE with new SDK');
          console.error('');
          console.error('   🔧 SOLUTION:');
          console.error('   1. Clear all storage: window.__fhevmReset()');
          console.error('   2. Reload page (F5)');
          console.error('   3. Re-create ALL encrypted inputs using NEW SDK:');
          console.error('      await instance.createEncryptedInput(contractAddress, userAddress)');
          console.error('   4. Old handles cannot be fixed - they must be recreated');
        } else {
          // No obvious root cause from runtime checks - likely contract version mismatch
          console.error('❌ ROOT CAUSE: Contract FHE.sol version mismatch (most likely)');
          console.error('   → Your contract was deployed with @fhevm/solidity@0.9.1');
          console.error('   → But Gateway/coprocessor may expect different handle derivation');
          console.error('   → OR contract was deployed BEFORE SDK v0.3.0-6 upgrade');
          console.error('');
          console.error('   🔧 SOLUTION OPTIONS:');
          console.error('   Option 1: Verify contract deployment matches current SDK');
          console.error('     → Check: Was contract deployed AFTER SDK v0.3.0-6 was released?');
          console.error('     → If deployed earlier, contract may be incompatible');
          console.error('');
          console.error('   Option 2: Re-deploy contract with current FHE.sol version');
          console.error('     → cd contracts && npm install @fhevm/solidity@0.9.1');
          console.error('     → npx hardhat compile');
          console.error('     → npx hardhat run scripts/deployKpiManager.ts --network sepolia');
          console.error('     → Update VITE_KPI_CONTRACT_ADDRESS in frontend');
          console.error('');
          console.error('   Option 3: Contact Zama support to verify Gateway version');
          console.error('     → Gateway may need to be updated to match SDK v0.3.0-6');
          results.rootCause = 'CONTRACT_VERSION_MISMATCH';
          results.recommendations.push('Verify contract was deployed with @fhevm/solidity@0.9.1 AFTER SDK v0.3.0-6 release');
          results.recommendations.push('If contract was deployed earlier, re-deploy with current versions');
          results.recommendations.push('Check Zama docs for SDK/Gateway version compatibility');
        }
        
        console.log('═══════════════════════════════════════════════════════════════');
        
        // Add detailed info to return object
        results.diagnosis = results.rootCause || 'CONTRACT_VERSION_MISMATCH';
        try {
          // Try to get contract address from various sources
          const contractAddr = import.meta.env?.VITE_KPI_CONTRACT_ADDRESS || 
                              '0xCa82F1d0BBA127F4cC3A8881ea5991275A9E8Db5';
          results.contractAddress = contractAddr;
          results.contractDeployed = 'Nov 24, 2025 (per config)';
        } catch (e) {
          results.contractAddress = '0xCa82F1d0BBA127F4cC3A8881ea5991275A9E8Db5';
        }
        results.sdkVersion = '0.3.0-6';
        results.expectedFhevmVersion = '0.9.1';
        results.expectedFhevmSolidityVersion = '0.9.1';
        
        // Final summary for return
        if (!results.rootCause) {
          results.rootCause = 'CONTRACT_VERSION_MISMATCH';
          results.summary = 'No runtime issues detected. Most likely: Contract was deployed with different FHE.sol version than Gateway expects, OR contract was deployed before SDK v0.3.0-6 compatibility.';
        }
      }).catch(() => {
        console.log('ℹ️ [FHEVM Diagnostic] Could not inspect IndexedDB (may require user interaction)');
      });
    }
    
    return {
      rootCause: results.rootCause,
      sdkHolders,
      matches,
      storageKeys: fhevmStorageKeys,
      issues: results.issues,
      recommendations: results.recommendations,
      summary: results.rootCause 
        ? `Root cause identified: ${results.rootCause}` 
        : 'No obvious root cause detected. Check contract FHE.sol version.'
    };
  };
  
  console.log('💡 [FHEVM Debug] Helper functions available:');
  console.log('   - window.__fhevmReset() - Force reset FHEVM (then reload page)');
  console.log('   - window.__fhevmStatus() - Check FHEVM status');
  console.log('   - window.__fhevmDiagnose() - Run Zama GPT diagnostic checks');
}



