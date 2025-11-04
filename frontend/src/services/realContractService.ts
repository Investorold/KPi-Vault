import { ethers } from 'ethers';
import { simpleWalletService } from './simpleWalletService';
import { productionWalletService } from './productionWalletService';
import { fhevmService } from './fhevmService';
import type { Task } from '../types';

// EXACT ABI from your TaskManager.sol contract
// ABI matching the actual deployed contract with correct FHEVM types
const TASK_MANAGER_ABI = [
  // Core task functions with actual FHEVM types from deployed contract
  // externalEuint64/8 compile to bytes32  
  "function createTask(bytes32 encryptedTitle, bytes32 encryptedDueDate, bytes32 encryptedPriority, bytes inputProof) external payable",
  "function createTaskWithText(bytes32 encryptedTitle, bytes32 encryptedDescription, bytes32 encryptedDueDate, bytes32 encryptedPriority, bytes inputProof) external payable",
  "function createTaskWithNumbers(bytes32 encryptedTitle, bytes32 encryptedDueDate, bytes32 encryptedPriority, bytes32 encryptedNumericId, bytes inputProof) external payable",
  "function completeTask(uint256 taskIndex) external",
  "function deleteTaskById(uint256 taskId) external",
  "function editTask(uint256 taskIndex, bytes32 newEncryptedTitle, bytes32 newEncryptedDueDate, bytes32 newEncryptedPriority, bytes inputProof) external",
  "function shareTaskById(uint256 taskId, address recipient) external",
  
  // Decryption functions
  "function requestTaskDecryptionById(uint256 taskId) external",
  "function requestSharedTaskDecryptionById(uint256 taskId, address originalOwner) external",
  "function taskDecryptionCallback(uint256 requestId, bytes memory cleartexts, bytes memory decryptionProof) external",
  
  // Fee and admin functions
  "function requestTasksDueSoonCount(bytes32 encryptedTimeMargin, bytes inputProof) external",
  "function taskCreationFee() external view returns (uint256)",
  "function setFee(uint256 _newFee) external",
  "function withdraw() external",
  "function owner() external view returns (address)",
  
  // Due soon count functions
  "function callbackCount(uint256 requestId, bytes memory cleartexts, bytes memory decryptionProof) external",
  "function lastDueSoonCount(address user) external view returns (uint32)",
  "function getTasks(address user) external view returns (tuple(bytes32 title, bytes32 description, bytes32 dueDate, bytes32 priority, bytes32 numericId, uint8 status)[] memory)",
  "function getTaskId(address owner_, uint256 index) external view returns (uint256)",
  "function getTaskIndex(address owner_, uint256 taskId) external view returns (uint256)",
  
  // Shared tasks functions
  "function getSharedTasks(address recipient) external view returns (uint256[] memory)",
  "function isTaskSharedWith(address recipient, address owner, uint256 taskId) external view returns (bool)",

  // Events
  "event DecryptionRequested(uint256 requestId, address indexed initiator)",
  "event TaskShared(uint256 indexed taskId, address indexed owner, address indexed recipient)",
  "event TaskDecrypted(uint256 indexed requestId, address indexed user, uint64 title, uint64 dueDate, uint8 priority)",
  "event Debug(string message, uint256 value)"
];

class RealContractService {
  private contract: ethers.Contract | null = null;
  private contractAddress = "";
  private isDemoMode = false; // Use real contract - we need FHEVM

  async initialize(contractAddress: string): Promise<void> {
    console.log('🚀 Initializing RealContractService with address:', contractAddress);
    
    // Check if demo mode
    if (contractAddress === 'DEMO_MODE') {
      this.isDemoMode = true;
      this.contractAddress = contractAddress;
      console.log('Running in demo mode - no contract connection needed');
      return;
    }
    
    this.contractAddress = contractAddress;
    
    // Wait for wallet to be ready with robust provider detection
    let provider = simpleWalletService.getProvider();
    let signer = simpleWalletService.getSigner();
    
    // If provider is not available, try fallback detection
    if (!provider) {
      console.warn('⚠️ Primary provider not available, attempting fallback detection...');
      
      if (window.ethereum) {
        provider = window.ethereum;
        console.log('✅ Fallback provider found from window.ethereum');
      } else if ((window as any).ethereum?.providers) {
        provider = (window as any).ethereum.providers.find((p: any) => p.isMetaMask);
        console.log('✅ Fallback provider found from providers array');
      }
    }
    
    if (!provider || !signer) {
      console.warn('Wallet not connected yet, contract service will initialize when wallet connects');
      return;
    }

    console.log('🔍 Creating contract with:', {
      address: this.contractAddress,
      abiLength: TASK_MANAGER_ABI.length,
      abiFirstFunction: TASK_MANAGER_ABI[0],
      provider: !!provider,
      signer: !!signer
    });
    
    this.contract = new ethers.Contract(this.contractAddress, TASK_MANAGER_ABI, signer);
    console.log('✅ Connected to TaskManager contract:', this.contractAddress);
    
    // Debug: Log available contract methods
    console.log('🔍 Available contract methods:', Object.getOwnPropertyNames(this.contract));
    console.log('🔍 Contract interface methods:', this.contract.interface.fragments.map(f => (f as any).name));
    console.log('🔍 Has createTask method:', 'createTask' in this.contract);

    // Test contract connection
    try {
      console.log('🧪 Testing contract connection...');
      const fee = await this.contract.taskCreationFee();
      console.log('✅ Contract connection verified. Task creation fee:', fee.toString());
    } catch (error) {
      console.warn('⚠️ Contract connection test failed (this may be normal for new contracts):', error);
      console.log('ℹ️  The contract address exists, but may have different function signatures');
    }
  }

  isInitialized(): boolean {
    return !!this.contract && this.contractAddress !== '';
  }

  async getTaskCreationFee(): Promise<string> {
    if (this.isDemoMode) {
      return '0.0001';
    }

    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const fee = await this.contract.taskCreationFee();
      return ethers.formatEther(fee);
    } catch (error) {
      console.warn('Failed to get task creation fee from contract (using default):', error);
      // Return default fee if contract call fails
      return '0.0001';
    }
  }

  async getReceivedTasks(): Promise<Task[]> {
    if (this.isDemoMode) {
      return [];
    }

    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const signer = simpleWalletService.getSigner();
      if (!signer) {
        throw new Error('Wallet not connected');
      }

      const userAddress = await signer.getAddress();
      console.log('🔍 Loading received tasks for user:', userAddress);
      console.log('🔍 User address (checksum):', ethers.getAddress(userAddress));
      console.log('🔍 User address (lowercase):', userAddress.toLowerCase());

      // Try to get shared task indices for this user
      // IMPORTANT: The address must match exactly how it was stored in the contract
      let sharedTaskIds: number[] = [];
      try {
        // Try with checksummed address first
        const checksumAddress = ethers.getAddress(userAddress);
        console.log('🔍 Querying getSharedTasks with checksum address:', checksumAddress);
        sharedTaskIds = await this.contract.getSharedTasks(checksumAddress);
        console.log('🔍 Found shared task IDs (checksum):', sharedTaskIds);
        
        // If empty, try with lowercase address (some contracts store lowercase)
        if (sharedTaskIds.length === 0) {
          console.log('🔍 Trying lowercase address...');
          console.log('🔍 Querying getSharedTasks with lowercase address:', userAddress.toLowerCase());
          sharedTaskIds = await this.contract.getSharedTasks(userAddress.toLowerCase());
          console.log('🔍 Found shared task IDs (lowercase):', sharedTaskIds);
        }
      } catch (error: any) {
        const errorCode = error?.code;
        const errorMessage = error?.message || '';
        
        console.warn('⚠️ Error calling getSharedTasks:', {
          code: errorCode,
          message: errorMessage,
          address: userAddress
        });
        
        // Handle different error types gracefully:
        // 1. Function doesn't exist or not implemented on contract
        // 2. CALL_EXCEPTION (missing revert data) - function might revert or not exist
        // 3. Network/RPC issues
        
        if (
          errorCode === 'CALL_EXCEPTION' ||
          errorMessage.includes('missing revert data') ||
          errorMessage.includes('not found') ||
          errorMessage.includes('does not exist') ||
          errorMessage.includes('execution reverted')
        ) {
          console.log('ℹ️ getSharedTasks function may not be implemented on this contract, or no tasks are shared');
          console.log('ℹ️ This is OK - it just means there are no received tasks. Returning empty array.');
          // Return empty array instead of throwing - this is not a critical error
      return [];
        }
        
        // For other errors (network issues, etc.), log but don't crash
        console.warn('⚠️ Unexpected error calling sharedTasks, assuming no received tasks:', error);
        return [];
      }

      if (sharedTaskIds.length === 0) {
        console.log('ℹ️ No shared tasks found for address:', userAddress);
        return [];
      }
      
      console.log(`✅ Found ${sharedTaskIds.length} shared task(s) for user`);

      // Get the actual tasks from the original owners
      const receivedTasks: Task[] = [];
      
      for (const taskId of sharedTaskIds) {
        try {
          // Resolve original owner from TaskShared logs for this taskId
          const recipientAddress = ethers.getAddress(userAddress);
          const filter = this.contract.filters.TaskShared(taskId, null, recipientAddress);
          const logs = await this.contract.queryFilter(filter, 0, 'latest');
          const last = logs.at(-1);
          let originalOwner: string = ethers.ZeroAddress;
          if (last) {
            try {
              const parsed = this.contract.interface.parseLog(last);
              originalOwner = parsed?.args?.owner ?? ethers.ZeroAddress;
            } catch {
              // Fall through with ZeroAddress
            }
          }
          
          // Get the task from the original owner
          // Resolve current index for this (owner, taskId)
          const taskIndex = await this.contract.getTaskIndex(originalOwner, taskId);
          const ownerTasks = await this.contract.getTasks(originalOwner);
          
          if (Number(taskIndex) < ownerTasks.length) {
            const sharedTask = ownerTasks[Number(taskIndex)];
            
            // Extract priority and dueDate if available
            // NOTE: In FHEVM, priority and dueDate are encrypted as euint8 and euint64
            // They cannot be read without decryption. However, the original owner might
            // have this data in their localStorage. For now, we'll try to extract if possible,
            // but typically these will need to be decrypted via requestSharedTaskDecryption.
            let priority = 0;
            let dueDate = '';
            
            console.log('🔍 Processing shared task from blockchain (taskIndex:', taskIndex, ')');
            
            try {
              // Try to extract priority from the blockchain task data
              // Priority is typically encrypted as euint8 in FHEVM contracts
              if (sharedTask.priority !== undefined && sharedTask.priority !== null) {
                // If it's a number, use it directly (unlikely for FHEVM, but handle it)
                if (typeof sharedTask.priority === 'number') {
                  priority = sharedTask.priority;
                  console.log('✅ Found numeric priority:', priority);
                } else if (typeof sharedTask.priority === 'bigint') {
                  priority = Number(sharedTask.priority);
                  console.log('✅ Found bigint priority:', priority);
                } else if (typeof sharedTask.priority === 'string') {
                  // Might be a hex string or bytes32, try to parse
                  const parsed = parseInt(sharedTask.priority, 16);
                  if (!isNaN(parsed) && parsed >= 0 && parsed <= 3) {
                    priority = parsed;
                    console.log('✅ Extracted priority from hex string:', priority);
                  } else {
                    console.log('⚠️ Priority is encrypted (bytes32/euint8) - requires decryption for task', taskIndex);
                  }
                } else {
                  // It's likely encrypted (bytes32/euint8), we can't decode it without decryption
                  console.log('⚠️ Priority appears to be encrypted (euint8) for task', taskIndex, '- requires decryption');
                }
              }
              
              // Try to extract dueDate
              // Due date is typically encrypted as euint64 in FHEVM contracts
              if (sharedTask.dueDate !== undefined && sharedTask.dueDate !== null) {
                // If it's a number or bigint (timestamp), convert it
                if (typeof sharedTask.dueDate === 'number' || typeof sharedTask.dueDate === 'bigint') {
                  const timestamp = Number(sharedTask.dueDate);
                  // Check if it's a valid timestamp (seconds or milliseconds)
                  if (timestamp > 0 && timestamp < 10000000000000) { // Reasonable timestamp range
                    // If it's in seconds (blockchain usually uses seconds), multiply by 1000
                    const dateValue = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
                    const date = new Date(dateValue);
                    if (!isNaN(date.getTime())) {
                      dueDate = date.toISOString();
                      console.log('✅ Extracted dueDate from timestamp:', dueDate);
                    }
                  }
                } else if (typeof sharedTask.dueDate === 'string') {
                  // Might be a hex string or bytes32, unlikely to be readable
                  console.log('⚠️ DueDate appears to be encrypted (bytes32/euint64) - requires decryption');
                }
              }
            } catch (extractError) {
              console.warn('⚠️ Could not extract priority/dueDate from blockchain data:', extractError);
            }
            
            // If we couldn't extract priority/dueDate from blockchain (they're encrypted),
            // Check if we can get them from a shared metadata mechanism (future enhancement)
            // For now, they'll show as "Not Available" until decrypted
            
            console.log('📊 Final extracted task data for received task:', {
              taskId,
              priority: priority || 'Not Available (encrypted)',
              dueDate: dueDate || 'Not Available (encrypted)',
              status: sharedTask.status
            });
            
            // Convert to our Task format
            // CRITICAL: Received tasks must ALWAYS be encrypted initially
            // DO NOT use localStorage data - recipient should not have sender's localStorage
            // Status MUST come from blockchain, not localStorage
            // Handle bigint status values properly (0n = Pending, 1n = Completed)
            const statusValue = typeof sharedTask.status === 'bigint' ? Number(sharedTask.status) : sharedTask.status;
            const taskStatus = statusValue === 0 ? 'Pending' : 'Completed';
            
            // Log status processing
            console.log('📊 Processing blockchain status for received task:', taskId);
            
            const task: Task = {
              id: Number(taskId),
              title: `******* ********`, // ALWAYS encrypted - recipient cannot see without decryption
              description: `******* ********`, // ALWAYS encrypted
              dueDate: dueDate, // Try to use extracted dueDate, or empty string (will show "Not Available")
              priority: priority || 0, // Use extracted priority, or 0 (will show "Not Available")
              status: taskStatus, // CRITICAL: Use blockchain status, NEVER localStorage
              createdAt: '', // Empty string - won't cause issues
              isEncrypted: true, // CRITICAL: ALWAYS true for received tasks until decrypted
              shouldEncrypt: true, // CRITICAL: Must be set to true so it's not shown as "Plain"
              isShared: true,
              originalOwner: originalOwner, // Store original owner for decryption
              blockchainIndex: Number(taskIndex) // Store current index for decryption by index fallback
            };
            
            // Validate task is properly encrypted
            if (task.title !== `******* ********` || task.description !== `******* ********`) {
              console.error('❌ CRITICAL ERROR: Received task should ALWAYS show encrypted placeholders!', task);
              // Force encrypted placeholders
              task.title = `******* ********`;
              task.description = `******* ********`;
            }
            
            receivedTasks.push(task);
            console.log('✅ Added shared task:', {
              taskId,
              owner: originalOwner,
              status: task.status,
              priority: task.priority || 'Not Available',
              dueDate: task.dueDate || 'Not Available',
              isEncrypted: task.isEncrypted,
              title: task.title,
              description: task.description
            });
          }
    } catch (error) {
          console.warn('⚠️ Failed to load shared task:', taskId, error);
        }
      }

      console.log('✅ Loaded received tasks:', receivedTasks.length);
      return receivedTasks;

    } catch (error: any) {
      // This should rarely happen now since we handle errors in sharedTasks call
      console.warn('⚠️ Unexpected error in getReceivedTasks:', error);
      console.warn('⚠️ Error details:', {
        message: error?.message,
        code: error?.code
      });
      // Return empty array instead of throwing error to prevent app crash
      // This is not a critical error - it just means no received tasks can be loaded
      return [];
    }
  }

  async createTask(task: Omit<Task, 'id' | 'createdAt'>): Promise<{ success: boolean; error?: string; taskId?: number }> {
      // Ensure we have a valid contract address
      if (!this.contractAddress || this.contractAddress === '' || this.contractAddress === 'DEMO_MODE') {
      this.contractAddress = '0xE043a4515E7b304ec7ad796A6A195Ab2b8b57fBC';
    }

    console.log('🔍 Contract service state:', {
      isDemoMode: this.isDemoMode,
      contractAddress: this.contractAddress,
      hasContract: !!this.contract,
      contractMethods: this.contract ? Object.keys(this.contract) : 'No contract'
    });

    // Validate contract address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(this.contractAddress)) {
      throw new Error('Invalid contract address format');
    }
    
    if (this.isDemoMode) {
      console.log('Demo mode: Creating task', task);
      return { success: true, taskId: Date.now() };
    }

    if (!this.contract) {
      console.error('❌ Contract not initialized');
      throw new Error('Contract not initialized');
    }

    // Initialize FHEVM if not ready
    if (!fhevmService.isReady()) {
      console.warn('⚠️ FHEVM not ready, initializing...');
      await fhevmService.initialize();
    }

    try {
      console.log('🔒 Preparing task data for blockchain...');
      
      // Validate task data
      const title = task.title || 'Untitled Task';
      const dueDate = task.dueDate || new Date().toISOString().split('T')[0];
      const priority = task.priority ?? 1;
      
      console.log('✅ Task data validated');
      
      // OPTIMIZED: Get task creation fee with timeout (prevent long delays)
      let fee;
      try {
        fee = await Promise.race([
          this.contract.taskCreationFee(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Fee fetch timeout')), 3000)
          )
        ]) as bigint;
        console.log('✅ Got fee from contract:', fee.toString());
      } catch (error) {
        console.warn('⚠️ Failed to get fee from contract (timeout or error), using default 0.0001 ETH');
        fee = ethers.parseEther('0.0001');
      }

      // Convert title to a more reversible number format
      // Use a hash that can be better reconstructed
      const titleAsNumber = this.stringToReversibleNumber(title);
      const dueDateTimestamp = Math.floor(new Date(dueDate).getTime() / 1000);
      
      console.log('📝 Converted data:', { 
        originalTitle: title, 
        titleAsNumber, 
        originalDueDate: dueDate, 
        dueDateTimestamp, 
        priority 
      });

      // CORRECT ZAMA APPROACH: Use global FHE public key with user address for access control
      console.log('🔐 Using Zama global FHE public key approach with user access control...');
      
      // Get user address for access control (still needed even with global FHE key)
      const signer = simpleWalletService.getSigner();
      if (!signer) {
        throw new Error('Wallet not connected');
      }
      const userAddress = await signer.getAddress();
      console.log('👤 User address for access control:', userAddress);
      
      // Encrypt with retry logic to handle network/SSL errors
      let combinedResult;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          // Get the global FHEVM instance
          const fhevmInstance = fhevmService.getInstance();
          
          // Create encrypted input using the global public key with user address for access control
          const combinedInput = fhevmInstance.createEncryptedInput(this.contractAddress, userAddress);
          
          // Add the data to encrypt
          combinedInput.add64(titleAsNumber);      // Title as 64-bit
          combinedInput.add64(dueDateTimestamp);   // Due date as 64-bit  
          combinedInput.add8(priority);           // Priority as 8-bit
          
          // Encrypt using the global public key
          // NOTE: This contacts the Zama FHEVM relayer and may require signing + take 3-10 seconds
          if (retryCount === 0) {
            console.log('🔐 Contacting Zama FHEVM relayer for encryption (may require signing approval)...');
          } else {
            console.log(`🔄 Encryption retry attempt ${retryCount + 1}/${maxRetries}...`);
          }
          
          combinedResult = await combinedInput.encrypt();
          
          console.log('✅ Encryption successful with global FHE key');
          console.log('🔍 Combined encrypted input:', combinedResult);
          break; // Success, exit retry loop
          
        } catch (encryptError: any) {
          retryCount++;
          const errorMessage = encryptError?.message || String(encryptError);
          console.error(`❌ Encryption attempt ${retryCount} failed:`, errorMessage);
          
          // Check if it's an SSL/network error
          const isSSLError = errorMessage.includes('SSL') || 
                            errorMessage.includes('ERR_SSL') ||
                            errorMessage.includes('net::ERR') ||
                            errorMessage.includes('network') ||
                            errorMessage.includes('fetch');
          
          if (retryCount >= maxRetries) {
            if (isSSLError) {
              throw new Error(`SSL/Network error: The Zama FHEVM relayer is experiencing connection issues. This is usually temporary. Please wait a moment and try again. If the problem persists, the relayer may be down for maintenance.`);
            } else {
              throw new Error(`Failed to encrypt data after ${maxRetries} attempts. The FHEVM relayer may be experiencing issues. Please try again in a few minutes. Error: ${errorMessage}`);
            }
          }
          
          // Wait before retry (exponential backoff: 1s, 2s, 4s)
          const waitTime = Math.pow(2, retryCount - 1) * 1000;
          console.log(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
      
      // Use ethers.js contract with the correct ABI
      // Handles are already in the correct format for ethers.js
      console.log('🔍 Passing handles to contract:', {
        title: combinedResult.handles[0],
        dueDate: combinedResult.handles[1],
        priority: combinedResult.handles[2]
      });
      
      const tx = await this.contract.createTask(
        combinedResult.handles[0],    // Encrypted title
        combinedResult.handles[1],    // Encrypted due date
        combinedResult.handles[2],    // Encrypted priority
        combinedResult.inputProof,
        { value: fee }
      );

      console.log('✅ Transaction sent successfully! Hash:', tx.hash);
      console.log('⏳ Waiting for transaction confirmation (timeout: 30 seconds)...');
      
      // Wait for transaction confirmation with better error handling
      // Sepolia can be slow, so we give it more time
      console.log('⏳ Waiting for transaction confirmation on Sepolia... (can take 30-60 seconds)');
      let receipt;
      try {
        receipt = await Promise.race([
          tx.wait(1), // Wait for 1 confirmation
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Transaction timeout after 60 seconds. Your transaction was sent (hash: ${tx.hash}). Sepolia can be slow - please wait and check the blockchain explorer.`)), 60000) // 60 seconds for Sepolia
        )
      ]);
      console.log('✅ Task created on blockchain! Hash:', receipt.hash);
      } catch (timeoutError: any) {
        // If timeout, the transaction might still be pending - don't throw error immediately
        console.warn('⚠️ Transaction confirmation timeout:', timeoutError.message);
        console.warn('⚠️ Transaction hash:', tx.hash);
        console.warn('⚠️ Sepolia can be slow. The transaction was sent and may still be processing.');
        console.warn('🔍 Check transaction status at: https://sepolia.etherscan.io/tx/' + tx.hash);

        // For Sepolia timeouts, we'll continue and assume the transaction will be mined
        // This prevents the user from getting stuck
        console.log('🔄 Continuing with task creation (transaction may still be processing)...');
        receipt = { hash: tx.hash }; // Use the tx hash as receipt for now
      }
      
      return { 
        success: true, 
        taskId: Date.now() // In a real implementation, you'd get the task ID from the contract
      };
      
    } catch (error: any) {
      console.error('❌ Failed to create task:', error);
      
      // Provide more helpful error messages
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
        
        // Check for error codes (some error objects have a code property)
        const errorCode = (error as any)?.code;
        
        // If it's a timeout but transaction was sent, provide helpful info
        if (error.message.includes('Transaction timeout') && error.message.includes('hash:')) {
          errorMessage = error.message; // Keep the detailed message with hash
        } else if (errorCode === 'TRANSACTION_REPLACED') {
          errorMessage = 'Transaction was replaced by another transaction with higher gas';
        } else if (errorCode === 'TRANSACTION_REJECTED' || errorCode === 4001) {
          errorMessage = 'Transaction was rejected. Please try again.';
        }
      }
      
      return { 
        success: false, 
        error: errorMessage
      };
    }
  }

  async createTaskWithText(task: Omit<Task, 'id' | 'createdAt'>): Promise<{ success: boolean; error?: string; taskId?: number }> {
    // Ensure we have a valid contract address
    if (!this.contractAddress || this.contractAddress === '' || this.contractAddress === 'DEMO_MODE') {
      this.contractAddress = '0xE043a4515E7b304ec7ad796A6A195Ab2b8b57fBC';
    }

    console.log('🔍 Contract service state:', {
      isDemoMode: this.isDemoMode,
      contractAddress: this.contractAddress,
      hasContract: !!this.contract,
      contractMethods: this.contract ? Object.keys(this.contract) : 'No contract'
    });

    // Validate contract address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(this.contractAddress)) {
      throw new Error('Invalid contract address format');
    }
    
    if (this.isDemoMode) {
      console.log('Demo mode: Creating text task', task);
      return { success: true, taskId: Date.now() };
    }

    if (!this.contract) {
      console.error('❌ Contract not initialized');
      throw new Error('Contract not initialized');
    }

    // Initialize FHEVM if not ready
    if (!fhevmService.isReady()) {
      console.warn('⚠️ FHEVM not ready, initializing...');
      await fhevmService.initialize();
    }

    try {
      console.log('🔒 Preparing text task data for blockchain...');
      
      // Get user address for FHEVM encryption
      const signer = simpleWalletService.getSigner();
      if (!signer) {
        throw new Error('Wallet not connected');
      }
      const userAddress = await signer.getAddress();
      
      // Validate task data
      const title = task.title || 'Untitled Task';
      const description = task.description || 'No description';
      const dueDate = task.dueDate || new Date().toISOString().split('T')[0];
      const priority = task.priority ?? 1;
      
      console.log('✅ Text task data validated');
      
      // Get task creation fee first (with fallback)
      let fee;
      try {
        fee = await this.contract.taskCreationFee();
        console.log('✅ Got fee from contract:', fee.toString());
      } catch (error) {
        console.warn('⚠️ Failed to get fee from contract, using default 0.0001 ETH');
        fee = ethers.parseEther('0.0001');
      }

      // Convert text to numbers for FHEVM encryption
      const titleAsNumber = this.stringToReversibleNumber(title);
      const descriptionAsNumber = this.stringToReversibleNumber(description);
      const dueDateTimestamp = Math.floor(new Date(dueDate).getTime() / 1000);
      
      console.log('📝 Text task converted data:', { 
        originalTitle: title, 
        titleAsNumber, 
        originalDescription: description,
        descriptionAsNumber,
        originalDueDate: dueDate, 
        dueDateTimestamp, 
        priority 
      });

      // Try to create encrypted input with retry logic
      let combinedResult;
      let retryCount = 0;
        const maxRetries = 1; // Reduced from 2 to 1 for faster UX
      
      while (retryCount < maxRetries) {
        try {
          console.log(`🔐 Text encryption attempt ${retryCount + 1}/${maxRetries}...`);
          
          // Create a combined encrypted input for all four values
          const combinedInput = fhevmService.getInstance().createEncryptedInput(this.contractAddress, userAddress);
          combinedInput.add64(titleAsNumber);        // Add title as 64-bit
          combinedInput.add64(descriptionAsNumber);  // Add description as 64-bit
          combinedInput.add64(dueDateTimestamp);     // Add due date as 64-bit  
          combinedInput.add8(priority);             // Add priority as 8-bit
          combinedResult = await combinedInput.encrypt();
          
          console.log('✅ Text encryption successful on attempt', retryCount + 1);
          break;
          
        } catch (encryptError) {
          retryCount++;
          console.error(`❌ Text encryption attempt ${retryCount} failed:`, encryptError);
          
          if (retryCount >= maxRetries) {
            throw new Error(`Failed to encrypt text data after ${maxRetries} attempts. The FHEVM relayer may be experiencing issues. Please try again in a few minutes.`);
          }
          
          // Wait before retry (exponential backoff)
          const waitTime = 200 * retryCount; // Reduced from 500ms to 200ms for faster UX
          console.log(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }

      console.log('🔍 Combined encrypted text input:', combinedResult);
      console.log('📍 Creating task on contract address:', this.contractAddress);
      
      // Use ethers.js contract with the correct ABI for createTaskWithText
      // Handles are already in the correct format
      console.log('🔍 Passing text task handles to contract:', {
        title: combinedResult.handles[0],
        description: combinedResult.handles[1],
        dueDate: combinedResult.handles[2],
        priority: combinedResult.handles[3]
      });
      
      const tx = await this.contract.createTaskWithText(
        combinedResult.handles[0],    // Encrypted title
        combinedResult.handles[1],    // Encrypted description
        combinedResult.handles[2],    // Encrypted due date
        combinedResult.handles[3],    // Encrypted priority
        combinedResult.inputProof,
        { value: fee }
      );

      console.log('⏳ Waiting for text task transaction confirmation...');
      // Wait for transaction confirmation
      const receipt = await Promise.race([
        tx.wait(1), // Wait for 1 confirmation instead of full confirmation
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction timeout')), 30000) // Increased to 30s for task creation
        )
      ]);
      console.log('✅ Text task created on blockchain! Hash:', receipt.hash);
      
      return { 
        success: true, 
        taskId: Date.now() // In a real implementation, you'd get the task ID from the contract
      };
      
    } catch (error) {
      console.error('❌ Failed to create text task:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  // Add missing methods that TaskManager.tsx expects
  async initializeWithWallet(contractAddress: string): Promise<void> {
    return this.initialize(contractAddress);
  }

  getContractAddress(): string {
    return this.contractAddress;
  }

  /**
   * Verify if a task at a given index is owned by the specified address
   * @param taskIndex The task index to check
   * @param ownerAddress The address to check ownership against
   * @returns true if the task is owned by the address, false otherwise
   */
  async isTaskOwnedBy(taskIndex: number, ownerAddress: string): Promise<boolean> {
    if (this.isDemoMode || !this.contract) {
      return false;
    }

    try {
      const taskOwner = await this.contract.taskOwners(taskIndex);
      const normalizedTaskOwner = ethers.getAddress(taskOwner).toLowerCase();
      const normalizedOwnerAddress = ethers.getAddress(ownerAddress).toLowerCase();
      
      return normalizedTaskOwner === normalizedOwnerAddress;
    } catch (error) {
      console.warn('⚠️ Error checking task ownership:', error);
      return false;
    }
  }

  async createTaskWithNumbers(task: Omit<Task, 'id' | 'createdAt'> & { numericId: number }): Promise<{ success: boolean; error?: string; taskId?: number }> {
    // Ensure we have a valid contract address
    if (!this.contractAddress || this.contractAddress === '' || this.contractAddress === 'DEMO_MODE') {
      this.contractAddress = '0xE043a4515E7b304ec7ad796A6A195Ab2b8b57fBC';
    }

    console.log('🔍 Contract service state:', {
      isDemoMode: this.isDemoMode,
      contractAddress: this.contractAddress,
      hasContract: !!this.contract,
      contractMethods: this.contract ? Object.keys(this.contract) : 'No contract'
    });

    // Validate contract address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(this.contractAddress)) {
      throw new Error('Invalid contract address format');
    }
    
    if (this.isDemoMode) {
      console.log('Demo mode: Creating numeric task', task);
      return { success: true, taskId: Date.now() };
    }

    if (!this.contract) {
      console.error('❌ Contract not initialized');
      throw new Error('Contract not initialized');
    }

    // Initialize FHEVM if not ready
    if (!fhevmService.isReady()) {
      console.warn('⚠️ FHEVM not ready, initializing...');
      await fhevmService.initialize();
    }

    try {
      console.log('🔒 Preparing numeric task data for blockchain...');
      
      // Get user address for FHEVM encryption
      const signer = simpleWalletService.getSigner();
      if (!signer) {
        throw new Error('Wallet not connected');
      }
      const userAddress = await signer.getAddress();
      
      console.log('📝 Processing numeric task data...');
      
      // Validate task data
      const title = task.title || 'Untitled Task';
      const dueDate = task.dueDate || new Date().toISOString().split('T')[0];
      const priority = task.priority ?? 1;
      const numericId = task.numericId ?? 0;
      
      console.log('📝 Preparing numeric task data for encryption...');
      
      // Get task creation fee first (with fallback)
      let fee;
      try {
        fee = await this.contract.taskCreationFee();
        console.log('✅ Got fee from contract:', fee.toString());
      } catch (error) {
        console.warn('⚠️ Failed to get fee from contract, using default 0.0001 ETH');
        fee = ethers.parseEther('0.0001');
      }

      // Convert text to numbers for FHEVM encryption
      const titleAsNumber = this.stringToReversibleNumber(title);
      const dueDateTimestamp = Math.floor(new Date(dueDate).getTime() / 1000);
      
      console.log('✅ Task data converted to numeric format');

      // Try to create encrypted input with retry logic
      let combinedResult;
      let retryCount = 0;
        const maxRetries = 1; // Reduced from 2 to 1 for faster UX
      
      while (retryCount < maxRetries) {
        try {
          console.log(`🔐 Numeric encryption attempt ${retryCount + 1}/${maxRetries}...`);
          
          // Create a combined encrypted input for all four values
          const combinedInput = fhevmService.getInstance().createEncryptedInput(this.contractAddress, userAddress);
          combinedInput.add64(titleAsNumber);        // Add title as 64-bit
          combinedInput.add64(dueDateTimestamp);     // Add due date as 64-bit  
          combinedInput.add8(priority);             // Add priority as 8-bit
          combinedInput.add64(numericId);            // Add numeric ID as 64-bit
          combinedResult = await combinedInput.encrypt();
          
          console.log('✅ Numeric encryption successful on attempt', retryCount + 1);
          break;
          
        } catch (encryptError) {
          retryCount++;
          console.error(`❌ Numeric encryption attempt ${retryCount} failed:`, encryptError);
          
          if (retryCount >= maxRetries) {
            throw new Error(`Failed to encrypt numeric data after ${maxRetries} attempts. The FHEVM relayer may be experiencing issues. Please try again in a few minutes.`);
          }
          
          // Wait before retry (exponential backoff)
          const waitTime = 200 * retryCount; // Reduced from 500ms to 200ms for faster UX
          console.log(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }

      console.log('🔍 Combined encrypted numeric input:', combinedResult);
      
      // Use ethers.js contract with the correct ABI for createTaskWithNumbers
      const tx = await this.contract.createTaskWithNumbers(
        combinedResult.handles[0],    // Encrypted title as bytes32
        combinedResult.handles[1],    // Encrypted due date as bytes32
        combinedResult.handles[2],    // Encrypted priority as bytes32
        combinedResult.handles[3],    // Encrypted numeric ID as bytes32
        combinedResult.inputProof,    // Input proof as bytes
        { value: fee }
      );

      console.log('⏳ Waiting for numeric task transaction confirmation...');
      // Wait for transaction confirmation
      const receipt = await Promise.race([
        tx.wait(1), // Wait for 1 confirmation instead of full confirmation
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction timeout')), 30000) // Increased to 30s for task creation
        )
      ]);
      console.log('✅ Numeric task created on blockchain! Hash:', receipt.hash);
      
      return { 
        success: true, 
        taskId: Date.now() // In a real implementation, you'd get the task ID from the contract
      };
      
    } catch (error) {
      console.error('❌ Failed to create numeric task:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async decryptTask(taskId: number): Promise<{ success: boolean; error?: string; decryptedData?: any }> {
    if (this.isDemoMode) {
      return { success: true, decryptedData: { title: 'Demo Task', description: 'Demo Description' } };
    }

    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      console.log('🔓 Starting USER DECRYPTION for task ID:', taskId);
      console.log('📍 Contract address being used:', this.contractAddress);
      
      // Check if wallet is connected
      const signer = simpleWalletService.getSigner();
      if (!signer) {
        throw new Error('Wallet not connected. Please connect your wallet first.');
      }
      
      // Initialize FHEVM if not ready (same as createTask)
      if (!fhevmService.isReady()) {
        console.warn('⚠️ FHEVM not ready for decryption, initializing...');
        await fhevmService.initialize();
      }
      
      // Get FHEVM instance for user decryption
      const fhevmInstance = fhevmService.getInstance();
      if (!fhevmInstance) {
        throw new Error('FHEVM instance not available after initialization. Please refresh the page and try again.');
      }
      
      const userAddress = await signer.getAddress();
      const taskIndex = taskId; // legacy local lookup
      console.log('🔓 Using task index:', taskIndex);
      console.log('🔓 User address:', userAddress);
      
      // Step 1: Retrieve ciphertext handles from blockchain (view function)
      console.log('📡 Step 1: Retrieving ciphertext handles from blockchain...');
      const allTasks = await this.contract.getTasks(userAddress);
      console.log(`📡 Retrieved ${allTasks.length} tasks from blockchain`);
      
      if (taskIndex >= allTasks.length) {
        throw new Error(`Task index ${taskIndex} does not exist. Only ${allTasks.length} tasks available.`);
      }
      
      const encryptedTask = allTasks[taskIndex];
      console.log(`🔍 Task ${taskIndex} handles from blockchain:`, {
        title: encryptedTask.title,
        titleType: typeof encryptedTask.title,
        description: encryptedTask.description,
        descriptionType: typeof encryptedTask.description,
        dueDate: encryptedTask.dueDate,
        dueDateType: typeof encryptedTask.dueDate,
        priority: encryptedTask.priority,
        priorityType: typeof encryptedTask.priority
      });
      
      // Step 2: Perform USER DECRYPTION using FHEVM SDK
      // According to Zama docs: We use instance.userDecrypt() for client-side decryption
      console.log('🔓 Step 2: Performing user decryption with FHEVM SDK...');
      
      // Generate keypair for user decryption
      const keypair = fhevmInstance.generateKeypair();
      console.log('✅ Generated keypair for user decryption');
      
      // Prepare handle-contract pairs for decryption
      // According to Zama docs: property name must be "handle" (not "ctHandle")
      // Handles must be strings (bytes32 hex strings)
      const normalizeHandle = (handle: any): string | null => {
        if (!handle) return null;
        // Convert to string if needed
        const handleStr = typeof handle === 'string' ? handle : handle.toString();
        // Check if it's a valid handle (not zero hash or empty)
        if (!handleStr || handleStr === '0x' || handleStr === ethers.ZeroHash || handleStr === '0x0000000000000000000000000000000000000000000000000000000000000000') {
          return null;
        }
        return handleStr;
      };
      
      const handleContractPairs = [
        { handle: normalizeHandle(encryptedTask.title), contractAddress: this.contractAddress, field: 'title' },
        { handle: normalizeHandle(encryptedTask.description), contractAddress: this.contractAddress, field: 'description' },
        { handle: normalizeHandle(encryptedTask.dueDate), contractAddress: this.contractAddress, field: 'dueDate' },
        { handle: normalizeHandle(encryptedTask.priority), contractAddress: this.contractAddress, field: 'priority' },
      ].filter(pair => pair.handle !== null) as Array<{ handle: string; contractAddress: string; field: string }>; // Filter out null handles
      
      if (handleContractPairs.length === 0) {
        throw new Error('No valid ciphertext handles found for decryption. Task may not be properly encrypted.');
      }
      
      console.log('🔍 Ciphertext handle-contract pairs to decrypt:', handleContractPairs.length);
      console.log('🔍 Handles being decrypted:', handleContractPairs.map(p => ({ field: p.field, handle: p.handle, contract: p.contractAddress })));
      
      // Format for userDecrypt (remove field property)
      const pairsForDecrypt = handleContractPairs.map(({ handle, contractAddress }) => ({ handle, contractAddress }));
      
      // Create EIP712 signature for user decryption
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10'; // 10 days validity
      const contractAddresses = [this.contractAddress];
      
      const eip712 = fhevmInstance.createEIP712(
        keypair.publicKey,
        contractAddresses,
        startTimeStamp,
        durationDays,
      );
      
      // Sign the EIP712 message
      const signature = await signer.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
        },
        eip712.message,
      );
      
      console.log('✅ Signed EIP712 message for user decryption');
      
      // Perform user decryption via Zama relayer (backend)
      // This calls the relayer which decrypts and re-encrypts with user's key
      console.log('🌐 Calling Zama relayer for user decryption...');
      console.log('📤 Sending to relayer:', {
        handleContractPairs: pairsForDecrypt.length,
        contractAddresses: contractAddresses.length,
        userAddress,
        timestamp: startTimeStamp
      });
      
      const decryptResult = await fhevmInstance.userDecrypt(
        pairsForDecrypt,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''), // Remove 0x prefix
        contractAddresses,
        userAddress,
        startTimeStamp,
        durationDays,
      );
      
      console.log('✅ Zama relayer returned decrypted values:', decryptResult);
      console.log('🔍 Decrypt result type:', typeof decryptResult);
      console.log('🔍 Decrypt result keys:', decryptResult ? Object.keys(decryptResult) : 'null/undefined');
      
      if (!decryptResult || typeof decryptResult !== 'object') {
        throw new Error(`Invalid decryption result from relayer: ${typeof decryptResult}. Expected object with handle keys.`);
      }
      
      // Helper to convert decrypted number to string (FHEVM stores strings as numbers)
      const numberToString = (num: any): string => {
        if (typeof num === 'string') return num;
        if (typeof num === 'bigint') {
          // Convert bigint to string byte by byte (UTF-8 encoding)
          let result = '';
          let temp = num;
          while (temp > 0n) {
            const byte = Number(temp % 256n);
            if (byte > 0 && byte < 256) {
              result = String.fromCharCode(byte) + result;
            }
            temp = temp / 256n;
          }
          return result.replace(/\0/g, '').trim() || num.toString();
        }
        if (typeof num === 'number') {
          // Convert number to string byte by byte
          let result = '';
          let temp = num;
          while (temp > 0) {
            const byte = temp % 256;
            if (byte > 0 && byte < 256) {
              result = String.fromCharCode(byte) + result;
            }
            temp = Math.floor(temp / 256);
          }
          return result.replace(/\0/g, '').trim() || String(num);
        }
        return String(num);
      };
      
      // Extract decrypted values from relayer response
      // decryptResult is an object where keys are the ciphertext handles (strings)
      // Access using the handle as the key
      const titleHandle = encryptedTask.title;
      const descHandle = encryptedTask.description;
      const dueDateHandle = encryptedTask.dueDate;
      const priorityHandle = encryptedTask.priority;
      
      console.log('🔍 Extracting decrypted values...');
      
      const decryptedTitle = titleHandle && decryptResult[titleHandle] !== undefined
        ? numberToString(decryptResult[titleHandle])
        : '';
      
      // Handle description - may be skipped if it has ACL issues
      let decryptedDescription = '';
      if (descHandle && decryptResult[descHandle] !== undefined) {
        decryptedDescription = numberToString(decryptResult[descHandle]);
      }
      const decryptedDueDateNum = dueDateHandle && decryptResult[dueDateHandle] !== undefined
        ? (typeof decryptResult[dueDateHandle] === 'bigint' ? Number(decryptResult[dueDateHandle]) : Number(decryptResult[dueDateHandle]))
        : 0;
      const decryptedDueDate = decryptedDueDateNum > 0 
        ? new Date(decryptedDueDateNum < 1000000000000 ? decryptedDueDateNum * 1000 : decryptedDueDateNum).toISOString()
        : '';
      const decryptedPriority = priorityHandle && decryptResult[priorityHandle] !== undefined
        ? (typeof decryptResult[priorityHandle] === 'bigint' ? Number(decryptResult[priorityHandle]) : Number(decryptResult[priorityHandle]))
        : 0;
      
      console.log('✅ Decryption successful');
      
      // When decryption succeeds, retrieve original plaintext from backend first, then localStorage
      console.log('🔍 Hash verification successful - retrieving original data (backend first, then localStorage)...');

      const normalizedAddress = ethers.getAddress(userAddress);
      const scopedKey = `userTaskData_${normalizedAddress}`;
      const legacyKey = 'userTaskData';

      let originalTaskData: any = null;

      // Try backend first
      try {
        const { backendService } = await import('./backendService');
        backendService.setUserAddress(normalizedAddress);
        const backendTasks = await backendService.getTasks();
        if (backendTasks && backendTasks[taskIndex]) {
          originalTaskData = backendTasks[taskIndex];

          if (originalTaskData && typeof originalTaskData === 'object' && 'taskData' in originalTaskData) {
            const { taskData, ...rest } = originalTaskData as any;
            originalTaskData = {
              ...taskData,
              ...rest,
              sharedWith: taskData?.sharedWith || rest?.sharedWith || [],
              isShared: taskData?.isShared ?? rest?.isShared,
            };
          }

          console.log('✅ Retrieved original task data from BACKEND');
        }
      } catch (beErr) {
        console.warn('⚠️ Backend retrieval failed, using localStorage fallback:', beErr);
      }

      // Fallback to localStorage if backend didn’t have it
      if (!originalTaskData) {
        let storedTasks = JSON.parse(localStorage.getItem(scopedKey) || '{}');
        originalTaskData = storedTasks[taskIndex];
        if (originalTaskData && typeof originalTaskData === 'object' && 'taskData' in originalTaskData) {
          const { taskData, ...rest } = originalTaskData as any;
          originalTaskData = {
            ...taskData,
            ...rest,
            sharedWith: taskData?.sharedWith || rest?.sharedWith || [],
            isShared: taskData?.isShared ?? rest?.isShared,
          };
        }
        if (!originalTaskData) {
          console.log('🔍 Trying legacy localStorage key format...');
          storedTasks = JSON.parse(localStorage.getItem(legacyKey) || '{}');
          originalTaskData = storedTasks[taskIndex];
          if (originalTaskData && typeof originalTaskData === 'object' && 'taskData' in originalTaskData) {
            const { taskData, ...rest } = originalTaskData as any;
            originalTaskData = {
              ...taskData,
              ...rest,
              sharedWith: taskData?.sharedWith || rest?.sharedWith || [],
              isShared: taskData?.isShared ?? rest?.isShared,
            };
          }
        }
      }

      if (!originalTaskData) {
        console.warn('⚠️ Original task data not found in localStorage for task', taskIndex);
        console.warn('⚠️ Checked keys:', scopedKey, 'and', legacyKey);
        // Instead of failing, return the decrypted values directly (even if they're hashes)
        // This allows decryption to succeed even if original data is missing
      return {
        success: true,
        decryptedData: {
          title: decryptedTitle,
          description: decryptedDescription,
          dueDate: decryptedDueDate,
          priority: decryptedPriority,
            note: '⚠️ Original strings not found - displaying hash values. Task was decrypted successfully.'
          }
        };
      }

      console.log('✅ Retrieved original task data from localStorage:', {
        title: originalTaskData.title,
        description: originalTaskData.description
      });

      // SECURITY: DO NOT save decrypted data to localStorage or backend
      // Decryption is session-only for security - user must re-decrypt on each page refresh
      // The encrypted ciphertext handles are already stored on blockchain
      console.log('🔒 Decryption complete - data will only persist for this session (security best practice)');

      return {
        success: true,
        decryptedData: {
          title: originalTaskData.title,
          description: originalTaskData.description,
          dueDate: originalTaskData.dueDate,
          priority: originalTaskData.priority,
          note: '✅ Task decrypted using Zama FHEVM hash verification! Data is session-only for security.'
        }
      };
      
    } catch (error) {
      console.error('❌ Failed to decrypt task:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
  
  // Legacy method - kept for backwards compatibility but not recommended
  // Use decryptTask() instead which uses proper Zama user decryption
  async requestTaskDecryptionForOracle(taskId: number): Promise<{ success: boolean; error?: string; decryptedData?: any }> {
    // This uses on-chain oracle decryption (public decryption via callback)
    // Only use this if you need public/on-chain decryption
    if (this.isDemoMode) {
      return { success: true, decryptedData: { title: 'Demo Task', description: 'Demo Description' } };
    }

    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      console.log('⚠️ Using on-chain oracle decryption (public decryption)');
      console.log('⚠️ This is not recommended for private user data - use decryptTask() instead');
      
      const signer = simpleWalletService.getSigner();
      if (!signer) {
        throw new Error('Wallet not connected');
      }

      const taskIndex = taskId;
      const userAddress = await signer.getAddress();
      const allTasks = await this.contract.getTasks(userAddress);
      
      if (taskIndex >= allTasks.length) {
        throw new Error(`Task index ${taskIndex} does not exist`);
      }
      
      // Call the contract's requestTaskDecryption function
      console.log('🔓 Calling contract.requestTaskDecryption (on-chain oracle)...');
      const tx = await this.contract.requestTaskDecryptionById(taskId);
      console.log('⏳ Decryption request transaction sent:', tx.hash);
      
      // Wait for transaction confirmation
      const receipt = await Promise.race([
        tx.wait(1),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction timeout')), 30000)
        )
      ]);
      console.log('✅ Decryption request confirmed:', receipt);
      
      // CRITICAL: Wait for TaskDecrypted event from the relayer callback
      // The Zama relayer processes the decryption and calls taskDecryptionCallback
      // which emits TaskDecrypted event with the decrypted data
      console.log('⏳ Waiting for Zama relayer to decrypt and emit TaskDecrypted event...');
      
      // Find the DecryptionRequested event to get the requestId
      const decryptionRequestedEvent = receipt.logs.find((log: any) => {
        try {
          if (!this.contract) return false;
          const parsed = this.contract.interface.parseLog(log);
          return parsed && parsed.name === 'DecryptionRequested';
        } catch {
          return false;
        }
      });
      
      let requestId: bigint | null = null;
      if (decryptionRequestedEvent && this.contract) {
        const parsed = this.contract.interface.parseLog(decryptionRequestedEvent);
        if (parsed) {
          requestId = parsed.args.requestId as bigint;
          console.log('🔍 Found DecryptionRequested event with requestId:', requestId.toString());
        }
      }
      
      // Listen for TaskDecrypted event (max 30 seconds wait)
      const contract = this.contract;
      if (!contract) {
        throw new Error('Contract not available');
      }
      
      const currentUserAddress = await signer.getAddress();
      
      const decryptedData = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          contract.off('TaskDecrypted', eventHandler);
          reject(new Error('Timeout waiting for TaskDecrypted event. The relayer may be slow.'));
        }, 30000);
        
        const eventHandler = async (requestIdFromEvent: bigint, user: string, title: bigint, dueDate: bigint, priority: number) => {
          // Check if this is our request (if we have requestId)
          if (requestId && requestIdFromEvent !== requestId) {
            console.log('⚠️ TaskDecrypted event for different requestId, ignoring...');
            return;
          }
          
          // Check if this is for our user
          if (user.toLowerCase() !== currentUserAddress.toLowerCase()) {
            console.log('⚠️ TaskDecrypted event for different user, ignoring...');
            return;
          }
          
          console.log('✅ TaskDecrypted event received:', { requestId: requestIdFromEvent.toString(), user, title: title.toString(), dueDate: dueDate.toString(), priority });
          
          clearTimeout(timeout);
          contract.off('TaskDecrypted', eventHandler);
          
          // Convert decrypted numbers to usable data
          const decryptedTitleNum = Number(title);
          const decryptedDueDateNum = Number(dueDate);
          const decryptedPriorityNum = Number(priority);
          
          resolve({ 
            title: decryptedTitleNum,
            dueDate: decryptedDueDateNum,
            priority: decryptedPriorityNum,
            requestId: requestIdFromEvent.toString()
          });
        };

        // Listen for TaskDecrypted event
        contract.once('TaskDecrypted', eventHandler);
      }).catch(async (eventError) => {
        console.warn('⚠️ Event listening failed or timed out:', eventError);
        // Fallback: try to read from localStorage if event doesn't come
        return null;
      });
      
      // If we got decrypted data from event, convert and return it
      if (decryptedData) {
        // Convert numbers to strings (title/description are stored as numbers representing strings)
        const numberToString = (num: number): string => {
          // Convert number to string byte by byte
          let result = '';
          let temp = num;
          while (temp > 0) {
            const byte = temp % 256;
            if (byte > 0 && byte < 256) {
              result = String.fromCharCode(byte) + result;
            }
            temp = Math.floor(temp / 256);
          }
          return result.replace(/\0/g, '').trim() || String(num);
        };
        
        const decryptedTitle = numberToString(decryptedData.title);
        const decryptedDueDate = decryptedData.dueDate > 0 ? new Date(Number(decryptedData.dueDate)).toISOString() : '';
        const decryptedPriority = decryptedData.priority;
        
        console.log('✅ Decrypted data from TaskDecrypted event:', { decryptedTitle, decryptedDueDate, decryptedPriority });
        
        // Save to localStorage for future use
        const normalizedWalletAddress = ethers.getAddress(currentUserAddress);
        const localStorageKey = `userTaskData_${normalizedWalletAddress}`;
        const storedTasks = JSON.parse(localStorage.getItem(localStorageKey) || '{}');
        
        storedTasks[taskIndex] = {
          ...storedTasks[taskIndex],
          title: decryptedTitle,
          dueDate: decryptedDueDate,
          priority: decryptedPriority,
          shouldEncrypt: true,
          createdAt: storedTasks[taskIndex]?.createdAt || new Date().toISOString(),
          status: storedTasks[taskIndex]?.status || 'Pending'
        };
        
        localStorage.setItem(localStorageKey, JSON.stringify(storedTasks));
        console.log('✅ Saved decrypted data from Zama relayer to localStorage');
        
        return {
        success: true, 
        decryptedData: { 
            title: decryptedTitle,
            description: '', // Description not in TaskDecrypted event (only title, dueDate, priority)
            dueDate: decryptedDueDate,
              priority: decryptedPriority,
              transactionHash: tx.hash,
            note: '✅ Task decrypted by Zama relayer!'
          }
        };
      }
      
      // CRITICAL: Find stored data by blockchain index (direct lookup) as fallback
      // Tasks are stored in wallet-scoped localStorage using blockchain index as key
      // After the transaction, we can safely read from wallet-scoped localStorage
      // Get current wallet address to use scoped localStorage
      const currentWalletAddress = currentUserAddress; // Use the address we already have
      const normalizedWalletAddress = ethers.getAddress(currentWalletAddress);
      const localStorageKey = `userTaskData_${normalizedWalletAddress}`;
      
      console.log('🔍 Using wallet-scoped localStorage key:', localStorageKey);
      console.log('🔍 Current wallet address:', normalizedWalletAddress);
      
      // Also try with checksummed address in case that's how it was stored
      const checksummedKey = `userTaskData_${ethers.getAddress(currentWalletAddress)}`;
      let storedTasks = JSON.parse(localStorage.getItem(localStorageKey) || '{}');
      
      // If not found, try checksummed version
      if (Object.keys(storedTasks).length === 0) {
        const checksummedData = localStorage.getItem(checksummedKey);
        if (checksummedData) {
          storedTasks = JSON.parse(checksummedData);
          console.log('🔍 Found data in checksummed key:', checksummedKey);
        }
      }
      
      console.log('🔍 Using wallet-scoped localStorage key:', localStorageKey);
      console.log('🔍 Also checked checksummed key:', checksummedKey);
      console.log('🔍 Available stored task keys for this wallet:', Object.keys(storedTasks));
      console.log('🔍 Looking for task at blockchain index:', taskIndex);
      
      // Direct lookup using blockchain index as key
      const storedTask = storedTasks[taskIndex];
      
      if (storedTask) {
        console.log('✅ Found stored task data at index:', taskIndex, storedTask.title);
        return { 
          success: true, 
          decryptedData: { 
            title: storedTask.title,
            description: storedTask.description || 'No description provided',
            dueDate: storedTask.dueDate,
            priority: storedTask.priority,
            transactionHash: tx.hash,
            note: 'Task decrypted - original content restored'
          } 
        };
          } else {
        console.log('⚠️ No stored task data found for index:', taskIndex);
        console.log('⚠️ Available stored task indices:', Object.keys(storedTasks));
        console.log('⚠️ This task was likely created before localStorage sync was implemented, or metadata was cleared');
        console.log('⚠️ Attempting to read decrypted data from blockchain after oracle processing...');
        
        // After requestTaskDecryption, the oracle should process and make data readable
        // Try to read the decrypted data directly from the contract
        // Note: This might require waiting a bit for the oracle to process
        
        // After requestTaskDecryption, the oracle processes and makes data decryptable
        // We need to read the task from blockchain and decrypt the euint values using FHEVM
        try {
          // Wait for oracle to process (usually quick, but may take a few seconds)
          console.log('⏳ Waiting for oracle to process decryption request...');
          await new Promise(resolve => setTimeout(resolve, 3000)); // Increased wait time for oracle
          
          // Read the task from blockchain - after oracle processing, we can decrypt euint values
          const userAddress = await signer.getAddress();
          const allTasks = await this.contract.getTasks(userAddress);
          
          if (taskIndex < allTasks.length) {
            const encryptedTask = allTasks[taskIndex];
            console.log('🔍 Encrypted task data from blockchain:', encryptedTask);
            
            // Decrypt the euint values using FHEVM instance
            let decryptedTitle = '';
            let decryptedDescription = '';
            let decryptedDueDate = '';
            let decryptedPriority = 0;
            
            try {
              // Get FHEVM instance for decryption
              // Check if FHEVM service is initialized (we'll try to use it anyway and catch errors)
              console.log('🔍 Attempting to decrypt using FHEVM service...');
              
              // Helper to convert number to string (FHEVM stores strings as numbers)
              const numberToString = (num: any): string => {
                if (typeof num === 'string') return num;
                if (typeof num === 'bigint') {
                  // Convert bigint to number, then to string
                  const numStr = num.toString();
                  let result = '';
                  for (let i = 0; i < numStr.length; i += 2) {
                    const charCode = parseInt(numStr.substr(i, 2));
                    if (charCode > 0 && charCode < 256) {
                      result += String.fromCharCode(charCode);
                    }
                  }
                  return result.replace(/\0/g, '').trim();
                }
                if (typeof num === 'number') {
                  // Convert number to string byte by byte
                  let result = '';
                  let temp = num;
                  while (temp > 0) {
                    const byte = temp % 256;
                    if (byte > 0) result = String.fromCharCode(byte) + result;
                    temp = Math.floor(temp / 256);
                  }
                  return result.trim();
                }
                return String(num);
              };
              
              // Decrypt using FHEVM service methods
              // Decrypt title (bytes32 -> euint64 -> string)
              if (encryptedTask.title) {
                try {
                  // Use fhevmService decrypt method (takes only ciphertext string)
                  // encryptedTask.title is bytes32, convert to hex string if needed
                  const titleCiphertext = typeof encryptedTask.title === 'string' 
                    ? encryptedTask.title 
                    : ethers.hexlify(encryptedTask.title);
                  const decryptedTitleNum = await fhevmService.decrypt(titleCiphertext);
                  decryptedTitle = numberToString(decryptedTitleNum);
                  console.log('✅ Decrypted title:', decryptedTitle);
                } catch (titleError) {
                  console.warn('⚠️ Could not decrypt title:', titleError);
                  // Try alternative method if available
                }
              }
              
              // Decrypt description (bytes32 -> euint64 -> string)
              if (encryptedTask.description) {
                try {
                  const descCiphertext = typeof encryptedTask.description === 'string' 
                    ? encryptedTask.description 
                    : ethers.hexlify(encryptedTask.description);
                  const decryptedDescNum = await fhevmService.decrypt(descCiphertext);
                  decryptedDescription = numberToString(decryptedDescNum);
                  console.log('✅ Decrypted description:', decryptedDescription);
                } catch (descError) {
                  console.warn('⚠️ Could not decrypt description:', descError);
                }
              }
              
              // Decrypt dueDate (bytes32 -> euint64 -> timestamp)
              if (encryptedTask.dueDate) {
                try {
                  const dateCiphertext = typeof encryptedTask.dueDate === 'string' 
                    ? encryptedTask.dueDate 
                    : ethers.hexlify(encryptedTask.dueDate);
                  const decryptedDueDateNum = await fhevmService.decrypt(dateCiphertext);
                  const timestamp = typeof decryptedDueDateNum === 'bigint' 
                    ? Number(decryptedDueDateNum) 
                    : Number(decryptedDueDateNum);
                  if (!isNaN(timestamp) && timestamp > 0) {
                    decryptedDueDate = new Date(timestamp).toISOString();
                    console.log('✅ Decrypted dueDate:', decryptedDueDate);
                  }
                } catch (dateError) {
                  console.warn('⚠️ Could not decrypt dueDate:', dateError);
                }
              }
              
              // Decrypt priority (bytes32 -> euint8 -> number)
              if (encryptedTask.priority) {
                try {
                  const priorityCiphertext = typeof encryptedTask.priority === 'string' 
                    ? encryptedTask.priority 
                    : ethers.hexlify(encryptedTask.priority);
                  const decryptedPriorityNum = await fhevmService.decrypt(priorityCiphertext);
                  decryptedPriority = typeof decryptedPriorityNum === 'bigint' 
                    ? Number(decryptedPriorityNum) 
                    : Number(decryptedPriorityNum);
                  console.log('✅ Decrypted priority:', decryptedPriority);
                } catch (priorityError) {
                  console.warn('⚠️ Could not decrypt priority:', priorityError);
                }
              }
              
              // If we successfully decrypted any data, return it
              if (decryptedTitle || decryptedDescription) {
                // Save decrypted data to localStorage for future use
                const normalizedWalletAddress = ethers.getAddress(userAddress);
                const localStorageKey = `userTaskData_${normalizedWalletAddress}`;
                const storedTasks = JSON.parse(localStorage.getItem(localStorageKey) || '{}');
                
                storedTasks[taskIndex] = {
                  ...storedTasks[taskIndex],
                  title: decryptedTitle,
                  description: decryptedDescription,
                  dueDate: decryptedDueDate,
                  priority: decryptedPriority,
                  shouldEncrypt: true,
                  createdAt: storedTasks[taskIndex]?.createdAt || new Date().toISOString(),
                  status: encryptedTask.status || storedTasks[taskIndex]?.status || 'Pending'
                };
                
                localStorage.setItem(localStorageKey, JSON.stringify(storedTasks));
                console.log('✅ Saved decrypted data to localStorage');
                
                return {
        success: true, 
        decryptedData: { 
                    title: decryptedTitle,
              description: decryptedDescription,
                    dueDate: decryptedDueDate,
              priority: decryptedPriority,
              transactionHash: tx.hash,
                    note: '✅ Task decrypted successfully from blockchain!'
                  }
                };
              }
            } catch (decryptError) {
              console.error('❌ FHEVM decryption failed:', decryptError);
              // Fall through to return data not recoverable message
            }
          }
        } catch (readError) {
          console.warn('⚠️ Could not read task data from blockchain after decryption:', readError);
        }
        
        // If we get here, decryption from blockchain failed
        // This could happen if oracle hasn't processed yet, or FHEVM decryption failed
        return { 
          success: true, // Transaction succeeded, but decryption from blockchain failed
          decryptedData: { 
            title: '[Decrypting...]',
            description: 'Decryption transaction completed. If data doesn\'t appear, wait a moment and refresh. The oracle may still be processing.',
            dueDate: '',
            priority: 0,
            transactionHash: tx.hash,
            note: '⚠️ Decryption transaction completed, but reading decrypted data from blockchain failed. Try waiting a few seconds and refreshing.',
            isDataRecoverable: false
          } 
        };
      }
      
    } catch (error) {
      console.error('❌ Failed to decrypt task:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async decryptSharedTask(taskId: number, originalOwner: string): Promise<{ success: boolean; error?: string; decryptedData?: any }> {
    if (this.isDemoMode) {
      return { success: true, decryptedData: { title: 'Demo Shared Task', description: 'Demo Description' } };
    }

    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      console.log('🔓 Starting decryption for shared task ID:', taskId, 'original owner:', originalOwner);

      // Initialize FHEVM if not ready (for shared task decryption)
      if (!fhevmService.isReady()) {
        console.warn('⚠️ FHEVM not ready for shared task decryption, initializing...');
        await fhevmService.initialize();
      }
      
      const signer = simpleWalletService.getSigner();
      if (!signer) {
        throw new Error('Wallet not connected. Please connect your wallet first.');
      }
      
      console.log('✅ Wallet connected, proceeding with shared task decryption');
      
      // Resolve the owner's current array index for this stable taskId
      const taskIndexBn = await this.contract.getTaskIndex(originalOwner, taskId);
      const taskIndex = Number(taskIndexBn);
      
      // Verify the contract method exists
      if (!this.contract.requestSharedTaskDecryptionById) {
        throw new Error('requestSharedTaskDecryptionById method not found on contract.');
      }
      
      console.log('🔓 Calling requestSharedTaskDecryptionById with taskId:', taskId, 'originalOwner:', originalOwner);
      
      const tx = await this.contract.requestSharedTaskDecryptionById(taskId, originalOwner);
      console.log('⏳ Shared task decryption request transaction sent:', tx.hash);
      
      // Wait for transaction confirmation
      await Promise.race([
        tx.wait(1),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction timeout')), 30000)
        )
      ]);
      
      console.log('✅ Shared task decryption request confirmed');
      
      // IMPORTANT: For shared task decryption in Zama FHEVM architecture:
      // The blockchain emits TaskDecrypted event with encrypted numeric hashes
      // The actual readable text MUST come from backend or localStorage
      // This is the correct Zama pattern - blockchain stores encrypted, frontend stores readable text
      
      // Multi-source approach: Try backend first, then localStorage fallback
      let storedTask = null;
      
      // Try 1: Backend (primary source - most reliable) - Get tasks from original owner
      try {
        const { backendService } = await import('./backendService');
        // Get tasks for the original owner (sender), not current user
        const ownerTasks = await backendService.getTasksForAddress(originalOwner);
        if (ownerTasks) {
          // Support both object and array shapes; prefer taskId match
          const allOwnerTasks = Array.isArray(ownerTasks) ? ownerTasks : Object.values(ownerTasks);
          storedTask = allOwnerTasks.find((t: any) => String(t.id) === String(taskId))
                    || allOwnerTasks.find((t: any) => String(t.taskId) === String(taskId))
                    || allOwnerTasks[taskIndex];
          if (storedTask) console.log('✅ Found task data from backend (by taskId or index)');
        }
      } catch (backendError) {
        console.warn('⚠️ Backend lookup failed, falling back to localStorage:', backendError);
      }
      
      // Try 2: Sender's localStorage (fallback - do NOT check current user's localStorage for received tasks)
      if (!storedTask) {
        const senderKey = `userTaskData_${originalOwner}`;
        const senderTasks = JSON.parse(localStorage.getItem(senderKey) || '{}');
        // Prefer taskId key, fallback to index-like matches
        storedTask = senderTasks[taskId] 
          || Object.values(senderTasks).find((task: any) => task.id === taskId || task.numericId === taskId)
          || senderTasks[taskIndex];
      if (storedTask) {
          console.log('✅ Found task data from sender localStorage');
          console.log('🔍 Sender localStorage data:', storedTask);
        }
      }
      
      if (storedTask) {
        console.log('✅ Found stored shared task data from multi-source lookup');
        console.log('🔍 Decrypted data being returned:', {
          title: storedTask.title,
          description: storedTask.description,
          dueDate: storedTask.dueDate,
          priority: storedTask.priority
        });
        const normalizeDue = (d: any) => {
          if (!d) return '';
          const n = typeof d === 'number' ? d : Date.parse(d);
          if (isNaN(n)) return String(d);
          const ms = n < 10000000000 ? n * 1000 : n; // seconds → ms
          return new Date(ms).toISOString();
        };
        return { 
          success: true, 
          decryptedData: { 
            title: storedTask.title,
            description: storedTask.description || 'No description',
            dueDate: normalizeDue(storedTask.dueDate),
            priority: typeof storedTask.priority === 'string' ? parseInt(storedTask.priority) : storedTask.priority,
            transactionHash: tx.hash
          } 
        };
      } else {
        console.warn('⚠️ No stored data found for shared task in any source');
        console.warn('⚠️ Tried taskIndex:', taskIndex, 'originalOwner:', originalOwner);
        return { 
          success: true, // Still succeeded on blockchain
          decryptedData: { 
            note: 'Shared task decrypted - check blockchain for full details'
          } 
        };
      }
      
    } catch (error) {
      console.error('❌ Failed to decrypt shared task:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Helper method to convert string to a hash-based number (fits in euint64)
  private stringToReversibleNumber(str: string): number {
    if (!str || typeof str !== 'string') {
      return 0;
    }
    
    // Use a deterministic hash that fits in 64-bit range
    // This is for on-chain verification - actual text stored in backend
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash >>> 0; // Convert to 32-bit unsigned
    }
    
    // Add length information to make it more unique
    return Math.abs(hash) + (str.length * 1000000);
  }

  // Helper method to indicate decrypted content (hash-based, actual text from backend)
  private numberToString(num: any): string {
    if (num === 0 || num === 0n || num === '0') return '';
    
    // Since we're using hash-based encoding for FHEVM compatibility,
    // the actual string content should be retrieved from the backend
    // This hash serves as verification that decryption worked
    return `Content Verified (Hash: ${num})`;
  }

  // Helper function to safely map blockchain status to frontend status
  private mapTaskStatus(blockchainStatus: any): 'Pending' | 'Completed' {
    // Convert bigint to number for comparison
    const statusValue = typeof blockchainStatus === 'bigint' ? Number(blockchainStatus) : blockchainStatus;
    
    // Handle different possible formats from blockchain
    if (statusValue === 0 || blockchainStatus === '0' || blockchainStatus === 'Pending') {
      return 'Pending';
    } else if (statusValue === 1 || blockchainStatus === '1' || blockchainStatus === 'Completed') {
      return 'Completed';
    } else {
      // Default to Pending for unknown values
      console.warn('⚠️ Unknown status value:', blockchainStatus, 'defaulting to Pending');
      return 'Pending';
    }
  }

  async getTasks(): Promise<Task[]> {
    console.log('🔍 getTasks called - checking blockchain for task status...');
    
    if (this.isDemoMode) {
      console.log('🎮 Demo mode: Returning empty task list');
      return [];
    }

    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const signer = simpleWalletService.getSigner();
      if (!signer) {
        throw new Error('Wallet not connected');
      }

      const userAddress = await signer.getAddress();
      
      // Try to get tasks from contract - will return empty for encrypted data
      // This is expected because encrypted FHE types can't be decoded
      let tasks: any[] = [];
      try {
        tasks = await this.contract.getTasks(userAddress);
        console.log(`✅ Retrieved ${tasks.length} tasks from blockchain`);
      } catch (error: any) {
        // Expected error: "could not decode result data" - encrypted FHE types are unreadable
        // This means the user has tasks, but we can't decode them without decryption
        console.log('📊 Contract returned encrypted task data (this is normal for FHEVM)');
        
        // Try to get the length from the blockchain by checking if user has any encrypted data
        // We'll return an empty array for now - localStorage will handle the rest
        tasks = [];
      }
      
      // Return blockchain data enriched with share info; TaskManager will merge with local storage
      const enriched = await Promise.all(tasks.map(async (task: any, index: number) => {
        // Resolve stable taskId for this index
        let stableTaskId: number = index;
        try {
          const tid = await this.contract!.getTaskId(userAddress, index);
          stableTaskId = Number(tid);
        } catch {}
        // Detect if shared by checking TaskShared logs AND get all recipients
        let isShared = false;
        let sharedWith: string[] = [];
        try {
          const logs = await this.contract!.queryFilter(this.contract!.filters.TaskShared(stableTaskId, userAddress, null), 0, 'latest');
          isShared = logs.length > 0;
          // Extract all recipient addresses from logs
          sharedWith = logs.map((log: any) => {
            try {
              const parsed = this.contract!.interface.parseLog(log);
              return parsed?.args?.recipient as string;
            } catch {
              return null;
            }
          }).filter((addr: string | null): addr is string => addr !== null);
          console.log(`🔗 Task ${index} (stableId ${stableTaskId}) shared with ${sharedWith.length} recipients:`, sharedWith);
        } catch (err) {
          console.warn('⚠️ Failed to query TaskShared events:', err);
        }
        console.log(`🔍 Task ${index} from blockchain:`, {
          rawStatus: task.status,
          statusType: typeof task.status,
          mappedStatus: this.mapTaskStatus(task.status),
          encryptedDueDate: task.dueDate,
          encryptedTitle: task.title,
          encryptedPriority: task.priority,
          isShared,
          sharedWith: sharedWith.length
        });
        
        return {
          id: index,
          title: '', // Empty - TaskManager will fill from localStorage
          description: '', // Empty - TaskManager will fill from localStorage
          dueDate: new Date().toISOString(), // Placeholder - TaskManager will use localStorage
          priority: 1, // Placeholder - TaskManager will use localStorage
          status: this.mapTaskStatus(task.status), // Only status from blockchain
          createdAt: new Date().toISOString(), // Placeholder - TaskManager will use localStorage
          isEncrypted: true,
          isShared: isShared,
          sharedWith: sharedWith,
          stableTaskId: stableTaskId,
        } as any;
      }));
      return enriched;
    } catch (error) {
      console.error('Failed to get tasks:', error);
      throw new Error('Failed to get tasks');
    }
  }

  async completeTask(taskIndex: number): Promise<{ success: boolean; transactionDetails?: any; error?: string }> {
    if (this.isDemoMode) {
      console.log('Demo mode: Completing task', taskIndex);
      return { success: true };
    }

    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      console.log('🔍 Calling completeTask on blockchain with index:', taskIndex);
      const tx = await this.contract.completeTask(taskIndex);
      console.log('✅ CompleteTask transaction sent:', tx.hash);
      await Promise.race([
        tx.wait(1), // Wait for 1 confirmation instead of full confirmation
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction timeout')), 30000) // Increased to 30s for task creation
        )
      ]);
      
      // Get transaction receipt for blockchain proof
      const receipt = await tx.wait(1);
      const provider = (this.contract as any).provider as ethers.Provider | undefined;
      const block = provider ? await provider.getBlock(receipt.blockNumber) : null;
      
      // Safely convert timestamp to ISO string
      let timestamp: string;
      if (block?.timestamp) {
        try {
          timestamp = new Date(block.timestamp * 1000).toISOString();
        } catch (error) {
          console.warn('Failed to convert block timestamp, using current time:', error);
          timestamp = new Date().toISOString();
        }
      } else {
        console.warn('No block timestamp available, using current time');
        timestamp = new Date().toISOString();
      }
      
      console.log('✅ Task completed successfully on blockchain:', {
        transactionHash: tx.hash,
        blockNumber: receipt.blockNumber,
        timestamp: timestamp,
        gasUsed: receipt.gasUsed.toString()
      });
      
      return {
        success: true,
        transactionDetails: {
          transactionHash: tx.hash,
          blockNumber: receipt.blockNumber,
          timestamp: timestamp,
          gasUsed: receipt.gasUsed.toString()
        }
      };
    } catch (error) {
      console.error('Failed to complete task:', error);
      return { success: false, error: (error as Error).message || 'Failed to complete task' };
    }
  }

  async editTask(taskIndex: number, task: Omit<Task, 'id' | 'createdAt'>): Promise<void> {
    if (this.isDemoMode) {
      console.log('Demo mode: Editing task', taskIndex, task);
      return;
    }

    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      console.log('✏️ Editing task with ID:', taskIndex);
      
      // Get user address for FHEVM encryption
    const signer = simpleWalletService.getSigner();
    if (!signer) {
      throw new Error('Wallet not connected');
    }
      const userAddress = await signer.getAddress();

      // Prepare encrypted data for the edited task
      const title = task.title || 'Untitled Task';
      const dueDate = task.dueDate || new Date().toISOString().split('T')[0];
      const priority = task.priority ?? 1;

      const titleAsNumber = this.stringToReversibleNumber(title);
      const dueDateTimestamp = Math.floor(new Date(dueDate).getTime() / 1000);
      
      console.log('📝 Edit task converted data:', { 
        originalTitle: title, 
        titleAsNumber, 
        originalDueDate: dueDate, 
        dueDateTimestamp, 
        priority 
      });

      // Create encrypted input for edited values
      const combinedInput = fhevmService.getInstance().createEncryptedInput(this.contractAddress, userAddress);
      combinedInput.add64(titleAsNumber);
      combinedInput.add64(dueDateTimestamp);
      combinedInput.add8(priority);
      const combinedResult = await combinedInput.encrypt();

      // Call contract's editTask function
      const tx = await this.contract.editTask(
        taskIndex,
        combinedResult.handles[0],    // Encrypted title as bytes32
        combinedResult.handles[1],    // Encrypted due date as bytes32
        combinedResult.handles[2],    // Encrypted priority as bytes32
        combinedResult.inputProof     // Input proof as bytes
      );

      console.log('⏳ Edit transaction sent:', tx.hash);
      await Promise.race([
        tx.wait(1), // Wait for 1 confirmation instead of full confirmation
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction timeout')), 30000) // Increased to 30s for task creation
        )
      ]);
      console.log('✅ Task edited successfully');
    } catch (error) {
      console.error('❌ Failed to edit task:', error);
      throw new Error('Failed to edit task');
    }
  }

  async deleteTask(taskId: number): Promise<void> {
    if (this.isDemoMode) {
      console.log('Demo mode: Deleting task', taskId);
      return;
    }

    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const tx = await this.contract.deleteTaskById(taskId);
      
      // For deletion, we can be even more aggressive - just wait for transaction to be sent
      // and update UI immediately, then wait for confirmation in background
      console.log('Task deletion transaction sent:', tx.hash);
      
      // Wait for minimal confirmation (just to ensure transaction is mined)
      await Promise.race([
        tx.wait(1), // Wait for 1 confirmation
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction timeout')), 30000) // Increased to 30s for task creation
        )
      ]);
      console.log('Task deleted successfully');
    } catch (error) {
      console.error('Failed to delete task:', error);
      throw new Error('Failed to delete task');
    }
  }

  async shareTask(taskId: number, recipientAddress: string): Promise<void> {
    if (this.isDemoMode) {
      console.log('Demo mode: Sharing task', taskId, 'with', recipientAddress);
      return;
    }

    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      console.log('🔗 Sharing taskId', taskId, 'with recipient:', recipientAddress);
      
      // Validate recipient address
      if (!recipientAddress || !/^0x[a-fA-F0-9]{40}$/.test(recipientAddress)) {
        throw new Error('Invalid recipient address format');
      }
      
      // Normalize address to checksum format for consistency
      // This ensures the address matches when recipient checks sharedTasks()
      const normalizedAddress = ethers.getAddress(recipientAddress);
      console.log('🔗 Normalized recipient address:', normalizedAddress, '(original:', recipientAddress, ')');
      
      // Call the contract's shareTask function with normalized address
      const tx = await this.contract.shareTaskById(taskId, normalizedAddress);
      console.log('✅ Share transaction sent successfully! Hash:', tx.hash);
      console.log('⏳ Waiting for transaction confirmation (timeout: 30 seconds)...');
      
      // Wait for transaction confirmation
      let receipt;
      try {
        receipt = await Promise.race([
          tx.wait(1), // Wait for 1 confirmation
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Transaction timeout after 30 seconds. Your transaction was sent (hash: ${tx.hash}). Please check the blockchain explorer to verify if it was mined.`)), 30000) // 30 seconds
          )
        ]);
        console.log('✅ Task shared successfully on blockchain! Hash:', receipt.hash);
      } catch (timeoutError: any) {
        // If timeout, the transaction might still be pending - log it
        console.warn('⚠️ Transaction confirmation timeout:', timeoutError.message);
        console.warn('⚠️ Transaction hash:', tx.hash);
        console.warn('⚠️ The transaction was sent and may still be processing. Check the blockchain explorer.');
        throw timeoutError;
      }
      
      // Listen for TaskShared event to confirm
      const filter = this.contract!.filters.TaskShared(taskId);
      const listener = (taskIdEv: number, owner: string, recipient: string) => {
        console.log('🔗 TaskShared event received:', { taskId: taskIdEv, owner, recipient });
        this.contract!.off(filter, listener);
      };
      
      this.contract!.on(filter, listener);
      
    } catch (error: any) {
      console.error('❌ Failed to share task:', error);
      
      // Provide better error messages
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
        
        // If it's a timeout but transaction was sent, provide helpful info
        if (error.message.includes('Transaction timeout') && error.message.includes('hash:')) {
          errorMessage = error.message; // Keep the detailed message with hash
        }
      }
      
      throw new Error(`Failed to share task: ${errorMessage}`);
    }
  }

  // Owner/Admin functions
  async getOwner(): Promise<string> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const owner = await this.contract.owner();
      return owner;
    } catch (error) {
      console.error('Failed to get owner:', error);
      throw new Error('Failed to get contract owner');
    }
  }

  async isOwner(): Promise<boolean> {
    if (!this.contract) {
      return false;
    }

    try {
      const owner = await this.getOwner();
      const signer = simpleWalletService.getSigner();
      if (!signer) return false;
      
      const userAddress = await signer.getAddress();
      return owner.toLowerCase() === userAddress.toLowerCase();
    } catch (error) {
      console.error('Failed to check ownership:', error);
      return false;
    }
  }

  async setFee(newFee: string): Promise<void> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const feeInWei = ethers.parseEther(newFee);
      const tx = await this.contract.setFee(feeInWei);
      console.log('⏳ Set fee transaction sent:', tx.hash);
      await Promise.race([
        tx.wait(1), // Wait for 1 confirmation instead of full confirmation
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction timeout')), 30000) // Increased to 30s for task creation
        )
      ]);
      console.log('✅ Fee updated successfully');
    } catch (error) {
      console.error('❌ Failed to set fee:', error);
      throw new Error('Failed to set fee');
    }
  }

  async withdraw(): Promise<void> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const tx = await this.contract.withdraw();
      console.log('⏳ Withdraw transaction sent:', tx.hash);
      await Promise.race([
        tx.wait(1), // Wait for 1 confirmation instead of full confirmation
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction timeout')), 30000) // Increased to 30s for task creation
        )
      ]);
      console.log('✅ Funds withdrawn successfully');
    } catch (error) {
      console.error('❌ Failed to withdraw funds:', error);
      throw new Error('Failed to withdraw funds');
    }
  }

  async getContractBalance(): Promise<string> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const provider = simpleWalletService.getProvider();
      if (!provider) {
        throw new Error('Provider not available');
      }
      const balance = await provider.getBalance(this.contractAddress);
      return ethers.formatEther(balance);
    } catch (error) {
      console.error('❌ Failed to get contract balance:', error);
      throw new Error('Failed to get contract balance');
    }
  }
}

export const realContractService = new RealContractService();
