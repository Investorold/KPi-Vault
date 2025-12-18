import { ethers } from 'ethers';
import { simpleWalletService } from './simpleWalletService';
import { fhevmService } from './fhevmService';
import { getKpiContractAddress } from '../config/contract';
import { checkCoprocessorStatus, getStatusMessage } from '../utils/coprocessorStatus';
import { secureLogger } from '../utils/secureLogger';

type RawMetric = {
  metricId: bigint | number | string;
  timestamp: bigint | number;
  value: string;
  note: string;
};

export type EncryptedMetricEntry = {
  metricIdHex: string;
  timestamp: number;
  valueHandle: string;
  noteHandle: string;
  index: number;
};

const KPI_MANAGER_ABI = [
  'function recordMetric(uint256 metricId, uint64 timestamp, bytes32 encryptedValue, bytes inputProof) external',
  'function recordMetricWithNote(uint256 metricId, uint64 timestamp, bytes32 encryptedValue, bytes32 encryptedNote, bytes inputProof) external',
  'function getMetrics(address owner, uint256 metricId) external view returns (tuple(uint256 metricId, uint64 timestamp, bytes32 value, bytes32 note)[])',
  'function grantAccess(uint256 metricId, address viewer) external',
  'function revokeAccess(uint256 metricId, address viewer) external',
  'function getAuthorizedViewers(address owner, uint256 metricId) external view returns (address[])',
  'function hasAccess(address owner, uint256 metricId, address viewer) external view returns (bool)',
  'function isAdmin(address account) external view returns (bool)',
  'function addAdmin(address account) external',
  'function removeAdmin(address account) external',
  'event AdminAdded(address indexed account)',
  'event AdminRemoved(address indexed account)'
];

const VALUE_SCALE = 100; // two decimal places

class KpiContractService {
  private contract: ethers.Contract | null = null;
  private contractAddress = '';

  private ensureAddress(address: string) {
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error('KPI contract address is not configured. Set VITE_KPI_CONTRACT_ADDRESS.');
    }
  }

  async initialize(contractAddress?: string): Promise<void> {
    const address = contractAddress || getKpiContractAddress();
    this.ensureAddress(address);

    if (this.contract && this.contractAddress.toLowerCase() === address.toLowerCase()) {
      return;
    }

    if (!simpleWalletService.isWalletConnected()) {
      throw new Error('Connect your wallet before interacting with the KPI contract.');
    }

    const signer = simpleWalletService.getSigner();
    if (!signer) {
      throw new Error('Wallet signer is unavailable.');
    }

    this.contractAddress = address;
    this.contract = new ethers.Contract(address, KPI_MANAGER_ABI, signer);
  }

  private encodeMetricId(metricId: string): bigint {
    if (!metricId) {
      throw new Error('Metric ID is required.');
    }
    const encoded = ethers.toBigInt(ethers.id(metricId));
    secureLogger.debug('[KPI Contract] Encoding metric ID:', { 
      original: metricId, 
      encoded: encoded.toString(),
      hex: ethers.toBeHex(encoded)
    });
    return encoded;
  }

  private formatMetricId(metricId: bigint | number | string): string {
    if (typeof metricId === 'string') {
      return metricId.startsWith('0x') ? metricId : ethers.toBeHex(BigInt(metricId));
    }
    if (typeof metricId === 'bigint') {
      return ethers.toBeHex(metricId);
    }
    return ethers.toBeHex(BigInt(metricId));
  }

  private scaleMetricValue(value: number): bigint {
    return BigInt(Math.round(value * VALUE_SCALE));
  }

  private unscaleMetricValue(raw: any): number {
    let numeric: number;
    if (typeof raw === 'bigint') {
      numeric = Number(raw);
    } else if (typeof raw === 'string') {
      numeric = Number(raw);
    } else {
      numeric = Number(raw);
    }
    return numeric / VALUE_SCALE;
  }

  private normalizeHandle(handle: any): string | null {
    if (!handle) return null;
    const value = typeof handle === 'string' ? handle : handle.toString();
    if (!value || value === ethers.ZeroHash || value === '0x') {
      return null;
    }
    return value;
  }

  async recordMetric(params: { metricId: string; value: number; note?: string; timestamp?: number }): Promise<{ txHash: string }> {
    secureLogger.debug('[KPI Contract] Initializing services...');
    await this.initialize();
    
    // DON'T reset FHEVM - the relayer binding might break if we reset
    // Just ensure it's initialized
    if (!fhevmService.isReady()) {
      secureLogger.debug('[KPI Contract] Initializing FHEVM (first time)...');
      await fhevmService.initialize();
    } else {
      secureLogger.debug('[KPI Contract] FHEVM already initialized, reusing instance');
    }

    if (!this.contract) {
      throw new Error('KPI contract not initialized.');
    }

    if (!simpleWalletService.isWalletConnected()) {
      throw new Error('Connect your wallet to submit metrics.');
    }

    const signer = simpleWalletService.getSigner();
    if (!signer) {
      throw new Error('Wallet signer unavailable. Please reconnect your wallet.');
    }

    secureLogger.debug('[KPI Contract] Encrypting value...');
    const userAddress = await signer.getAddress();
    const metricId = this.encodeMetricId(params.metricId);
    const timestamp = params.timestamp ?? Math.floor(Date.now() / 1000);
    const scaledValue = this.scaleMetricValue(params.value);

    // Verify contract address is set correctly
    secureLogger.debug('[KPI Contract] Pre-encryption check:', {
      contractAddress: this.contractAddress,
      userAddress: userAddress,
      scaledValue: scaledValue.toString(),
      metricId: metricId.toString()
    });

    // Ensure FHEVM instance is ready and valid (CRITICAL: singleton pattern)
    if (!fhevmService.isReady()) {
      secureLogger.warn('[KPI Contract] FHEVM not ready, reinitializing...');
      await fhevmService.initialize();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Validate instance before use (per Zama GPT: ensure single instance)
    let fheInstance;
    try {
      fheInstance = fhevmService.getInstance();
      if (!fheInstance || typeof fheInstance.createEncryptedInput !== 'function') {
        throw new Error('FHEVM instance invalid');
      }
    } catch (error) {
      secureLogger.error('[KPI Contract] Instance validation failed, forcing reinit:', error);
      await fhevmService.initialize(true);
      await new Promise(resolve => setTimeout(resolve, 2000));
      fheInstance = fhevmService.getInstance();
      if (!fheInstance || typeof fheInstance.createEncryptedInput !== 'function') {
        throw new Error('FHEVM initialization failed. Please reload the page.');
      }
    }
    
    // Double-check contract address format
    if (!this.contractAddress || !/^0x[a-fA-F0-9]{40}$/.test(this.contractAddress)) {
      throw new Error(`Invalid contract address: ${this.contractAddress}`);
    }

    // Runtime check for duplicate SDK instances (per Zama GPT checklist)
    if (typeof window !== 'undefined') {
      const sdkHolders: Array<{ key: string }> = [];
      for (const k in window) {
        try {
          const v = (window as any)[k];
          if (v && typeof v.createInstance === 'function') {
            sdkHolders.push({ key: k });
          }
        } catch (e) {}
      }
      if (sdkHolders.length > 1) {
        secureLogger.error('[KPI Contract] ⚠️ MULTIPLE SDK INSTANCES DETECTED:', sdkHolders);
        secureLogger.error('[KPI Contract] This will cause handle mismatches. Please reload the page.');
        throw new Error('Multiple SDK instances detected. Please reload the page (F5) to fix.');
      }
    }

    // Pass addresses directly as-is (docs show no format conversion)
    secureLogger.debug('[KPI Contract] 🔍 Creating encrypted input (matching docs exactly):', {
      contractAddress: this.contractAddress,
      userAddress: userAddress,
      envValue: import.meta.env.VITE_KPI_CONTRACT_ADDRESS,
      note: 'Using addresses as-is, matching official docs example'
    });
    
    // Use addresses exactly as provided (matching docs: createEncryptedInput(contractAddress, userAddress))
    const input = fheInstance.createEncryptedInput(this.contractAddress, userAddress);
    input.add64(scaledValue);
    
    secureLogger.debug('[KPI Contract] 🔐 Encrypting (addresses passed as-is)...');
    secureLogger.debug('[KPI Contract] ⚠️ Note: Encryption requires Zama Relayer to be online. Check https://status.zama.org if this fails.');
    
    let encrypted;
    try {
      encrypted = await input.encrypt();
      secureLogger.debug('[KPI Contract] ✅ Encryption successful, handle:', encrypted.handles[0]?.toString().substring(0, 20) + '...');
    } catch (encryptError: any) {
      const errorMsg = encryptError?.message || String(encryptError);
      secureLogger.error('[KPI Contract] ❌ Encryption failed:', errorMsg);
      
      // Handle "Incorrect Handle" error - requires page reload, skip auto-retry
      if (errorMsg.includes('Incorrect Handle') || errorMsg.includes('handle')) {
        secureLogger.error('[KPI Contract] ❌ Handle mismatch detected - page reload required');
        secureLogger.error('[KPI Contract] Error details:', {
          error: errorMsg,
          contractAddress: this.contractAddress,
          userAddress: userAddress,
          note: 'This error requires a page reload to clear SDK internal state'
        });
        
        // Run diagnostic check automatically when handle error occurs
        if (typeof window !== 'undefined' && (window as any).__fhevmDiagnose) {
          secureLogger.debug('[KPI Contract] 🔍 Running diagnostic check...');
          try {
            (window as any).__fhevmDiagnose();
          } catch (diagError) {
            secureLogger.warn('[KPI Contract] Diagnostic check failed:', diagError);
          }
        }
        
        throw new Error(
          `❌ ENCRYPTION FAILED - PAGE RELOAD REQUIRED\n\n` +
          `The SDK has cached handle bindings that can only be cleared by reloading the page.\n\n` +
          `🚀 QUICK FIX (do these in order):\n` +
          `1. Hard refresh: Ctrl+Shift+R (Cmd+Shift+R on Mac) or F5\n` +
          `2. Disable browser extensions (keep MetaMask, disable others like Phantom)\n` +
          `3. Clear site data: DevTools → Application → Clear storage → Clear site data\n` +
          `4. Reconnect wallet and try again\n\n` +
          `🔍 DEBUG: Run window.__fhevmDiagnose() in console for detailed diagnostics\n\n` +
          `Technical Info:\n` +
          `• Contract: ${this.contractAddress}\n` +
          `• SDK: @zama-fhe/relayer-sdk v0.3.0-6, FHEVM v0.9.1\n` +
          `• Relayer: https://status.zama.org\n` +
          `• Error: ${errorMsg.substring(0, 100)}...`
        );
      }
      
      // Check if it's a network/relayer error
      if (errorMsg.includes('fetch') || errorMsg.includes('network') || errorMsg.includes('timeout')) {
        throw new Error(
          `Encryption failed: Unable to reach Zama Relayer.\n\n` +
          `The Relayer is required for encryption. Please:\n` +
          `1. Check https://status.zama.org for Relayer status\n` +
          `2. Wait for Relayer to recover if it's down\n` +
          `3. Try again once status shows "Operational"\n\n` +
          `Original error: ${errorMsg}`
        );
      }
      
      // Generic error
      throw new Error(`Encryption failed: ${errorMsg}`);
    }

    secureLogger.debug('[KPI Contract] Sending transaction to MetaMask...');
    const tx = await this.contract.recordMetric(
      metricId,
      timestamp,
      encrypted.handles[0],
      encrypted.inputProof
    );

    secureLogger.debug('[KPI Contract] Transaction sent, waiting for confirmation...', tx.hash);
    await tx.wait(1);
    secureLogger.debug('[KPI Contract] Transaction confirmed!');
    return { txHash: tx.hash };
  }

  async recordMetricWithNote(params: { metricId: string; value: number; note: string; timestamp?: number }): Promise<{ txHash: string }> {
    secureLogger.debug('[KPI Contract] Initializing services for metric with note...');
    await this.initialize();
    
    // Verify contract address is correct by checking it's a valid address
    secureLogger.debug('[KPI Contract] Verifying contract address:', this.contractAddress);
    if (!ethers.isAddress(this.contractAddress)) {
      throw new Error(`Invalid contract address: ${this.contractAddress}`);
    }
    
    // Ensure FHEVM is initialized
    if (!fhevmService.isReady()) {
      secureLogger.debug('[KPI Contract] Initializing FHEVM...');
      await fhevmService.initialize();
    }

    if (!this.contract) {
      throw new Error('KPI contract not initialized.');
    }

    if (!simpleWalletService.isWalletConnected()) {
      throw new Error('Connect your wallet to submit metrics.');
    }

    const signer = simpleWalletService.getSigner();
    if (!signer) {
      throw new Error('Wallet signer unavailable. Please reconnect your wallet.');
    }

    const userAddress = await signer.getAddress();
    const metricId = this.encodeMetricId(params.metricId);
    const timestamp = params.timestamp ?? Math.floor(Date.now() / 1000);
    const scaledValue = this.scaleMetricValue(params.value);

    // Ensure FHEVM instance is ready and valid (CRITICAL: singleton pattern)
    if (!fhevmService.isReady()) {
      secureLogger.warn('[KPI Contract] FHEVM not ready, reinitializing...');
      await fhevmService.initialize();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Validate instance before use (per Zama GPT: ensure single instance)
    let fheInstance;
    try {
      fheInstance = fhevmService.getInstance();
      if (!fheInstance || typeof fheInstance.createEncryptedInput !== 'function') {
        throw new Error('FHEVM instance invalid');
      }
    } catch (error) {
      secureLogger.error('[KPI Contract] Instance validation failed, forcing reinit:', error);
      await fhevmService.initialize(true);
      await new Promise(resolve => setTimeout(resolve, 2000));
      fheInstance = fhevmService.getInstance();
      if (!fheInstance || typeof fheInstance.createEncryptedInput !== 'function') {
        throw new Error('FHEVM initialization failed. Please reload the page.');
      }
    }
    
    // Double-check contract address format
    if (!this.contractAddress || !/^0x[a-fA-F0-9]{40}$/.test(this.contractAddress)) {
      throw new Error(`Invalid contract address: ${this.contractAddress}`);
    }

    // Runtime check for duplicate SDK instances (per Zama GPT checklist)
    if (typeof window !== 'undefined') {
      const sdkHolders: Array<{ key: string }> = [];
      for (const k in window) {
        try {
          const v = (window as any)[k];
          if (v && typeof v.createInstance === 'function') {
            sdkHolders.push({ key: k });
          }
        } catch (e) {}
      }
      if (sdkHolders.length > 1) {
        secureLogger.error('[KPI Contract] ⚠️ MULTIPLE SDK INSTANCES DETECTED:', sdkHolders);
        secureLogger.error('[KPI Contract] This will cause handle mismatches. Please reload the page.');
        throw new Error('Multiple SDK instances detected. Please reload the page (F5) to fix.');
      }
    }

    // Use addresses exactly as provided (matching docs: createEncryptedInput(contractAddress, userAddress))
    const input = fheInstance.createEncryptedInput(this.contractAddress, userAddress);
    input.add64(scaledValue);
    input.add64(this.stringToNumericPayload(params.note));
    
    // Get config for diagnostics
    const storedConfig = fhevmService.getConfig();
    
    // Retry logic for relayer rejections
    // Note: Encryption/decryption operations happen via relayer, not gateway (per Discord guidance)
    // The gateway is used for key fetching, but encryption goes through the relayer
    const maxRetries = 3;
    const baseDelay = 2000; // 2 seconds
    let encrypted;
    let lastError: any = null;
    let retryCount = 0;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          const delay = Math.min(baseDelay * Math.pow(2, attempt - 2), 10000); // Max 10 seconds
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // Log request details on first attempt or if infrastructure is up but still failing
        if (attempt === 1 || attempt === maxRetries) {
          console.groupCollapsed('[KPI Contract] 🔍 Encryption Request Details');
          secureLogger.debug('Contract Address:', this.contractAddress);
          secureLogger.debug('User Address:', userAddress);
          secureLogger.debug('Relayer URL:', storedConfig?.relayerUrl || 'https://relayer.testnet.zama.org');
          secureLogger.debug('Chain ID:', storedConfig?.chainId);
          secureLogger.debug('Gateway Chain ID:', storedConfig?.gatewayChainId);
          secureLogger.debug('Value:', scaledValue.toString());
          secureLogger.debug('Note length:', params.note.length);
          console.groupEnd();
        }
        
        encrypted = await input.encrypt();
        if (retryCount > 0) {
          secureLogger.debug(`[KPI Contract] ✅ Encryption successful after ${retryCount} retry${retryCount > 1 ? 'ies' : ''}`);
        }
        break; // Success, exit retry loop
      } catch (encryptError: any) {
        lastError = encryptError;
        const errorMsg = encryptError?.message || String(encryptError);
        
        // Check if this is a relayer rejection with correct config
        if (errorMsg.includes('Transaction rejected') || errorMsg.includes('Rejected')) {
          // Get config to verify it's correct
          const storedConfig = fhevmService.getConfig();
          const instanceConfig = storedConfig || {};
          const actualGatewayChainId = instanceConfig.gatewayChainId;
          
          // If config is correct and this isn't the last attempt, retry silently
          if (actualGatewayChainId === 10901 && attempt < maxRetries) {
            continue; // Retry silently
          }
        }
        
        // For other errors or last attempt, break and handle error below
        if (attempt === maxRetries) {
          break; // Last attempt failed, handle error below
        }
        
        // For non-relayer errors, don't retry
        throw encryptError;
      }
    }
    
    // If we exhausted retries or got a non-retryable error, handle it
    if (!encrypted) {
      const encryptError = lastError;
      if (!encryptError) {
        throw new Error('Encryption failed with unknown error');
      }
      const errorMsg = encryptError?.message || String(encryptError);
      
      // Check for "Transaction rejected" error from relayer
      // Note: Encryption/decryption happens via relayer, not gateway (per Discord guidance)
      if (errorMsg.includes('Transaction rejected') || errorMsg.includes('Rejected')) {
        const instanceConfig = storedConfig || {};
        const relayerUrl = instanceConfig.relayerUrl || 'https://relayer.testnet.zama.org';
        
        // Check coprocessor status (relayer operations depend on coprocessor)
        let coprocessorStatus: any = null;
        try {
          coprocessorStatus = await checkCoprocessorStatus(relayerUrl);
        } catch (statusCheckError) {
          // Silent fail - status check is optional
        }
        
        // If infrastructure is up but still rejecting, log detailed diagnostics
        if (coprocessorStatus?.isOperational) {
          secureLogger.error('Relayer rejection with operational infrastructure - possible config issue');
          secureLogger.debug('Diagnostic Info', {
            contract: this.contractAddress,
            user: userAddress,
            relayerUrl,
            chainId: instanceConfig.chainId,
            gatewayChainId: instanceConfig.gatewayChainId,
            possibleCauses: [
              'Contract not indexed yet (if deployed < 5 min ago)',
              'Contract address mismatch',
              'Wrong network (should be Sepolia testnet)',
              'Contract not properly initialized on relayer'
            ]
          });
        } else if (coprocessorStatus && !coprocessorStatus.isOperational) {
          secureLogger.warn(`[KPI Contract] Coprocessor is ${coprocessorStatus.status}. Check https://status.zama.org`);
        }
        
        // Concise error message
        const statusHint = coprocessorStatus?.isOperational 
          ? 'Infrastructure is up - check diagnostic info above. '
          : coprocessorStatus && !coprocessorStatus.isOperational
          ? `Coprocessor is ${coprocessorStatus.status}. `
          : '';
        
        throw new Error(
          `Relayer rejected encryption after ${maxRetries} attempts. ` +
          `${statusHint}` +
          `Check https://status.zama.org for details.`
        );
      }
      
      
      // Handle "Incorrect Handle" error - requires page reload, skip auto-retry
      if (errorMsg.includes('Incorrect Handle') || errorMsg.includes('handle')) {
        secureLogger.error('[KPI Contract] ❌ Handle mismatch detected - page reload required');
        secureLogger.error('[KPI Contract] Error details:', {
          error: errorMsg,
          contractAddress: this.contractAddress,
          userAddress: userAddress,
          note: 'This error requires a page reload to clear SDK internal state'
        });
        
        // Run diagnostic check automatically when handle error occurs
        if (typeof window !== 'undefined' && (window as any).__fhevmDiagnose) {
          secureLogger.debug('[KPI Contract] 🔍 Running diagnostic check...');
          try {
            (window as any).__fhevmDiagnose();
          } catch (diagError) {
            secureLogger.warn('[KPI Contract] Diagnostic check failed:', diagError);
          }
        }
        
        throw new Error(
          `❌ ENCRYPTION FAILED - PAGE RELOAD REQUIRED\n\n` +
          `The SDK has cached handle bindings that can only be cleared by reloading the page.\n\n` +
          `🚀 QUICK FIX (do these in order):\n` +
          `1. Hard refresh: Ctrl+Shift+R (Cmd+Shift+R on Mac) or F5\n` +
          `2. Disable browser extensions (keep MetaMask, disable others like Phantom)\n` +
          `3. Clear site data: DevTools → Application → Clear storage → Clear site data\n` +
          `4. Reconnect wallet and try again\n\n` +
          `🔍 DEBUG: Run window.__fhevmDiagnose() in console for detailed diagnostics\n\n` +
          `Technical Info:\n` +
          `• Contract: ${this.contractAddress}\n` +
          `• SDK: @zama-fhe/relayer-sdk v0.3.0-6, FHEVM v0.9.1\n` +
          `• Relayer: https://status.zama.org\n` +
          `• Error: ${errorMsg.substring(0, 100)}...`
        );
      } else if (errorMsg.includes('fetch') || errorMsg.includes('network') || errorMsg.includes('timeout') || errorMsg.includes('CORS')) {
        // Check if it's a network/relayer/CORS error
        throw new Error(
          `Encryption failed: Unable to reach Zama Relayer.\n\n` +
          `The Relayer is required for encryption. Please:\n` +
          `1. Check https://status.zama.org for Relayer status\n` +
          `2. Wait for Relayer to recover if it's down\n` +
          `3. Try again once status shows "Operational"\n\n` +
          `Original error: ${errorMsg}`
        );
      } else {
        // Generic error
        throw new Error(`Encryption failed: ${errorMsg}`);
      }
    }

    secureLogger.debug('[KPI Contract] Sending transaction to MetaMask...');
    const tx = await this.contract.recordMetricWithNote(
      metricId,
      timestamp,
      encrypted.handles[0],
      encrypted.handles[1],
      encrypted.inputProof
    );

    secureLogger.debug('[KPI Contract] Transaction sent, waiting for confirmation...', tx.hash);
    await tx.wait(1);
    secureLogger.debug('[KPI Contract] Transaction confirmed!');
    return { txHash: tx.hash };
  }

  async getMetrics(ownerAddress: string, metricId: string): Promise<EncryptedMetricEntry[]> {
    await this.initialize();
    if (!this.contract) throw new Error('KPI contract not initialized.');

    const id = this.encodeMetricId(metricId);
    secureLogger.debug('[KPI Contract] Querying metrics:', { 
      metricId, 
      encodedId: id.toString(),
      ownerAddress 
    });
    
    const records: RawMetric[] = await this.contract.getMetrics(ownerAddress, id);
    
    secureLogger.debug('[KPI Contract] Query result:', { 
      foundEntries: records.length,
      metricId,
      ownerAddress
    });
    
    if (records.length === 0) {
      secureLogger.warn('[KPI Contract] ⚠️ NO ENTRIES FOUND! Check:', {
        'Metric ID used': metricId,
        'Encoded ID': id.toString(),
        'Owner address': ownerAddress,
        'Contract address': this.contractAddress,
        'Troubleshooting': 'Make sure the Metric ID matches EXACTLY what you used when submitting'
      });
    }

    return records.map((entry, index) => ({
      metricIdHex: this.formatMetricId(entry.metricId),
      timestamp: Number(entry.timestamp),
      valueHandle: entry.value,
      noteHandle: entry.note,
      index
    }));
  }

  async decryptMetric(params: {
    ownerAddress: string;
    metricId: string;
    entryIndex: number;
  }): Promise<{ value: number; rawValue: any; note?: string }> {
    await this.initialize();
    await fhevmService.initialize();

    if (!this.contract) {
      throw new Error('KPI contract not initialized.');
    }

    const signer = simpleWalletService.getSigner();
    if (!signer) {
      throw new Error('Wallet signer unavailable.');
    }

    // Get the signer address (viewer address for viewer decryption, owner address for owner decryption)
    const signerAddress = await signer.getAddress();
    secureLogger.debug('[KPI Contract] Decryption signer address:', signerAddress);

    const id = this.encodeMetricId(params.metricId);
    const metrics: RawMetric[] = await this.contract.getMetrics(params.ownerAddress, id);
    const entry = metrics[params.entryIndex];
    if (!entry) {
      throw new Error(`Metric entry ${params.entryIndex} not found.`);
    }

    const valueHandle = this.normalizeHandle(entry.value);
    const noteHandle = this.normalizeHandle(entry.note);

    if (!valueHandle) {
      throw new Error('Encrypted value handle missing.');
    }

    const fheInstance = fhevmService.getInstance();
    const keypair = fheInstance.generateKeypair();

    const pairs = [{ handle: valueHandle, contractAddress: this.contractAddress }];
    if (noteHandle) {
      pairs.push({ handle: noteHandle, contractAddress: this.contractAddress });
    }

    const startTimestamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = '10';
    const eip712 = fheInstance.createEIP712(
      keypair.publicKey,
      [this.contractAddress],
      startTimestamp,
      durationDays
    );

    const signature = await signer.signTypedData(
      eip712.domain,
      { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
      eip712.message
    );

    const isViewerDecryption = signerAddress.toLowerCase() !== params.ownerAddress.toLowerCase();
    secureLogger.debug('[KPI Contract] ===== DECRYPTION REQUEST DETAILS =====');
    secureLogger.debug('[KPI Contract] Owner Address:', params.ownerAddress);
    secureLogger.debug('[KPI Contract] Viewer/Signer Address:', signerAddress);
    secureLogger.debug('[KPI Contract] Is Viewer Decryption:', isViewerDecryption);
    secureLogger.debug('[KPI Contract] Metric ID:', params.metricId);
    secureLogger.debug('[KPI Contract] Encoded Metric ID:', id.toString());
    secureLogger.debug('[KPI Contract] Entry Index:', params.entryIndex);
    secureLogger.debug('[KPI Contract] Contract Address:', this.contractAddress);
    secureLogger.debug('[KPI Contract] Value Handle:', valueHandle);
    secureLogger.debug('[KPI Contract] Note Handle:', noteHandle || 'none');
    secureLogger.debug('[KPI Contract] Pairs Count:', pairs.length);
    secureLogger.debug('[KPI Contract] Signature Length:', signature.length);
    secureLogger.debug('[KPI Contract] Start Timestamp:', startTimestamp);
    secureLogger.debug('[KPI Contract] Duration Days:', durationDays);
    secureLogger.debug('[KPI Contract] ========================================');

    let decryptResult;
    try {
      secureLogger.debug('[KPI Contract] Calling relayer userDecrypt with:', {
        pairs: pairs.map(p => ({ handle: p.handle, contract: p.contractAddress })),
        ownerAddress: params.ownerAddress,
        contractAddresses: [this.contractAddress],
        startTimestamp: startTimestamp,
        durationDays: durationDays,
        signatureLength: signature.replace('0x', '').length
      });
      
      // For viewer decryption, pass the signer's address (viewer), not the owner's address
      // The relayer uses this to identify who is requesting decryption
      decryptResult = await fheInstance.userDecrypt(
        pairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        [this.contractAddress],
        signerAddress, // Use signer address (viewer for viewer decryption, owner for owner decryption)
        startTimestamp,
        durationDays
      );
      
      secureLogger.debug('[KPI Contract] ✅ Relayer decryption successful');
    } catch (relayerError: any) {
      secureLogger.error('[KPI Contract] ===== RELAYER ERROR DETAILS =====');
      secureLogger.error('[KPI Contract] Error Message:', relayerError?.message);
      secureLogger.error('[KPI Contract] Error Object:', relayerError);
      secureLogger.error('[KPI Contract] Response Status:', relayerError?.response?.status);
      secureLogger.error('[KPI Contract] Response Status Text:', relayerError?.response?.statusText);
      secureLogger.error('[KPI Contract] Response Data:', relayerError?.response?.data);
      secureLogger.error('[KPI Contract] Owner Address:', params.ownerAddress);
      secureLogger.error('[KPI Contract] Viewer Address:', signerAddress);
      secureLogger.error('[KPI Contract] Metric ID:', params.metricId);
      secureLogger.error('[KPI Contract] Entry Index:', params.entryIndex);
      secureLogger.error('[KPI Contract] ===================================');
      
      // Check if it's a 500 error from the relayer
      if (relayerError?.message?.includes('500') || relayerError?.response?.status === 500) {
        throw new Error(
          'User decrypt failed: relayer respond with HTTP code 500. ' +
          'This usually means access was not properly granted on-chain or the relayer service is unavailable. ' +
          'Please verify that the owner granted you access and try again.'
        );
      }
      throw relayerError;
    }

    if (!decryptResult || typeof decryptResult !== 'object') {
      throw new Error('Invalid response from FHEVM relayer during decryption.');
    }

    const rawValue = decryptResult[valueHandle];
    const value = this.unscaleMetricValue(rawValue);

    let note: string | undefined;
    if (noteHandle && decryptResult[noteHandle] !== undefined) {
      note = this.decodeNumericPayload(decryptResult[noteHandle]);
    }

    return { value, rawValue, note };
  }

  async grantAccess(metricId: string, viewerAddress: string): Promise<void> {
    await this.initialize();
    if (!this.contract) throw new Error('KPI contract not initialized.');
    const id = this.encodeMetricId(metricId);
    const tx = await this.contract.grantAccess(id, viewerAddress);
    await tx.wait(1);
  }

  async revokeAccess(metricId: string, viewerAddress: string): Promise<void> {
    await this.initialize();
    if (!this.contract) throw new Error('KPI contract not initialized.');
    const id = this.encodeMetricId(metricId);
    const tx = await this.contract.revokeAccess(id, viewerAddress);
    await tx.wait(1);
  }

  async getAuthorizedViewers(ownerAddress: string, metricId: string): Promise<string[]> {
    await this.initialize();
    if (!this.contract) throw new Error('KPI contract not initialized.');
    const id = this.encodeMetricId(metricId);
    const viewers: string[] = await this.contract.getAuthorizedViewers(ownerAddress, id);
    return viewers;
  }

  async hasAccess(ownerAddress: string, metricId: string, viewerAddress: string): Promise<boolean> {
    await this.initialize();
    if (!this.contract) throw new Error('KPI contract not initialized.');
    const id = this.encodeMetricId(metricId);
    secureLogger.debug('[KPI Contract] Checking hasAccess:', {
      metricId,
      encodedId: id.toString(),
      ownerAddress,
      viewerAddress
    });
    const hasAccess: boolean = await this.contract.hasAccess(ownerAddress, id, viewerAddress);
    secureLogger.debug('[KPI Contract] hasAccess result:', { metricId, hasAccess });
    return hasAccess;
  }

  async isAdmin(accountAddress: string): Promise<boolean> {
    await this.initialize();
    if (!this.contract) throw new Error('KPI contract not initialized.');
    const isAdmin: boolean = await this.contract.isAdmin(accountAddress);
    return isAdmin;
  }

  async addAdmin(adminAddress: string): Promise<void> {
    await this.initialize();
    if (!this.contract) throw new Error('KPI contract not initialized.');
    const tx = await this.contract.addAdmin(adminAddress);
    await tx.wait(1);
  }

  async removeAdmin(adminAddress: string): Promise<void> {
    await this.initialize();
    if (!this.contract) throw new Error('KPI contract not initialized.');
    const tx = await this.contract.removeAdmin(adminAddress);
    await tx.wait(1);
  }

  async getAdminList(): Promise<string[]> {
    await this.initialize();
    if (!this.contract) throw new Error('KPI contract not initialized.');
    
    // Query AdminAdded and AdminRemoved events to reconstruct the admin list
    const adminAddedFilter = this.contract.filters.AdminAdded();
    const adminRemovedFilter = this.contract.filters.AdminRemoved();
    
    const [addedEvents, removedEvents] = await Promise.all([
      this.contract.queryFilter(adminAddedFilter),
      this.contract.queryFilter(adminRemovedFilter)
    ]);

    const adminSet = new Set<string>();
    
    // Add all admins from AdminAdded events
    addedEvents.forEach((event) => {
      if ('args' in event && event.args && event.args[0]) {
        adminSet.add(String(event.args[0]).toLowerCase());
      }
    });
    
    // Remove admins from AdminRemoved events
    removedEvents.forEach((event) => {
      if ('args' in event && event.args && event.args[0]) {
        adminSet.delete(String(event.args[0]).toLowerCase());
      }
    });
    
    return Array.from(adminSet);
  }

  private stringToNumericPayload(text: string): bigint {
    if (!text) return 0n;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    // Enforce uint64 limit (8 bytes) so note fits on-chain and in FHE input
    if (bytes.length > 8) {
      throw new Error(
        `Note is too long (${bytes.length} bytes). Maximum 8 ASCII characters allowed due to 64-bit limit.`
      );
    }
    let result = 0n;
    for (const byte of bytes) {
      result = (result << 8n) + BigInt(byte);
    }
    const MAX_UINT64 = (1n << 64n) - 1n;
    if (result > MAX_UINT64) {
      throw new Error('Note value exceeds 64-bit limit. Please shorten the note.');
    }
    return result;
  }

  private decodeNumericPayload(value: any): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    const numeric = typeof value === 'bigint' ? value : BigInt(value);
    if (numeric === 0n) return '';
    let temp = numeric;
    const bytes: number[] = [];
    while (temp > 0n) {
      bytes.unshift(Number(temp & 0xffn));
      temp >>= 8n;
    }
    return new TextDecoder().decode(new Uint8Array(bytes)).replace(/\0/g, '').trim();
  }
}

export const kpiContractService = new KpiContractService();

