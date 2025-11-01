// Real FHEVM Service preferring the locally hosted SDK bundle

type FhevmModule = {
  initSDK: () => Promise<void | boolean>;
  createInstance: (config: any) => Promise<any>;
  SepoliaConfig?: any;
};

declare global {
  interface Window {
    fhevm?: FhevmModule;
  }
}

class FhevmService {
  private instance: any = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('🔒 Initializing FHEVM SDK from CDN...');
      
      // Get the stable provider from the wallet service with better conflict resolution
      let selectedProvider = (window as any).__stableProvider || (window as any).__selectedProvider;
      
      // If no stable provider, try to detect and resolve conflicts
      if (!selectedProvider) {
        console.log('🔍 Detecting wallet provider conflicts...');
        
        // Check for multiple providers
        if ((window as any).ethereum?.providers && (window as any).ethereum.providers.length > 1) {
          console.log('⚠️ Multiple wallet providers detected:', (window as any).ethereum.providers.length);
          
          // Try to find MetaMask specifically
          const metaMaskProvider = (window as any).ethereum.providers.find((p: any) => p.isMetaMask);
          if (metaMaskProvider) {
            selectedProvider = metaMaskProvider;
            console.log('✅ Selected MetaMask provider from multiple providers');
          } else {
            // If no MetaMask found, use the first provider
            selectedProvider = (window as any).ethereum.providers[0];
            console.log('⚠️ MetaMask not found, using first available provider');
          }
        } else if (window.ethereum) {
          // Single provider case
          selectedProvider = window.ethereum;
          console.log('✅ Single provider detected:', selectedProvider.isMetaMask ? 'MetaMask' : 'Other');
        }
      }
      
      // If no stable provider, try to get MetaMask specifically with better conflict handling
      if (!selectedProvider) {
        try {
          // Try multiple detection methods to avoid provider conflicts
          if (window.ethereum) {
            // Method 1: Direct MetaMask detection
            if (window.ethereum.isMetaMask) {
              selectedProvider = window.ethereum;
              console.log('✅ Found MetaMask directly');
            } 
            // Method 2: Multiple providers array
            else if ((window as any).ethereum?.providers && Array.isArray((window as any).ethereum.providers)) {
              const providers = (window as any).ethereum.providers;
              console.log('🔍 Found multiple providers:', providers.length);
              
              // Prioritize MetaMask
              const metaMaskProvider = providers.find((p: any) => p.isMetaMask);
              if (metaMaskProvider) {
                selectedProvider = metaMaskProvider;
                console.log('✅ Selected MetaMask from providers array');
              } else {
                // Fallback to first provider
                selectedProvider = providers[0];
                console.log('⚠️ MetaMask not found, using first provider');
              }
            }
            // Method 3: Check for provider properties
            else if ((window as any).ethereum?.providers?.MetaMask) {
              selectedProvider = (window as any).ethereum.providers.MetaMask;
              console.log('✅ Found MetaMask in providers object');
            }
            // Method 4: Use window.ethereum as fallback
            else {
              selectedProvider = window.ethereum;
              console.log('⚠️ Using window.ethereum as fallback');
            }
          }
        } catch (error) {
          console.warn('Provider conflict detected, using safe fallback:', error);
          // Safe fallback - try to get any provider without setting properties
          try {
            selectedProvider = (window as any).ethereum || (window as any).web3?.currentProvider;
          } catch (fallbackError) {
            console.error('All provider detection methods failed:', fallbackError);
          }
        }
      }
      
      // Fallback to any ethereum provider
      if (!selectedProvider) {
        selectedProvider = window.ethereum;
      }
      
      if (!selectedProvider) {
        throw new Error('No Ethereum provider detected. Please install MetaMask or another wallet extension.');
      }

      console.log('🔧 Using stable provider for FHEVM:', selectedProvider);
      console.log('🔧 Provider type:', typeof selectedProvider);
      console.log('🔧 Provider isMetaMask:', selectedProvider.isMetaMask);

      let initSDK, createInstance, SepoliaConfig;
      try {
        const sdkModule = await this.loadFhevmModule();
        ({ initSDK, createInstance, SepoliaConfig } = sdkModule);
        console.log('✅ FHEVM SDK module loaded successfully');
      } catch (moduleError: any) {
        console.error('❌ Failed to load FHEVM SDK module:', moduleError);
        throw new Error(`Failed to load FHEVM SDK module: ${moduleError?.message || moduleError}`);
      }
      
      // Verify we have initSDK before calling it
      if (!initSDK || typeof initSDK !== 'function') {
        throw new Error('initSDK function not available. FHEVM SDK may not have loaded correctly.');
      }
      
      // Initialize the FHEVM SDK first
      await initSDK();
      console.log('✅ FHEVM SDK initialized successfully');

      // Production Sepolia configuration for real-world dApp
      const config = {
        chainId: 11155111, // Sepolia chain ID
        gatewayChainId: 55815,
        relayerUrl: 'https://relayer.testnet.zama.cloud',
        // Updated contract addresses for production Sepolia
        aclContractAddress: '0x687820221192C5B662b25367F70076A37bc79b6c',
        inputVerifierContractAddress: '0xbc91f3daD1A5F19F8390c400196e58073B6a0BC4',
        kmsContractAddress: '0x1364cBBf2cDF5032C47d8226a6f6FBD2AFCDacAC',
        verifyingContractAddressDecryption: '0xb6E160B1ff80D67Bfe90A85eE06Ce0A2613607D1',
        verifyingContractAddressInputVerification: '0x7048C39f048125eDa9d678AEbaDfB22F7900a29F',
        network: selectedProvider,
        // Production settings
        timeout: 60000, // 60 seconds for production
        retries: 5, // More retries for production
        // Add production-specific settings
        enableLogging: true,
        enableMetrics: true,
      };

      console.log('🔧 FHEVM Config details:', {
        chainId: config.chainId,
        gatewayChainId: config.gatewayChainId,
        relayerUrl: config.relayerUrl,
        aclContractAddress: config.aclContractAddress,
        inputVerifierContractAddress: config.inputVerifierContractAddress,
        kmsContractAddress: config.kmsContractAddress,
        verifyingContractAddressDecryption: config.verifyingContractAddressDecryption,
        verifyingContractAddressInputVerification: config.verifyingContractAddressInputVerification
      });

      console.log('🔧 Creating FHEVM instance with Sepolia config:', {
        chainId: config.chainId,
        gatewayChainId: config.gatewayChainId,
        relayerUrl: config.relayerUrl,
      });

      console.log('🔧 Creating FHEVM instance with config:', config);
      
      // Verify user is connected to Sepolia testnet
      if (selectedProvider && selectedProvider.chainId) {
        const chainId = parseInt(selectedProvider.chainId);
        if (chainId !== 11155111) {
          throw new Error(`Please switch to Sepolia testnet (Chain ID: 11155111). Current network: ${chainId}`);
        }
        console.log('✅ Connected to Sepolia testnet');
      }
      
      // Production retry logic with exponential backoff
      let lastError: Error | null = null;
      const maxRetries = 3;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🔄 FHEVM initialization attempt ${attempt}/${maxRetries}...`);
          this.instance = await createInstance(config);
          console.log('✅ FHEVM instance created successfully!');
          break; // Success, exit retry loop
        } catch (error) {
          lastError = error as Error;
          console.error(`❌ FHEVM instance creation attempt ${attempt} failed:`, error);
          
          if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
            console.log(`⏳ Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      // If all attempts failed, try minimal fallback
      if (!this.instance) {
        console.log('🔄 All retries failed, trying minimal fallback configuration...');
        const fallbackConfig = {
          chainId: 11155111,
          gatewayChainId: 55815,
          relayerUrl: 'https://relayer.testnet.zama.cloud',
          network: selectedProvider,
        };
        
        try {
          this.instance = await createInstance(fallbackConfig);
          console.log('✅ FHEVM instance created with minimal fallback config!');
        } catch (fallbackError) {
          console.error('❌ Fallback FHEVM instance creation also failed:', fallbackError);
          throw new Error(`FHEVM initialization failed after ${maxRetries} attempts: ${lastError?.message}. Please check your network connection and ensure you're connected to Sepolia testnet.`);
        }
      }
      console.log('✅ Public key available:', !!this.instance.getPublicKey);
      console.log('✅ Instance type:', typeof this.instance);
      console.log('🔍 Available methods:', Object.getOwnPropertyNames(this.instance));
      console.log('🔍 Instance prototype:', Object.getOwnPropertyNames(Object.getPrototypeOf(this.instance)));
      
      // Check what encryption methods are available
      console.log('🔍 Encryption methods check:');
      console.log('  - encrypt64:', !!this.instance.encrypt64);
      console.log('  - encrypt32:', !!this.instance.encrypt32);
      console.log('  - encrypt8:', !!this.instance.encrypt8);
      console.log('  - encrypt:', !!this.instance.encrypt);
      console.log('  - createEncryptedInput:', !!this.instance.createEncryptedInput);
      
      // Check if instance has contract-related methods
      console.log('🔍 Contract-related methods:');
      console.log('  - getContractAddress:', !!this.instance.getContractAddress);
      console.log('  - getNetwork:', !!this.instance.getNetwork);
      
      // Try to get the network info
      try {
        if (this.instance.getNetwork) {
          const network = await this.instance.getNetwork();
          console.log('🔍 FHEVM Network:', network);
        }
      } catch (error) {
        console.log('⚠️ Could not get network info:', error);
      }
      
      // Check if there are any registered contracts
      try {
        if (this.instance.getRegisteredContracts) {
          const contracts = await this.instance.getRegisteredContracts();
          console.log('🔍 Registered contracts:', contracts);
        }
      } catch (error) {
        console.log('⚠️ Could not get registered contracts:', error);
      }
      
      // Test if we can get the public key
      try {
        const publicKey = this.instance.getPublicKey();
        console.log('✅ Public key retrieved:', typeof publicKey, publicKey);
        if (typeof publicKey === 'string') {
          console.log('✅ Public key (first 20 chars):', publicKey.substring(0, 20) + '...');
        } else if (publicKey && typeof publicKey === 'object') {
          console.log('✅ Public key is object:', publicKey);
        }
      } catch (pkError) {
        console.error('❌ Failed to get public key:', pkError);
      }
      
      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize FHEVM SDK:', error);
      // @ts-ignore - error type unknown
      throw new Error(`Failed to initialize FHEVM SDK: ${error.message}`);
    }
  }

  async encryptString(value: string, contractAddress?: string): Promise<any> {
    if (!this.instance) {
      throw new Error('FHEVM instance not initialized. Please ensure FHEVM is properly set up.');
    }

    try {
      console.log('🔍 FHEVM encryptString called with:', {
        value,
        contractAddress,
        contractAddressType: typeof contractAddress,
        contractAddressLength: contractAddress?.length,
        contractAddressStartsWith0x: contractAddress?.startsWith('0x')
      });
      
      // Convert string to number for FHEVM encryption
      const numericValue = this.stringToNumber(value);
      console.log(`🔐 Encrypting string "${value}" as number:`, numericValue);
      
      // Use the appropriate encryption method based on what's available
      let encrypted;
      
      // Use the correct FHEVM createEncryptedInput method
      if (this.instance.createEncryptedInput && contractAddress) {
        console.log('🔐 Using FHEVM createEncryptedInput buffer method');
        console.log('🔐 Contract address:', contractAddress);
        
        // Validate contract address before using it
        if (!contractAddress || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
          throw new Error(`Contract address is not a valid address: ${contractAddress}`);
        }
        
        // Get user address from wallet
        const userAddress = await this.getUserAddress();
        console.log('🔐 User address:', userAddress);
        
        // Create buffer with correct signature: createEncryptedInput(contractAddress, userAddress)
        const buffer = this.instance.createEncryptedInput(contractAddress, userAddress);
        
        // Add the value to the buffer
        buffer.add64(BigInt(numericValue));
        
        // Encrypt and get ciphertexts
        const ciphertexts = await buffer.encrypt();
        console.log('🔐 Ciphertexts created:', ciphertexts);
        
        // Return the first handle (for single value)
        encrypted = ciphertexts.handles[0];
      } else if (this.instance.encrypt64) {
        console.log('🔐 Fallback to encrypt64 method');
        encrypted = await this.instance.encrypt64(numericValue);
      } else if (this.instance.encrypt) {
        console.log('🔐 Fallback to encrypt method');
        encrypted = await this.instance.encrypt(numericValue, 'euint64');
      } else {
        throw new Error('No encryption methods available on FHEVM instance');
      }
      
      console.log('✅ String encrypted successfully');
      return encrypted;
    } catch (error) {
      console.error('❌ Encryption failed:', error);
      // @ts-ignore - error type unknown
      throw new Error(`Failed to encrypt data: ${error.message}`);
    }
  }

  async encryptNumber(value: number, type: 'euint8' | 'euint32' | 'euint64' = 'euint64', contractAddress?: string): Promise<any> {
    if (!this.instance) {
      throw new Error('FHEVM instance not initialized. Please ensure FHEVM is properly set up.');
    }

    try {
      console.log(`🔐 Encrypting number ${value} as ${type}...`);
      
      // Use the correct FHEVM createEncryptedInput method for numbers
      let encrypted;
      
      if (this.instance.createEncryptedInput && contractAddress) {
        console.log('🔐 Using FHEVM createEncryptedInput buffer method for number');
        console.log('🔐 Contract address:', contractAddress);
        
        // Validate contract address before using it
        if (!contractAddress || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
          throw new Error(`Contract address is not a valid address: ${contractAddress}`);
        }
        
        // Get user address from wallet
        const userAddress = await this.getUserAddress();
        console.log('🔐 User address:', userAddress);
        
        // Create buffer with correct signature: createEncryptedInput(contractAddress, userAddress)
        const buffer = this.instance.createEncryptedInput(contractAddress, userAddress);
        
        // Add the value to the buffer based on type
        if (type === 'euint64') {
          buffer.add64(BigInt(value));
        } else if (type === 'euint32') {
          buffer.add32(BigInt(value));
        } else if (type === 'euint8') {
          buffer.add8(BigInt(value));
        } else {
          throw new Error(`Unsupported type: ${type}`);
        }
        
        // Encrypt and get ciphertexts
        const ciphertexts = await buffer.encrypt();
        console.log('🔐 Ciphertexts created:', ciphertexts);
        
        // Return the first handle (for single value)
        encrypted = ciphertexts.handles[0];
      } else if (type === 'euint64' && this.instance.encrypt64) {
        console.log('🔐 Fallback to encrypt64 method');
        encrypted = await this.instance.encrypt64(value);
      } else if (type === 'euint32' && this.instance.encrypt32) {
        console.log('🔐 Fallback to encrypt32 method');
        encrypted = await this.instance.encrypt32(value);
      } else if (type === 'euint8' && this.instance.encrypt8) {
        console.log('🔐 Fallback to encrypt8 method');
        encrypted = await this.instance.encrypt8(value);
      } else if (this.instance.encrypt) {
        console.log('🔐 Fallback to encrypt method');
        encrypted = await this.instance.encrypt(value, type);
      } else {
        throw new Error('No encryption methods available on FHEVM instance');
      }
      
      console.log('✅ Number encrypted successfully');
      return encrypted;
    } catch (error) {
      console.error('❌ Encryption failed:', error);
      // @ts-ignore - error type unknown
      throw new Error(`Failed to encrypt data: ${error.message}`);
    }
  }

  async decrypt(ciphertext: string): Promise<any> {
    if (!this.instance) {
      throw new Error('FHEVM instance not initialized. Please ensure FHEVM is properly set up.');
    }

    try {
      const decrypted = await this.instance.decrypt(ciphertext);
      return decrypted;
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  getPublicKey(): string {
    if (!this.instance) {
      throw new Error('FHEVM instance not initialized. Please ensure FHEVM is properly set up.');
    }
    
    try {
      const publicKey = this.instance.getPublicKey();
      
      // Handle different public key formats
      if (typeof publicKey === 'string') {
        return publicKey;
      } else if (publicKey && typeof publicKey === 'object') {
        // If it's an object, try to extract the key
        if (publicKey.key) {
          return publicKey.key;
        } else if (publicKey.publicKey) {
          return publicKey.publicKey;
        } else if (publicKey.toString) {
          return publicKey.toString();
        }
      }
      
      // Fallback: convert to string
      return String(publicKey);
    } catch (error) {
      console.error('❌ Failed to get public key:', error);
      throw new Error('Failed to retrieve public key from FHEVM instance');
    }
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  getInstance(): any {
    return this.instance;
  }

  private async loadFhevmModule(): Promise<FhevmModule> {
    const globalModule = window.fhevm;
    if (globalModule && typeof globalModule.initSDK === 'function') {
      console.log('✅ Using FHEVM SDK from window.fhevm');
      return globalModule;
    }

    try {
      console.log('🔧 Attempting to import local FHEVM bundle...');
      const localUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/relayer-sdk/relayer-sdk-js.js`
        : '/relayer-sdk/relayer-sdk-js.js';

      // @ts-ignore - local public bundle has no types
      const localModule = await import(/* @vite-ignore */ localUrl);

      if (localModule && typeof localModule.initSDK === 'function') {
        console.log('✅ Local FHEVM bundle import successful');
        return localModule as FhevmModule;
      }

      console.warn('⚠️ Local FHEVM bundle loaded without expected exports');
    } catch (localError) {
      console.warn('⚠️ Local FHEVM bundle import failed:', (localError as Error)?.message || localError);
    }

    try {
      console.log('🔧 Falling back to npm FHEVM package...');
      const npmModule = (await import('@zama-fhe/relayer-sdk/bundle')) as unknown as FhevmModule;

      if (npmModule && typeof npmModule.initSDK === 'function') {
        console.log('✅ NPM FHEVM package import successful');
        return npmModule;
      }

      throw new Error('NPM module loaded but missing required exports');
    } catch (npmError) {
      console.error('❌ Unable to load FHEVM SDK from any source:', (npmError as Error)?.message || npmError);
      throw npmError;
    }
  }

  // Helper function to convert string to number for encryption
  private stringToNumber(str: string): number {
    if (!str || typeof str !== 'string') {
      console.warn('Invalid input to stringToNumber:', str);
      return 0;
    }
    
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  // Helper function to get user address from wallet
  private async getUserAddress(): Promise<string> {
    try {
      // Use the same provider resolution logic
      let selectedProvider = (window as any).__stableProvider || (window as any).__selectedProvider;
      
      if (!selectedProvider) {
        try {
          if (window.ethereum) {
            // Check if it's MetaMask directly
            if (window.ethereum.isMetaMask) {
              selectedProvider = window.ethereum;
            } else if ((window as any).ethereum?.providers) {
              // Multiple providers - find MetaMask
              const providers = (window as any).ethereum.providers;
              selectedProvider = providers.find((p: any) => p.isMetaMask);
            }
          }
        } catch (error) {
          console.warn('Provider conflict detected in getUserAddress, using fallback:', error);
          // Use the first available provider as fallback
          selectedProvider = window.ethereum;
        }
      }
      
      if (!selectedProvider) {
        selectedProvider = window.ethereum;
      }
      
      if (!selectedProvider) {
        throw new Error('No provider available');
      }
      
      const accounts = await selectedProvider.request({ method: 'eth_accounts' });
      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts found');
      }
      
      return accounts[0];
    } catch (error) {
      console.error('❌ Failed to get user address:', error);
      throw new Error('Failed to get user address from wallet');
    }
  }
}

export const fhevmService = new FhevmService();
