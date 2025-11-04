import { useState, useEffect } from 'react';
import { Plus, CheckCircle, Clock, Shield, Users } from 'lucide-react';
import { realContractService } from '../services/realContractService';
import { fhevmService } from '../services/fhevmService';
import { simpleWalletService } from '../services/simpleWalletService';
import { productionWalletService } from '../services/productionWalletService';
import { backendService } from '../services/backendService';
// import { taskStorage } from '../services/taskStorage';
import { getContractAddress } from '../config/contract';
import type { Task } from '../types';
import { TaskForm } from './TaskForm';
import { TaskCard } from './TaskCard';
import { ShareModal } from './ShareModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { DecryptionModal } from './DecryptionModal';
import { BulkDeleteModal } from './BulkDeleteModal';
import { NotificationContainer } from './NotificationContainer';
// import { debugLocalStorage } from '../utils/debugLocalStorage';

export function TaskManager({ externalDemoMode = false, encryptedOnly = false }: { externalDemoMode?: boolean, encryptedOnly?: boolean }) {
  // Use external demo mode if provided, otherwise default to false
  const [isDemoMode, setIsDemoMode] = useState(externalDemoMode);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [receivedTasks, setReceivedTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [sharingTask, setSharingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [decryptingTask, setDecryptingTask] = useState<Task | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedTasks, setDecryptedTasks] = useState<Set<number>>(new Set());
  const [taskCreationFee, setTaskCreationFee] = useState('0.0001');
  const [activeTab, setActiveTab] = useState<'my-tasks' | 'received-tasks'>('my-tasks');
  
  // Wallet connection state
  const [showWalletConnect, setShowWalletConnect] = useState(false);
  
  // Bulk selection state
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  
  // Get contract address from configuration
  const contractAddress = getContractAddress();

  // Update demo mode when external prop changes
  useEffect(() => {
    setIsDemoMode(externalDemoMode);
  }, [externalDemoMode]);

  useEffect(() => {
    // Simple wallet connection - no subscription needed
    const checkWallet = () => {
      // Demo mode - skip wallet check and load tasks directly
      if (isDemoMode) {
        console.log('🎮 Demo mode: Skipping wallet check, loading tasks directly');
        setShowWalletConnect(false);
        loadTasks().catch(err => console.error('Error loading tasks:', err));
        // Skip blockchain operations in demo mode
        setReceivedTasks([]);
        return;
      }
      
      if (simpleWalletService.isWalletConnected()) {
        console.log('Wallet connected, loading data...');
        setShowWalletConnect(false);
        loadTasks().catch(err => console.error('Error loading tasks:', err));
        loadReceivedTasks().catch(err => console.error('Error loading received tasks:', err));
        loadTaskCreationFee().catch(err => console.error('Error loading fee:', err));
      } else {
        console.log('Wallet not connected, showing connection prompt');
        setShowWalletConnect(true);
        setTasks([]);
        setReceivedTasks([]);
      }
    };
    
    // Initial load
    checkWallet();
    
    // CRITICAL: Do NOT persist decryption state across refreshes
    // Users must re-decrypt on each session for security
    // const savedDecryptedTasks = localStorage.getItem('decryptedTasks');
    // if (savedDecryptedTasks) {
    //   try {
    //     const taskIds = JSON.parse(savedDecryptedTasks);
    //     setDecryptedTasks(new Set(taskIds));
    //     console.log('✅ Loaded decrypted tasks from localStorage:', taskIds);
    //   } catch (error) {
    //     console.error('Failed to load decrypted tasks from localStorage:', error);
    //     setDecryptedTasks(new Set());
    //   }
    // }
    setDecryptedTasks(new Set()); // Start fresh on each page load
    
    // Clean up stale deletedTasks entries (old deleted indices messing up display)
    try {
      const deletedTasks = JSON.parse(localStorage.getItem('deletedTasks') || '{}');
      const deletedCount = Object.keys(deletedTasks).length;
      console.log('🧹 Current deletedTasks count:', deletedCount);
      
      // If too many entries marked as deleted, likely stale data - clear it
      if (deletedCount > 3) {
        console.log('🧹 Too many deleted tasks detected, clearing stale data...');
        localStorage.setItem('deletedTasks', '{}');
      }
    } catch (e) {
      console.log('ℹ️ Could not check deletedTasks');
    }
    
    // REMOVED: This was clearing localStorage on every page load!
    // It was causing tasks to disappear after creation.
    // const storedTasks = JSON.parse(localStorage.getItem('userTaskData') || '{}');
    // const hasGhostTasks = Object.keys(storedTasks).length > 0;
    // if (hasGhostTasks && !isDemoMode) {
    //   console.log('🧹 Clearing localStorage to remove ghost tasks from demo mode');
    //   localStorage.removeItem('userTaskData');
    //   localStorage.removeItem('completedTasks');
    // }
    
    return () => {
      // Cleanup if needed
    };
  }, []);

  // Helper to get wallet-scoped localStorage key
  const getStorageKey = (): string => {
    const userAddress = simpleWalletService.getAddress();
    return userAddress ? `userTaskData_${userAddress}` : 'userTaskData';
  };

  const loadTasks = async () => {
    setIsLoading(true);
    try {
      // DEBUG: Log localStorage contents FIRST
      // debugLocalStorage();
      
      // ALWAYS load tasks from localStorage (for plain text tasks created without encryption)
      // Even in real blockchain mode, we need to show plain text tasks from localStorage
      console.log('📂 Loading tasks from localStorage (demo mode OR plain text tasks)');
      
      // Demo mode - load tasks from localStorage to preserve user data
      if (isDemoMode || !simpleWalletService.isWalletConnected()) {
        
        // CRITICAL: Load user-created tasks from localStorage
        const storedTasks = JSON.parse(localStorage.getItem('userTaskData') || '{}');
        const completedTasks = JSON.parse(localStorage.getItem('completedTasks') || '{}');
        const deletedTasks = JSON.parse(localStorage.getItem('deletedTasks') || '{}');
        const decryptedTasksList = JSON.parse(localStorage.getItem('decryptedTasks') || '[]');
        
        console.log('🔍 Demo mode - Deleted tasks:', Object.keys(deletedTasks));
        console.log('🔍 Demo mode - All deletedTasks:', deletedTasks);
        console.log('🔍 Demo mode - Decrypted tasks:', decryptedTasksList);
        
        // Convert stored tasks to Task format, EXCLUDING deleted ones
        const demoTasks: Task[] = [];
        Object.keys(storedTasks).forEach((taskIdStr) => {
          const taskId = taskIdStr;
          
          // CRITICAL: Skip tasks that were marked as deleted
          const isDeleted = deletedTasks[taskId] === 'DELETED' || deletedTasks[taskId];
          console.log(`🔍 Checking task ID ${taskId}: isDeleted = ${isDeleted}`);
          
          if (isDeleted) {
            console.log('🗑️ Demo: Skipping deleted task:', taskId);
        return;
      }
      
          const storedTask = storedTasks[taskId];
          
          // Parse taskId as number
          const taskIdNum = parseInt(taskId);
          
          // Check completion status from storedTask first, then fallback to completedTasks
          const taskStatus = storedTask.status || (completedTasks[taskId] ? 'Completed' : 'Pending');
          
          // Check if this task was previously decrypted (compare as numbers)
          const wasDecrypted = decryptedTasksList.includes(taskIdNum);
          
          console.log(`✅ Loading task ID ${taskIdNum}:`, {
            title: storedTask.title,
            status: taskStatus,
            isEncrypted: storedTask.shouldEncrypt !== false,
            wasDecrypted
          });
          
          demoTasks.push({
            id: taskIdNum,
            title: storedTask.title,
            description: storedTask.description || '',
            dueDate: storedTask.dueDate,
            priority: storedTask.priority,
            status: taskStatus as 'Pending' | 'Completed',
            createdAt: storedTask.createdAt,
            isEncrypted: storedTask.shouldEncrypt !== false && !wasDecrypted, // Show as NOT encrypted if decrypted
            isShared: false,
            shouldEncrypt: storedTask.shouldEncrypt
          });
          
          // Add to decrypted tasks state if it was decrypted before
          if (wasDecrypted) {
            setDecryptedTasks(prev => new Set([...prev, taskIdNum]));
            console.log('✅ Restored decryption state for demo task:', taskId);
          }
        });
        
        console.log('✅ Demo mode: Loaded', demoTasks.length, 'tasks from localStorage (excluding deleted)');
        setTasks(demoTasks);
        return;
      }
      
      // Check if wallet is connected - even without wallet, we can show plain text tasks
      if (!simpleWalletService.isWalletConnected()) {
        console.log('Wallet not connected, showing only plain text tasks from localStorage');
        
        // Load plain text tasks from localStorage only
        const plainTextStoredTasks = JSON.parse(localStorage.getItem('userTaskData') || '{}');
        const plainTextDeletedTasks = JSON.parse(localStorage.getItem('deletedTasks') || '{}');
        const plainTextTasks: Task[] = [];
        
        Object.keys(plainTextStoredTasks).forEach((taskIdStr) => {
          if (plainTextDeletedTasks[taskIdStr]) return; // Skip deleted
          
          const task = plainTextStoredTasks[taskIdStr];
          const taskIdNum = parseInt(taskIdStr);
          
          // CRITICAL: Check if task is plain text (shouldEncrypt === false)
          const isPlainText = task.shouldEncrypt === false;
          
          plainTextTasks.push({
            id: taskIdNum,
            title: task.title,
            description: task.description || '',
            dueDate: task.dueDate,
            priority: task.priority,
            status: task.status || 'Pending',
            createdAt: task.createdAt,
            isEncrypted: !isPlainText, // FALSE if plain text, TRUE if encrypted
            isShared: false,
            shouldEncrypt: task.shouldEncrypt
          });
        });
        
        setTasks(plainTextTasks);
        return;
      }
      
      // Ensure contract service is initialized
      if (!realContractService.isInitialized()) {
        console.log('🔧 Contract service not initialized, initializing...');
        
        try {
          // Initialize with simple wallet service
          const provider = simpleWalletService.getProvider();
          const signer = simpleWalletService.getSigner();
          
          if (!provider || !signer) {
            console.log('❌ Wallet not properly connected');
            setTasks([]);
            return;
          }
          
          await realContractService.initializeWithWallet(contractAddress);
        } catch (error) {
          console.error('Failed to initialize contract service:', error);
          setTasks([]);
          return;
        }
      }
      
      // Load tasks from blockchain
        console.log('📡 Fetching tasks from blockchain...');
      const blockchainTasks = await realContractService.getTasks();
        console.log('✅ Loaded tasks from blockchain:', blockchainTasks.length);
        console.log('📊 Blockchain task details:', blockchainTasks);
        
        // Load stored user data from BACKEND first, then localStorage fallback
        let storedTasks: Record<string, any> = {};
        
        try {
          // Ensure backend service has user address set before calling getTasks()
          const userAddress = simpleWalletService.getAddress();
          if (userAddress) {
            backendService.setUserAddress(userAddress);
          }
          const backendTasks = await backendService.getTasks();
          storedTasks = backendTasks;
          console.log('✅ Loaded tasks from BACKEND:', Object.keys(backendTasks).length);
          console.log('📊 Backend tasks:', backendTasks);
        } catch (backendError) {
          console.warn('⚠️ Backend unavailable, using localStorage fallback:', backendError);
          
          // Fallback to localStorage
          const userAddress = simpleWalletService.getAddress();
          const scopedKey = userAddress ? `userTaskData_${userAddress}` : 'userTaskData';
          storedTasks = JSON.parse(localStorage.getItem(scopedKey) || '{}');
          console.log('✅ Loaded tasks from localStorage (fallback):', Object.keys(storedTasks).length);
          
          // Show warning notification
          if ((window as any).addNotification) {
            (window as any).addNotification({
              type: 'warning',
              title: 'Backend Unavailable',
              message: 'Loaded tasks from browser storage. Backend sync unavailable.',
              duration: 5000
            });
          }
        }
        
        const completedTasks = JSON.parse(localStorage.getItem('completedTasks') || '{}');
        const deletedTasks = JSON.parse(localStorage.getItem('deletedTasks') || '{}');
        
        console.log('🔍 Available stored tasks:', Object.keys(storedTasks));
        console.log('🔍 Stored tasks content:', storedTasks);
        console.log('🔍 Blockchain tasks count:', blockchainTasks.length);
        console.log('🔍 Deleted tasks:', Object.keys(deletedTasks));
        
        // Get decrypted tasks list - only check in-memory state, not localStorage
        // Decryption state should be session-only for security
        const decryptedTasksList = Array.from(decryptedTasks);
        console.log('🔍 Decrypted tasks in session:', decryptedTasksList);
        
        // Track which indices are not deleted
        const validIndices: number[] = [];
        blockchainTasks.forEach((blockchainTask, index) => {
          const isDeleted = deletedTasks[index] === 'DELETED' || deletedTasks[index];
          // Only check if deleted if there's actually a task at this index on blockchain
          if (!isDeleted && blockchainTask) {
            validIndices.push(index);
          } else if (isDeleted) {
            console.log('🗑️ Skipping deleted task at index:', index);
          }
        });
        
        // IMPORTANT: If localStorage has tasks but they don't exist on blockchain, 
        // they were probably created locally but transaction failed
        console.log('📊 Valid blockchain indices:', validIndices);
        console.log('📊 Stored task indices:', Object.keys(storedTasks).map(Number));
        
        const mergedTasks = validIndices
          .map((actualBlockchainIndex) => {
          const blockchainTask = blockchainTasks[actualBlockchainIndex];
          const rawStoredTask = storedTasks[actualBlockchainIndex];

          // Handle legacy backend payloads that wrapped metadata under taskData
          const storedTask = (() => {
            if (!rawStoredTask) {
              return undefined;
            }

            if (rawStoredTask.taskData) {
              const { taskData, ...rest } = rawStoredTask;
              return {
                ...taskData,
                ...rest,
                sharedWith: taskData.sharedWith || rest.sharedWith || [],
                isShared: taskData.isShared ?? rest.isShared,
              };
            }

            return rawStoredTask;
          })();
          
          console.log(`🔍 Loading task at blockchain index ${actualBlockchainIndex}:`, {
            hasStoredTask: !!storedTask,
            storedTask,
            blockchainTask,
            allStoredTasks: Object.keys(storedTasks)
          });
          
          if (storedTask) {
            console.log('✅ Found stored data for task blockchain index:', actualBlockchainIndex);
            
            // CRITICAL: Prefer blockchain status, fallback to stored status
            const taskStatus = blockchainTask.status || storedTask.status;
            
            // Determine if this is a plain task or encrypted task
            const isPlainTask = storedTask.shouldEncrypt === false || storedTask.isEncrypted === false;
            
            // Preserve user-entered data while keeping blockchain status
            const task: Task = {
              ...blockchainTask,
              id: actualBlockchainIndex, // Use blockchain array index for decryption compatibility
              title: storedTask.title,
              description: storedTask.description,
              dueDate: storedTask.dueDate, // Keep actual date user entered
              priority: storedTask.priority,
              createdAt: storedTask.createdAt,
              // Use localStorage status for completion persistence
              status: taskStatus,
              // CRITICAL: Plain tasks have isEncrypted = false, encrypted tasks have isEncrypted = true
              isEncrypted: isPlainTask ? false : (storedTask.isEncrypted !== undefined ? storedTask.isEncrypted : true),
              isShared: blockchainTask.isShared,
              shouldEncrypt: storedTask.shouldEncrypt !== undefined ? storedTask.shouldEncrypt : true
            };
            
            // Check if this task was decrypted before and restore that state
            if (decryptedTasksList.includes(actualBlockchainIndex)) {
              // Task was decrypted, show the real data
              console.log('✅ Task', actualBlockchainIndex, 'was previously decrypted, showing real data');
              return task;
            }
            
            return task;
          } else {
            console.log('⚠️ No stored data found for task index:', actualBlockchainIndex);
            console.log('ℹ️ Including blockchain task with encrypted placeholders so it persists in UI');
            
            // Include task with placeholders; keep blockchain status so completion persists
            return {
              ...blockchainTask,
              id: actualBlockchainIndex,
              title: `******* ********`,
              description: `******* ********`,
              dueDate: `******* ********`,
              priority: 1,
              status: blockchainTask.status,
              createdAt: `******* ********`,
              isEncrypted: true,
              isShared: blockchainTask.isShared,
              sharedWith: blockchainTask.sharedWith || [],
              isLegacy: true
            };
          }
        });
        
        // CRITICAL: Also load plain text tasks from storage (tasks created with shouldEncrypt=false)
        // These are plain text tasks that are NOT on the blockchain
        console.log('🔍 Loading plain text tasks from storage...');
        const plainTextTasks: Task[] = [];
        const plainTextStoredTasks = JSON.parse(localStorage.getItem('userTaskData') || '{}');
        const plainTextDeletedTasks = JSON.parse(localStorage.getItem('deletedTasks') || '{}');
        
        Object.keys(plainTextStoredTasks).forEach((taskIdStr) => {
          const taskIdNum = parseInt(taskIdStr);
          
          // Skip if deleted
          if (plainTextDeletedTasks[taskIdStr]) {
            return;
          }
          
          // Check if this task index is already in blockchain tasks
          // Plain text tasks have VERY large IDs (1 trillion + timestamp)
          // Blockchain tasks have small indices (0, 1, 2, etc.)
          // If taskIdNum is less than 1000, it's likely a blockchain index, not a plain text ID
          const isInBlockchain = taskIdNum < 1000 && mergedTasks.some(t => t.id === taskIdNum);
          
          if (isInBlockchain) {
            return; // Already loaded from blockchain
          }
          
          const plainTextTask = plainTextStoredTasks[taskIdStr];
          
          // Only load plain text tasks (shouldEncrypt=false)
          if (plainTextTask.shouldEncrypt === false) {
            // CRITICAL: Plain text tasks should have isEncrypted = FALSE
            plainTextTasks.push({
              id: taskIdNum,
              title: plainTextTask.title,
              description: plainTextTask.description || '',
              dueDate: plainTextTask.dueDate,
              priority: plainTextTask.priority,
              status: plainTextTask.status || 'Pending',
              createdAt: plainTextTask.createdAt,
              isEncrypted: false, // Plain text tasks are NOT encrypted
              isShared: false,
              shouldEncrypt: false
            });
            console.log('✅ Loaded plain text task:', taskIdStr);
          }
        });
        
        // Combine blockchain tasks and plain text tasks
        const allTasks = [...mergedTasks, ...plainTextTasks];
        console.log(`✅ Loaded ${allTasks.length} total tasks (${mergedTasks.length} blockchain + ${plainTextTasks.length} plain text)`);
        
        setTasks(allTasks);
    } catch (error) {
      console.error('Failed to load tasks:', error);
      setTasks([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadReceivedTasks = async () => {
    // Skip in demo mode
    if (isDemoMode) {
      setReceivedTasks([]);
      return;
    }
    
    setIsLoading(true);
    try {
      const fetchedReceivedTasks = await realContractService.getReceivedTasks();
    // Apply hidden filter persisted per user
    try {
      const signer = simpleWalletService.getSigner();
      const me = await signer.getAddress();
      const hiddenKey = `hiddenReceivedTasks_${me.toLowerCase()}`;
      const hiddenMap = JSON.parse(localStorage.getItem(hiddenKey) || '{}');
      const visible = fetchedReceivedTasks.filter((t: any) => !hiddenMap[t.id]);
      setReceivedTasks(visible);
    } catch {
      setReceivedTasks(fetchedReceivedTasks);
    }
    } catch (error) {
      // Silently fail in demo mode or if contract not initialized
      if (isDemoMode || (error instanceof Error && error.message.includes('not initialized'))) {
        setReceivedTasks([]);
      } else {
      console.error('Failed to load received tasks:', error);
      setReceivedTasks([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadTaskCreationFee = async () => {
    try {
      // Demo mode - use default fee
      if (isDemoMode) {
        console.log('🎮 Demo mode: Using default fee');
        setTaskCreationFee('0.0001');
        return;
      }
      
      // Check if wallet is connected
      const walletState = productionWalletService.getState();
      if (!walletState.isConnected) {
        console.log('Wallet not connected, using default fee');
        setTaskCreationFee('0.0001');
        return;
      }
      
      // Ensure contract service is initialized
      if (!realContractService.isInitialized()) {
        try {
          // Double-check wallet state before initializing
          const currentWalletState = productionWalletService.getState();
          if (!currentWalletState.isConnected) {
            console.log('Wallet disconnected during fee initialization, using default');
            setTaskCreationFee('0.0001');
            return;
          }
          
          await realContractService.initializeWithWallet(contractAddress);
        } catch (error) {
          console.error('Failed to initialize contract service:', error);
          setTaskCreationFee('0.0001');
          return;
        }
      }
      
      // Get real fee from contract
      const fee = await realContractService.getTaskCreationFee();
      setTaskCreationFee(fee);
      console.log('Loaded task creation fee from contract:', fee);
    } catch (error) {
      console.error('Failed to load task creation fee:', error);
      setTaskCreationFee('0.0001');
    }
  };

  const connectWallet = async () => {
    try {
      console.log('🔗 Connecting wallet...');
      await simpleWalletService.connect();
      setShowWalletConnect(false);
      console.log('✅ Wallet connected successfully');
      
      // Initialize backend service with user address
      try {
        const signer = simpleWalletService.getSigner();
        if (signer) {
          const address = await signer.getAddress();
          backendService.setUserAddress(address);
          console.log('✅ Backend service initialized for address:', address);
          
          // Test backend connection
          try {
            const healthCheck = await fetch('http://localhost:3001/health');
            if (healthCheck.ok) {
              console.log('✅ Backend server is connected and healthy');
              if ((window as any).addNotification) {
                (window as any).addNotification({
                  type: 'success',
                  title: 'Backend Connected',
                  message: 'Connected to backend server. Tasks will be saved persistently.',
                  duration: 3000
                });
              }
            }
          } catch (healthError) {
            console.warn('⚠️ Backend health check failed:', healthError);
            if ((window as any).addNotification) {
              (window as any).addNotification({
                type: 'warning',
                title: 'Backend Unavailable',
                message: 'Backend server is not available. Using browser storage only.',
                duration: 5000
              });
            }
          }
        }
      } catch (err) {
        console.warn('⚠️ Could not initialize backend service:', err);
      }
      
      // Reload data after connection
      await loadTasks();
      await loadReceivedTasks();
      await loadTaskCreationFee();
    } catch (error) {
      console.error('❌ Wallet connection failed:', error);
      if ((window as any).addNotification) {
        (window as any).addNotification({
          type: 'error',
          title: 'Wallet Connection Failed',
          message: (error as Error).message || 'Please try again.',
          duration: 5000
        });
      }
    }
  };

  const disconnectWallet = async () => {
    try {
      console.log('🔌 Disconnecting wallet...');
      await simpleWalletService.disconnect();
      setShowWalletConnect(true);
      setTasks([]);
      setReceivedTasks([]);
      setDecryptedTasks(new Set());
      console.log('✅ Wallet disconnected successfully');
    } catch (error) {
      console.error('❌ Wallet disconnection failed:', error);
      if ((window as any).addNotification) {
        (window as any).addNotification({
          type: 'error',
          title: 'Disconnect Failed',
          message: (error as Error).message || 'Please try again.',
          duration: 5000
        });
      }
    }
  };

  const handleCreateTask = async (taskData: Omit<Task, 'id' | 'createdAt'>) => {
    try {
      console.log('Creating task with data:', taskData);
      
      // Check if task should be encrypted
      const shouldEncrypt = (taskData as any).shouldEncrypt !== false; // Default to true if not specified
      
      // Plain text tasks - create instantly without blockchain transaction
      if (!shouldEncrypt) {
        console.log('📝 Creating plain text task (no encryption)');
        // Use a large timestamp to avoid collision with blockchain indices (0, 1, 2, etc.)
        const taskId = Date.now() + 1000000000000; // Add 1 trillion to ensure it's large enough
        const newTask: Task = {
          ...taskData,
          id: taskId,
          createdAt: new Date().toISOString(),
          shouldEncrypt: false,
          isEncrypted: false, // Mark as NOT encrypted
        };
        
        console.log('💾 Saving plain text task with ID:', taskId);
        
        // Save plain task to BACKEND first, then localStorage as fallback
        const userAddress = simpleWalletService.getAddress();
        const taskMetadata = {
          title: newTask.title,
          description: newTask.description,
          dueDate: newTask.dueDate,
          priority: newTask.priority,
          createdAt: newTask.createdAt,
          status: newTask.status,
          shouldEncrypt: false,
          isEncrypted: false,
          address: userAddress
        };
        
        // Try backend first
        if (userAddress) {
          try {
            await backendService.saveTask(taskMetadata, taskId);
            console.log('✅ Plain task saved to BACKEND');
          } catch (backendError) {
            console.warn('⚠️ Backend save failed, using localStorage:', backendError);
          }
        }
        
        // Save to localStorage for persistence (fallback or additional storage)
        const scopedKey = userAddress ? `userTaskData_${userAddress}` : 'userTaskData';
        const storedTasks = JSON.parse(localStorage.getItem(scopedKey) || '{}');
        storedTasks[taskId] = taskMetadata;
        localStorage.setItem(scopedKey, JSON.stringify(storedTasks));
        console.log('✅ Saved to localStorage, all stored tasks:', Object.keys(storedTasks));
        
        // Plain tasks are never encrypted, so they're always "decrypted" (just mark as readable)
        const decryptedTasks = JSON.parse(localStorage.getItem('decryptedTasks') || '[]');
        decryptedTasks.push(taskId);
        localStorage.setItem('decryptedTasks', JSON.stringify(decryptedTasks));
        setDecryptedTasks(new Set(decryptedTasks));
        
        setTasks(prevTasks => [...prevTasks, newTask]);
        setShowTaskForm(false);
        console.log('✅ Plain text task created:', newTask);
        
        // Show success notification
        if ((window as any).addNotification) {
          (window as any).addNotification({
            type: 'success',
            title: '📝 Task Created',
            message: `Task "${taskData.title}" created successfully!`,
            duration: 3000
          });
        }
        return;
      }
      
      // Encrypted tasks - require blockchain transaction
      // Demo mode - create task locally
      if (isDemoMode) {
        console.log('🎮 Demo mode: Creating encrypted task locally');
        const taskId = Date.now();
        const newTask: Task = {
          ...taskData,
          id: taskId,
          createdAt: new Date().toISOString(),
          shouldEncrypt: true,
          isEncrypted: true, // Mark as encrypted for display
        };
        
        // CRITICAL: Save ACTUAL user data to localStorage (NOT placeholders)
        // The UI will show asterisks based on isEncrypted flag, but we store real data
        const storedTasks = JSON.parse(localStorage.getItem('userTaskData') || '{}');
        storedTasks[taskId] = {
          title: taskData.title, // STORE ACTUAL USER INPUT
          description: taskData.description, // STORE ACTUAL USER INPUT
          dueDate: taskData.dueDate, // STORE ACTUAL USER INPUT
          priority: taskData.priority, // STORE ACTUAL USER INPUT
          createdAt: new Date().toISOString(),
          status: taskData.status,
          shouldEncrypt: true,
          isEncrypted: true // Mark as encrypted for UI display
        };
        localStorage.setItem(getStorageKey(), JSON.stringify(storedTasks));
        
        setTasks(prevTasks => [...prevTasks, newTask]);
        setShowTaskForm(false);
        console.log('✅ Demo encrypted task created with encrypted placeholders');
        
        // Show success notification
        if ((window as any).addNotification) {
          (window as any).addNotification({
            type: 'success',
            title: 'Task Created (Demo)',
            message: `Demo task "${taskData.title}" created (not encrypted in demo mode)`,
            duration: 3000
          });
        }
        return;
      }
      
      console.log('FHEVM ready:', fhevmService.isReady());
      
      // Check if wallet is connected
      if (!simpleWalletService.isWalletConnected()) {
        setShowWalletConnect(true);
        setShowTaskForm(false);
        throw new Error('Wallet not connected. Please connect your wallet first.');
      }
      // Check correct network (Sepolia 11155111)
      const walletState = productionWalletService.getState();
      const currentChainId = Number(walletState.chainId || 0);
      const expectedChainId = 11155111;
      if (currentChainId && currentChainId !== expectedChainId) {
        if ((window as any).addNotification) {
          (window as any).addNotification({
            type: 'error',
            title: 'Wrong Network',
            message: 'Please switch your wallet to Sepolia testnet and try again.',
            duration: 6000
          });
        }
        throw new Error('Wrong network: please switch to Sepolia.');
      }
      
      // Ensure contract service is initialized
      if (!realContractService.isInitialized()) {
        try {
          await realContractService.initializeWithWallet(contractAddress);
        } catch (error) {
          console.error('Failed to initialize contract service:', error);
          throw new Error('Contract service not available. Please ensure your wallet is connected.');
        }
      }
      
      // Get tasks BEFORE creating to find the new index
      const tasksBefore = await realContractService.getTasks();
      const beforeCount = tasksBefore.length;
      console.log('🔍 Tasks before creation:', beforeCount);
      
      // Create task on blockchain
      const result = await realContractService.createTask(taskData);
      
      if (result.success) {
        // CRITICAL FIX: Wait for blockchain confirmation
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
        
        // Get tasks AFTER creating
        const tasksAfter = await realContractService.getTasks();
        const afterCount = tasksAfter.length;
        console.log('🔍 Tasks after creation:', afterCount);
        
        // The new task is at the index equal to beforeCount
        const actualTaskIndex = beforeCount;
        
        console.log('🔍 Task created at blockchain index:', actualTaskIndex);
        
        // Store user-entered data to BACKEND SERVER first (primary storage)
        // Use localStorage as fallback if backend is unavailable
        const userAddress = simpleWalletService.getAddress();
        if (!userAddress) {
          throw new Error('User address not available');
        }
        
        const stableTaskId = tasksAfter?.[actualTaskIndex]?.stableTaskId ?? actualTaskIndex;

        const taskMetadata = {
          title: taskData.title,
          description: taskData.description,
          dueDate: taskData.dueDate,
          priority: taskData.priority,
          createdAt: new Date().toISOString(),
          status: taskData.status,
          shouldEncrypt: true,
          address: userAddress,
          taskIndex: actualTaskIndex,
          stableTaskId,
        };
        
        // Try to save to backend first
        try {
          await backendService.saveTask(taskMetadata, actualTaskIndex);
          console.log('✅ Task metadata saved to BACKEND at index:', actualTaskIndex);
          // Always persist to localStorage so decrypt fallback works even if backend becomes unavailable later
          const scopedKey = `userTaskData_${userAddress}`;
          const storedTasks = JSON.parse(localStorage.getItem(scopedKey) || '{}');
          storedTasks[actualTaskIndex] = taskMetadata;
          localStorage.setItem(scopedKey, JSON.stringify(storedTasks));
          console.log('✅ Task metadata mirrored to localStorage for offline fallback');
          
          // Show success notification
          if ((window as any).addNotification) {
            (window as any).addNotification({
              type: 'success',
              title: '🔒 ENCRYPTED TASK CREATED',
              message: 'Task encrypted and saved successfully!',
              duration: 3000
            });
          }
        } catch (backendError) {
          console.warn('⚠️ Backend save failed, using localStorage fallback:', backendError);
          
          // Fallback to localStorage if backend fails
          const scopedKey = `userTaskData_${userAddress}`;
          const storedTasks = JSON.parse(localStorage.getItem(scopedKey) || '{}');
          storedTasks[actualTaskIndex] = taskMetadata;
          localStorage.setItem(scopedKey, JSON.stringify(storedTasks));
          console.log('✅ Task metadata saved to localStorage (fallback) at index:', actualTaskIndex);
          
          // Show warning notification
          if ((window as any).addNotification) {
            (window as any).addNotification({
              type: 'warning',
              title: 'Backend Unavailable',
              message: 'Task saved to browser storage. Will sync when backend is available.',
              duration: 5000
            });
          }
        }
        
        // CRITICAL: DO NOT mark encrypted tasks as decrypted by default
        // They must be decrypted by the user first
        // Also mark as decrypted immediately (no decryption needed for plain text)
        // const decryptedTasks = JSON.parse(localStorage.getItem('decryptedTasks') || '[]');
        // decryptedTasks.push(actualTaskIndex);
        // localStorage.setItem('decryptedTasks', JSON.stringify(decryptedTasks));
        // setDecryptedTasks(new Set(decryptedTasks));
        
        // Add to local state with blockchain index as ID
        const newTask: Task = {
          ...taskData,
          id: actualTaskIndex, // Use blockchain index as ID
          createdAt: new Date().toISOString(),
          isEncrypted: true, // CRITICAL: Mark as encrypted
          shouldEncrypt: true,
          stableTaskId,
        };
        
        setTasks(prev => [...prev, newTask]);
        setShowTaskForm(false);
        console.log('✅ Task created successfully on blockchain with user data preserved at index:', actualTaskIndex);
      } else {
        throw new Error(result.error || 'Failed to create task');
      }
    } catch (error) {
      console.error('Failed to create task:', error);
      const message = (error as any)?.message || '';
      let title = 'Failed to Create Task';
      let friendly = message;
      if (message.includes('Failed to initialize FHEVM SDK') || message.includes('HTTP error: status: 503')) {
        title = 'FHEVM Unavailable';
        friendly = 'Relayer/KMS temporarily unavailable. Ensure Sepolia is selected and try again.';
      } else if (message.toLowerCase().includes('wrong network')) {
        title = 'Wrong Network';
        friendly = 'Please switch your wallet to Sepolia testnet and retry.';
      }
      if ((window as any).addNotification) {
        (window as any).addNotification({
          type: 'error',
          title,
          message: friendly,
          duration: 6000
        });
      }
      throw error;
    }
  };

  const handleCreateTaskWithText = async (taskData: Omit<Task, 'id' | 'createdAt'>) => {
    try {
      console.log('Creating text task with data:', taskData);
      
      // Demo mode - create task locally
      if (isDemoMode) {
        console.log('🎮 Demo mode: Creating text task locally');
        const taskId = Date.now();
        const newTask: Task = {
          ...taskData,
          id: taskId,
          createdAt: new Date().toISOString(),
        };
        
        // CRITICAL: Save to localStorage for persistence
        const storedTasks = JSON.parse(localStorage.getItem('userTaskData') || '{}');
        storedTasks[taskId] = {
          title: newTask.title,
          description: newTask.description,
          dueDate: newTask.dueDate,
          priority: newTask.priority,
          createdAt: newTask.createdAt,
          status: newTask.status
        };
        localStorage.setItem('userTaskData', JSON.stringify(storedTasks));
        
        setTasks(prevTasks => [...prevTasks, newTask]);
        setShowTaskForm(false);
        console.log('✅ Demo text task created and saved to localStorage:', newTask);
        return;
      }
      
      console.log('FHEVM ready:', fhevmService.isReady());
      
      // Check if wallet is connected
      if (!simpleWalletService.isWalletConnected()) {
        throw new Error('Wallet not connected. Please connect your wallet first.');
      }
      
      // Ensure contract service is initialized
      if (!realContractService.isInitialized()) {
        try {
          await realContractService.initializeWithWallet(contractAddress);
        } catch (error) {
          console.error('Failed to initialize contract service:', error);
          throw new Error('Contract service not available. Please ensure your wallet is connected.');
        }
      }
      
      // Create text task on blockchain
      await realContractService.createTaskWithText(taskData);
        
      // Get the actual task index from blockchain (should be the last task)
      const blockchainTasks = await realContractService.getTasks();
      const actualTaskIndex = blockchainTasks.length - 1; // Last task is the one we just created
      
      console.log('🔍 Task created at blockchain index:', actualTaskIndex);
      
      // Store user-entered data in localStorage using blockchain index as key
      const storedTasks = JSON.parse(localStorage.getItem('userTaskData') || '{}');
      
      console.log('🔍 Storing user data with blockchain index:', actualTaskIndex);
      console.log('🔍 Task data being stored:', taskData);
      storedTasks[actualTaskIndex] = {
        title: taskData.title,
        description: taskData.description,
        dueDate: taskData.dueDate,
        priority: taskData.priority,
        createdAt: new Date().toISOString(),
        status: taskData.status,
        shouldEncrypt: true
      };
      localStorage.setItem('userTaskData', JSON.stringify(storedTasks));
      console.log('🔍 localStorage after storing:', JSON.parse(localStorage.getItem('userTaskData') || '{}'));
      
      console.log('✅ Text task created on blockchain with user data preserved at index:', actualTaskIndex);
      
      // Add to local state with blockchain index as ID
      const newTask: Task = {
        ...taskData,
        id: actualTaskIndex, // Use blockchain index as ID
        createdAt: new Date().toISOString(),
        isEncrypted: true,
        shouldEncrypt: true
      };
      
      setTasks(prev => [...prev, newTask]);
      setShowTaskForm(false);
    } catch (error) {
      console.error('Failed to create text task:', error);
    }
  };

  const handleCreateTaskWithNumbers = async (taskData: Omit<Task, 'id' | 'createdAt'> & { numericId: number }) => {
    try {
      console.log('Creating numeric task with data:', taskData);
      
      // Demo mode - create task locally
      if (isDemoMode) {
        console.log('🎮 Demo mode: Creating numeric task locally');
        const taskId = Date.now();
        const newTask: Task = {
          ...taskData,
          id: taskId,
          createdAt: new Date().toISOString(),
        };
        
        // CRITICAL: Save to localStorage for persistence
        const storedTasks = JSON.parse(localStorage.getItem('userTaskData') || '{}');
        storedTasks[taskId] = {
          title: newTask.title,
          description: newTask.description,
          dueDate: newTask.dueDate,
          priority: newTask.priority,
          createdAt: newTask.createdAt,
          status: newTask.status
        };
        localStorage.setItem('userTaskData', JSON.stringify(storedTasks));
        
        setTasks(prevTasks => [...prevTasks, newTask]);
        setShowTaskForm(false);
        console.log('✅ Demo numeric task created and saved to localStorage:', newTask);
        return;
      }
      
      console.log('FHEVM ready:', fhevmService.isReady());
      
      // Check if wallet is connected
      if (!simpleWalletService.isWalletConnected()) {
        throw new Error('Wallet not connected. Please connect your wallet first.');
      }
      
      // Ensure contract service is initialized
      if (!realContractService.isInitialized()) {
        try {
          await realContractService.initializeWithWallet(contractAddress);
        } catch (error) {
          console.error('Failed to initialize contract service:', error);
          throw new Error('Contract service not available. Please ensure your wallet is connected.');
        }
      }
      
      // Create numeric task on blockchain
      await realContractService.createTaskWithNumbers(taskData);
      
      // Get the actual task index from blockchain (should be the last task)
      const blockchainTasks = await realContractService.getTasks();
      const actualTaskIndex = blockchainTasks.length - 1; // Last task is the one we just created
      
      console.log('🔍 Task created at blockchain index:', actualTaskIndex);
      
      // Store user-entered data in localStorage using blockchain index as key
      const storedTasks = JSON.parse(localStorage.getItem('userTaskData') || '{}');
      
      console.log('🔍 Storing user data with blockchain index:', actualTaskIndex);
      console.log('🔍 Task data being stored:', taskData);
      storedTasks[actualTaskIndex] = {
        title: taskData.title,
        description: taskData.description || '',
        dueDate: taskData.dueDate,
        priority: taskData.priority,
        createdAt: new Date().toISOString(),
        status: taskData.status,
        shouldEncrypt: true
      };
      localStorage.setItem('userTaskData', JSON.stringify(storedTasks));
      console.log('🔍 localStorage after storing:', JSON.parse(localStorage.getItem('userTaskData') || '{}'));
      
      console.log('✅ Numeric task created on blockchain with user data preserved at index:', actualTaskIndex);
      
      // Add to local state with blockchain index as ID
      const newTask: Task = {
        ...taskData,
        id: actualTaskIndex, // Use blockchain index as ID
        createdAt: new Date().toISOString(),
        isEncrypted: true,
        shouldEncrypt: true
      };
      
      setTasks(prev => [...prev, newTask]);
      setShowTaskForm(false);
    } catch (error) {
      console.error('Failed to create numeric task:', error);
    }
  };

  const handleEditTask = async (taskData: Omit<Task, 'id' | 'createdAt'>) => {
    if (!editingTask) return;
    
    try {
      // Demo mode - update task in state
      setTasks(prev => prev.map(task => 
        task.id === editingTask.id 
          ? { ...task, ...taskData }
          : task
      ));
      setEditingTask(null);
      console.log('Demo: Task edited successfully');
    } catch (error) {
      console.error('Failed to edit task:', error);
      throw error;
    }
  };

  const handleCompleteTask = async (taskId: number) => {
    try {
      console.log('✅ Completing task:', taskId);
      
      // Find the task in both tasks and receivedTasks
      const task = tasks.find(t => t.id === taskId) || receivedTasks.find(t => t.id === taskId);
      if (!task) {
        console.error('Task not found:', taskId);
        return;
      }

      const newStatus = task.status === 'Completed' ? 'Pending' : 'Completed';
      console.log('✅ Target task status:', newStatus);

      const isEncrypted = !!(task.isEncrypted && task.shouldEncrypt !== false);
      // Resolve wallet-scoped storage key for consistency
      let scopedKey = 'userTaskData';
      try {
        const signer = simpleWalletService.getSigner();
        const me = await signer.getAddress();
        const normalized = me ? me : '';
        if (normalized) scopedKey = `userTaskData_${normalized}`;
      } catch {}
      if (!isEncrypted) {
        // Plain task: optimistic local update
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus as 'Completed' | 'Pending' } : t));
        setReceivedTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus as 'Completed' | 'Pending' } : t));
        const storedTasks = JSON.parse(localStorage.getItem(scopedKey) || '{}');
        if (storedTasks[taskId]) {
          storedTasks[taskId].status = newStatus;
          storedTasks[taskId].completedAt = new Date().toISOString();
          localStorage.setItem(scopedKey, JSON.stringify(storedTasks));
        }
        const completedTasks = JSON.parse(localStorage.getItem('completedTasks') || '{}');
        if (newStatus === 'Completed') {
          completedTasks[taskId] = { completedAt: new Date().toISOString(), taskTitle: task.title };
        } else {
          delete completedTasks[taskId];
        }
        localStorage.setItem('completedTasks', JSON.stringify(completedTasks));
      }

      // Demo mode - already updated local state and localStorage above
      if (isDemoMode) {
        console.log('✅ Demo: Task status updated and persisted');
        
        // Show success notification
        if ((window as any).addNotification) {
          (window as any).addNotification({
            type: 'success',
            title: 'Task Updated',
            message: `Task status changed to ${newStatus}`,
            duration: 3000
          });
        }
        return;
      }

      // Real blockchain mode - update task status on blockchain
      if (!realContractService.isInitialized()) {
        console.warn('Contract service not initialized, but task completion saved locally');
        return;
      }

      try {
        console.log('✅ Calling blockchain completeTask...');
        console.log('📝 Note: This will require signing a transaction to update the task status on-chain.');
        const result = await realContractService.completeTask(taskId);
        console.log('✅ Task completion confirmed on blockchain:', result);
        if (isEncrypted) {
          // Only after confirmation, update UI and storage for encrypted tasks
          setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus as 'Completed' | 'Pending' } : t));
          const storedTasks = JSON.parse(localStorage.getItem(scopedKey) || '{}');
          if (storedTasks[taskId]) {
            storedTasks[taskId].status = newStatus;
            storedTasks[taskId].completedAt = new Date().toISOString();
            localStorage.setItem(scopedKey, JSON.stringify(storedTasks));
          }
          const completedTasks = JSON.parse(localStorage.getItem('completedTasks') || '{}');
          if (newStatus === 'Completed') {
            completedTasks[taskId] = { completedAt: new Date().toISOString(), taskTitle: task.title };
          } else {
            delete completedTasks[taskId];
          }
          localStorage.setItem('completedTasks', JSON.stringify(completedTasks));
        }
      } catch (blockchainError) {
        console.error('❌ Blockchain completion failed:', blockchainError);
        if (!isEncrypted) {
          // Revert optimistic update for plain tasks if tx failed
          setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: task.status } : t));
          setReceivedTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: task.status } : t));
        }
        if ((window as any).addNotification) {
          (window as any).addNotification({
            type: 'error',
            title: 'Completion Failed',
            message: 'Transaction failed or was rejected.',
            duration: 4000
          });
        }
      }

    } catch (error) {
      console.error('Failed to complete task:', error);
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    console.log('🗑️ handleDeleteTask called for task ID:', taskId);
    const task = tasks.find(t => t.id === taskId) || receivedTasks.find(t => t.id === taskId);
    console.log('🗑️ Found task:', task);
    if (task) {
      console.log('🗑️ Setting deletingTask to:', task);
      setDeletingTask(task);
    } else {
      console.error('🗑️ Task not found for ID:', taskId);
    }
  };

  const confirmDeleteTask = async () => {
    console.log('🗑️ confirmDeleteTask called with deletingTask:', deletingTask);
    if (!deletingTask) {
      console.error('🗑️ No deletingTask set!');
      return;
    }
    
    try {
      console.log('🗑️ Removing task from list:', deletingTask.id);
      
      // PROPER DELETE FLOW: Remove from your view immediately (no transaction needed)
      console.log('🗑️ Removing task from your view (irreversible)');
      
      // CRITICAL: For encrypted tasks, wait for blockchain transaction BEFORE removing from UI
      const taskToDelete = tasks.find(t => t.id === deletingTask.id);
      
      // If deleting a received task: hide locally and persist hidden flag
      const isReceived = !!receivedTasks.find(t => t.id === deletingTask.id);
      if (isReceived) {
        try {
          const signer = simpleWalletService.getSigner();
          const me = await signer.getAddress();
          const hiddenKey = `hiddenReceivedTasks_${me.toLowerCase()}`;
          const hiddenMap = JSON.parse(localStorage.getItem(hiddenKey) || '{}');
          hiddenMap[deletingTask.id] = true;
          localStorage.setItem(hiddenKey, JSON.stringify(hiddenMap));
        } catch (e) {
          console.warn('Could not persist hidden flag for received task:', e);
        }
        setReceivedTasks(prev => prev.filter(task => task.id !== deletingTask.id));
        setDeletingTask(null);
        if ((window as any).addNotification) {
          (window as any).addNotification({
            type: 'success',
            title: 'Hidden',
            message: 'Task hidden from Received.',
            duration: 2500
          });
        }
        return;
      }

      // Demo mode OR plain text task - delete immediately from localStorage
      if (isDemoMode || (taskToDelete && !taskToDelete.isEncrypted)) {
        console.log('🗑️ Demo/Plain text: Deleting immediately from localStorage');
        
        // Remove from ALL localStorage keys to ensure permanent deletion
        const storedTasks = JSON.parse(localStorage.getItem('userTaskData') || '{}');
        delete storedTasks[deletingTask.id];
        localStorage.setItem('userTaskData', JSON.stringify(storedTasks));
        
        const decryptedTasksList = JSON.parse(localStorage.getItem('decryptedTasks') || '[]');
        const filteredDecrypted = decryptedTasksList.filter((id: number) => id !== deletingTask.id);
        localStorage.setItem('decryptedTasks', JSON.stringify(filteredDecrypted));
        
        setDecryptedTasks(prev => {
          const newSet = new Set(prev);
          newSet.delete(deletingTask.id);
          return newSet;
        });
        
        const completedTasks = JSON.parse(localStorage.getItem('completedTasks') || '{}');
        if (completedTasks[deletingTask.id]) {
          delete completedTasks[deletingTask.id];
          localStorage.setItem('completedTasks', JSON.stringify(completedTasks));
        }
        
        const deletedTasks = JSON.parse(localStorage.getItem('deletedTasks') || '{}');
        deletedTasks[deletingTask.id] = 'DELETED';
        localStorage.setItem('deletedTasks', JSON.stringify(deletedTasks));
        
        // Now remove from UI AFTER localStorage is updated
        setTasks(prev => prev.filter(task => task.id !== deletingTask.id));
        setReceivedTasks(prev => prev.filter(task => task.id !== deletingTask.id));
        
        console.log('✅ Demo/Plain text: Task deleted from localStorage and UI');
        setDeletingTask(null);
        
        // Show success notification
        if ((window as any).addNotification) {
          (window as any).addNotification({
            type: 'success',
            title: 'Task Deleted',
            message: 'Task has been permanently deleted.',
            duration: 3000
          });
        }
        return;
      }
      
      // Encrypted task - WAIT for blockchain transaction BEFORE removing from UI
      if (taskToDelete && taskToDelete.isEncrypted && realContractService.isInitialized()) {
        try {
          console.log('🗑️ Encrypted task detected - calling blockchain deleteTask FIRST:', deletingTask.id);
          await realContractService.deleteTask(deletingTask.id);
          console.log('✅ Encrypted task deleted from blockchain');
          
          // NOW remove from localStorage after successful blockchain deletion
          const storedTasks = JSON.parse(localStorage.getItem('userTaskData') || '{}');
          delete storedTasks[deletingTask.id];
          localStorage.setItem('userTaskData', JSON.stringify(storedTasks));
          
          const decryptedTasksList = JSON.parse(localStorage.getItem('decryptedTasks') || '[]');
          const filteredDecrypted = decryptedTasksList.filter((id: number) => id !== deletingTask.id);
          localStorage.setItem('decryptedTasks', JSON.stringify(filteredDecrypted));
          
          setDecryptedTasks(prev => {
            const newSet = new Set(prev);
            newSet.delete(deletingTask.id);
            return newSet;
          });
          
          const completedTasks = JSON.parse(localStorage.getItem('completedTasks') || '{}');
          if (completedTasks[deletingTask.id]) {
            delete completedTasks[deletingTask.id];
            localStorage.setItem('completedTasks', JSON.stringify(completedTasks));
          }
          
          const deletedTasks = JSON.parse(localStorage.getItem('deletedTasks') || '{}');
          deletedTasks[deletingTask.id] = 'DELETED';
          localStorage.setItem('deletedTasks', JSON.stringify(deletedTasks));
          
          // NOW remove from UI after successful blockchain transaction
          setTasks(prev => prev.filter(task => task.id !== deletingTask.id));
          setReceivedTasks(prev => prev.filter(task => task.id !== deletingTask.id));
          
          console.log('✅ Encrypted task: Deleted from blockchain, localStorage, and UI');
          
          // Show success notification
          if ((window as any).addNotification) {
            (window as any).addNotification({
              type: 'success',
              title: 'Task Deleted',
              message: 'Encrypted task has been permanently deleted from blockchain.',
              duration: 3000
            });
          }
        } catch (blockchainError) {
          console.error('❌ Blockchain deletion failed:', blockchainError);
          
          // Show error notification
          if ((window as any).addNotification) {
            (window as any).addNotification({
              type: 'error',
              title: 'Deletion Failed',
              message: 'Failed to delete encrypted task. Please try again.',
              duration: 4000
            });
          }
          // Transaction failed - DO NOT remove from UI (already handled by notification above)
        }
      }
      
      // Task successfully removed from view
      console.log('✅ Task removed from view successfully');
      
      console.log('🗑️ Setting deletingTask to null');
      setDeletingTask(null);
      
    } catch (error) {
      console.error('❌ Failed to delete task:', error);
      if ((window as any).addNotification) {
        (window as any).addNotification({
          type: 'error',
          title: 'Delete Failed',
          message: (error as Error).message || 'Please try again.',
          duration: 5000
        });
      }
      
      // Ensure the task is restored in UI if deletion failed
      await loadTasks();
      await loadReceivedTasks();
    }
  };

  const handleArchiveTask = (taskId: number) => {
    try {
      const task = receivedTasks.find(t => t.id === taskId);
      if (!task) return;

      // Store archived task in localStorage
      const signer = simpleWalletService.getSigner();
      const userAddress = simpleWalletService.getAddress();
      const archiveKey = `archivedReceivedTasks_${userAddress?.toLowerCase()}`;
      const archivedTasks = JSON.parse(localStorage.getItem(archiveKey) || '{}');
      archivedTasks[taskId] = { ...task, archivedAt: new Date().toISOString() };
      localStorage.setItem(archiveKey, JSON.stringify(archivedTasks));

      // Remove from received tasks view
      setReceivedTasks(prev => prev.filter(t => t.id !== taskId));

      // Show success notification
      if ((window as any).addNotification) {
        (window as any).addNotification({
          type: 'success',
          title: 'Task Archived',
          message: 'Task has been archived and hidden from your inbox.',
          duration: 2500
        });
      }
    } catch (error) {
      console.error('Failed to archive task:', error);
    }
  };

  const handleDecryptTask = (taskId: number, options?: { preferReceived?: boolean }) => {
    const preferReceived = options?.preferReceived ?? false;

    const primaryList = preferReceived ? receivedTasks : tasks;
    const secondaryList = preferReceived ? tasks : receivedTasks;

    const task = primaryList.find((t) => t.id === taskId) || secondaryList.find((t) => t.id === taskId);

    if (task) {
      // Clone to avoid accidental mutations propagating back into the list
      setDecryptingTask({ ...task });
    }
  };

  // Bulk selection functions
  const toggleTaskSelection = (taskId: number) => {
    setSelectedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const selectAllTasks = () => {
    const currentTasks = activeTab === 'my-tasks' ? tasks : receivedTasks;
    const allTaskIds = currentTasks.map(task => task.id);
    setSelectedTasks(new Set(allTaskIds));
  };

  const clearSelection = () => {
    setSelectedTasks(new Set());
    setIsSelectionMode(false);
  };

  const bulkDeleteTasks = async () => {
    if (selectedTasks.size === 0) return;
    
    try {
      setIsLoading(true);
      
      // IMMEDIATELY remove all selected tasks from local state
      const selectedTaskIds = Array.from(selectedTasks);
      setTasks(prev => prev.filter(task => !selectedTasks.has(task.id)));
      setReceivedTasks(prev => prev.filter(task => !selectedTasks.has(task.id)));

      // If clearing from Received tab, persist hidden flags and skip blockchain/local storage deletion
      if (activeTab === 'received-tasks') {
        try {
          const signer = simpleWalletService.getSigner();
          const me = await signer.getAddress();
          const hiddenKey = `hiddenReceivedTasks_${me.toLowerCase()}`;
          const hiddenMap = JSON.parse(localStorage.getItem(hiddenKey) || '{}');
          selectedTaskIds.forEach((id: number) => hiddenMap[id] = true);
          localStorage.setItem(hiddenKey, JSON.stringify(hiddenMap));
        } catch {}
        clearSelection();
        setShowBulkDeleteModal(false);
        setIsLoading(false);
        if ((window as any).addNotification) {
          (window as any).addNotification({
            type: 'success',
            title: 'Received Cleared',
            message: 'Selected received tasks hidden.',
            duration: 2500
          });
        }
        return;
      }
      
      // PERMANENTLY remove from localStorage
      const storedTasks = JSON.parse(localStorage.getItem('userTaskData') || '{}');
      const decryptedTasksList = JSON.parse(localStorage.getItem('decryptedTasks') || '[]');
      const completedTasks = JSON.parse(localStorage.getItem('completedTasks') || '{}');
      const deletedTasks = JSON.parse(localStorage.getItem('deletedTasks') || '{}');
      
      selectedTaskIds.forEach((taskId: number) => {
        // Remove from userTaskData
        delete storedTasks[taskId];
        
        // Remove from decryptedTasks list
        const filteredIndex = decryptedTasksList.indexOf(taskId);
        if (filteredIndex > -1) {
          decryptedTasksList.splice(filteredIndex, 1);
        }
        
        // Remove from completedTasks
        if (completedTasks[taskId]) {
          delete completedTasks[taskId];
        }
        
        // Mark as deleted
        deletedTasks[taskId] = 'DELETED';
      });
      
      // Save all updates to localStorage
      localStorage.setItem('userTaskData', JSON.stringify(storedTasks));
      localStorage.setItem('decryptedTasks', JSON.stringify(decryptedTasksList));
      localStorage.setItem('completedTasks', JSON.stringify(completedTasks));
      localStorage.setItem('deletedTasks', JSON.stringify(deletedTasks));
      
      // Update decryptedTasks state
      setDecryptedTasks(new Set(decryptedTasksList));
      
      console.log(`🗑️ Permanently deleted ${selectedTaskIds.length} tasks from all localStorage stores`);
      
      // Demo mode - already removed from local state above
      if (isDemoMode) {
        console.log(`✅ Demo: ${selectedTaskIds.length} tasks permanently removed`);
        clearSelection();
        setShowBulkDeleteModal(false);
        setIsLoading(false);
        return;
      }
      
      // Real blockchain mode - delete encrypted tasks from blockchain
      // Plain text tasks are only in localStorage
      if (!isDemoMode && realContractService.isInitialized()) {
        let blockchainDeleteCount = 0;
        
        for (const taskId of selectedTaskIds) {
          const taskToDelete = tasks.find(t => t.id === taskId);
          
          // Only call blockchain for ENCRYPTED tasks
          if (taskToDelete && taskToDelete.isEncrypted) {
            try {
              await realContractService.deleteTask(taskId);
              blockchainDeleteCount++;
              console.log(`✅ Encrypted task ${taskId} deleted from blockchain`);
            } catch (error) {
              console.error(`❌ Failed to delete encrypted task ${taskId}:`, error);
            }
          }
        }
        
        console.log(`✅ ${blockchainDeleteCount} encrypted tasks deleted from blockchain`);
      }
      
      // Clear selection and close modal
      clearSelection();
      setShowBulkDeleteModal(false);
      
    } catch (error) {
      console.error('Failed to bulk remove tasks:', error);
      if ((window as any).addNotification) {
        (window as any).addNotification({
          type: 'error',
          title: 'Bulk Removal Failed',
          message: 'Please try again.',
          duration: 5000
        });
      }
      
      // Restore all tasks if bulk operation failed
      await loadTasks();
      await loadReceivedTasks();
    } finally {
      setIsLoading(false);
    }
  };

  const confirmDecryptTask = async () => {
    if (!decryptingTask) return;
    
    setIsDecrypting(true);
    
    try {
      // Demo mode - simulate decryption using localStorage data
      if (isDemoMode) {
        console.log('🎮 Demo mode: Simulating decryption...');
        
        // Get the stored task data
        const storedTasks = JSON.parse(localStorage.getItem('userTaskData') || '{}');
        const taskId = decryptingTask.id;
        
        // Find the stored task by ID (timestamp-based)
        const storedTask = Object.values(storedTasks).find((task: any) => {
          // Match by creation time proximity since demo mode uses timestamp IDs
          const taskTime = new Date(task.createdAt).getTime();
          const decryptTime = new Date(decryptingTask.createdAt).getTime();
          return Math.abs(taskTime - decryptTime) < 1000; // Within 1 second
        }) as any;
        
        if (storedTask && storedTask.title) {
          console.log('✅ Demo: Found stored task data');
          
          // Mark task as decrypted and persist to localStorage
          setDecryptedTasks(prev => {
            const newSet = new Set([...prev, decryptingTask.id]);
            // DO NOT save to localStorage - decryption should be session-only for security
            console.log('✅ Task decrypted in this session (will require re-decryption on refresh)');
            return newSet;
          });
          
          // Update the task with decrypted data
          setTasks(prev => prev.map(task => 
            task.id === decryptingTask.id 
              ? { 
                  ...task, 
                  title: (storedTask as any).title,
                  description: (storedTask as any).description,
                  dueDate: (storedTask as any).dueDate,
                  priority: (storedTask as any).priority,
                  isEncrypted: false
                }
              : task
          ));
          
          setDecryptingTask(null);
          console.log('✅ Demo: Task decrypted successfully');
          
          // Show success notification
          if ((window as any).addNotification) {
            (window as any).addNotification({
              type: 'success',
              title: 'Task Decrypted',
              message: `Task "${storedTask.title}" decrypted successfully!`,
              duration: 3000
            });
          }
          return;
        } else {
          throw new Error('Demo: Task data not found in localStorage');
        }
      }
      
      console.log('Connecting to real backend contract for decryption...');
      console.log('Contract address being used:', contractAddress);
      console.log('Contract service initialized:', realContractService.isInitialized());
      console.log('Contract service address:', realContractService.getContractAddress());
      
      // Check if wallet is connected
      // Check wallet connection using simple wallet service (more reliable)
      const signer = simpleWalletService.getSigner();
      if (!signer) {
        throw new Error('Wallet not connected. Please connect your wallet first.');
      }
      
      // Ensure contract service is properly initialized
      if (!realContractService.isInitialized()) {
        try {
          // First try to initialize with wallet
          await realContractService.initializeWithWallet(contractAddress);
        } catch (walletError) {
          console.warn('Wallet initialization failed, trying with contract address:', walletError);
          try {
            // Fallback: initialize with contract address
            await realContractService.initialize(contractAddress);
          } catch (contractError) {
            console.error('Failed to initialize contract service:', contractError);
            throw new Error('Contract service not available. Please ensure your wallet is connected.');
          }
        }
      }
      
      const receivedMatch = receivedTasks.find((t) => t.id === decryptingTask.id);
      const resolvedOriginalOwner = decryptingTask.originalOwner || receivedMatch?.originalOwner;
      const resolvedBlockchainIndex = decryptingTask.blockchainIndex ?? receivedMatch?.blockchainIndex;

      const isSharedTask = !!resolvedOriginalOwner;
      
      // Call real contract method to decrypt task
      console.log('🔓 Starting decryption for task ID:', decryptingTask.id);
      console.log('🔓 Task details:', {
        id: decryptingTask.id,
        title: decryptingTask.title,
        isEncrypted: decryptingTask.isEncrypted,
        isShared: isSharedTask,
        originalOwner: decryptingTask.originalOwner
      });
      
      // Use appropriate decryption method
      const result = isSharedTask && resolvedOriginalOwner
        ? await realContractService.decryptSharedTask(decryptingTask.id, resolvedOriginalOwner)
        : await realContractService.decryptTask(decryptingTask.id);
      
      console.log('🔓 Decryption result:', result);
      
      if (result.success) {
        // Mark task as decrypted and persist to localStorage
        setDecryptedTasks(prev => {
          const newSet = new Set([...prev, decryptingTask.id]);
          // DO NOT save to localStorage - decryption should be session-only for security
          console.log('✅ Task decrypted in this session (will require re-decryption on refresh)');
          return newSet;
        });
        
        const normalizeDecryptedMetadata = (raw: any) => {
          if (!raw) return null;

          const merged = (() => {
            if (raw.taskData && typeof raw.taskData === 'object') {
              return { ...raw.taskData, ...raw };
            }
            return raw;
          })();

          const parsePriority = (value: any) => {
            if (value === null || value === undefined) return undefined;
            if (typeof value === 'number') return value;
            const parsed = parseInt(value, 10);
            return isNaN(parsed) ? undefined : parsed;
          };

          const parseDueDate = (value: any) => {
            if (!value) return '';
            if (value instanceof Date) return value.toISOString();
            if (typeof value === 'number') {
              const ms = value < 10000000000 ? value * 1000 : value;
              const date = new Date(ms);
              return isNaN(date.getTime()) ? '' : date.toISOString();
            }
            const parsed = Date.parse(value);
            if (!Number.isNaN(parsed)) {
              return new Date(parsed).toISOString();
            }
            return String(value);
          };

          return {
            title: merged.title ?? merged.name ?? '',
            description: merged.description ?? merged.notes ?? '',
            dueDate: parseDueDate(merged.dueDate ?? merged.deadline),
            priority: parsePriority(merged.priority ?? merged.importance ?? merged.rank),
          };
        };

        const resolveTaskMetadata = (collection: any, stableId: number, index?: number) => {
          if (!collection) return null;

          const arrayCandidates: any[] = Array.isArray(collection)
            ? collection
            : typeof collection === 'object'
              ? Object.values(collection)
              : [];

          const identifyCandidate = (candidate: any): boolean => {
            if (!candidate || typeof candidate !== 'object') return false;
            const candidateIds = [
              candidate?.stableTaskId,
              candidate?.taskId,
              candidate?.taskID,
              candidate?.id,
              candidate?.index,
              candidate?.taskIndex,
              candidate?.blockchainIndex,
              candidate?.originalId,
              candidate?.numericId,
              candidate?.timestamp,
              candidate?.createdAt,
            ]
              .filter((value) => value !== null && value !== undefined)
              .map((value) => {
                if (typeof value === 'number' || typeof value === 'bigint') {
                  return value.toString();
                }
                return String(value);
              });

            const targets = [stableId, index]
              .filter((value) => value !== null && value !== undefined)
              .map((value) => value?.toString?.() ?? String(value));

            if (targets.length === 0) {
              return false;
            }

            return targets.some((target) => candidateIds.includes(target));
          };

          const candidates: any[] = [];

          const collect = (value: any) => {
            if (value !== undefined && value !== null) {
              candidates.push(value);
            }
          };

          if (!Array.isArray(collection) && typeof collection === 'object') {
            if (index !== undefined) {
              collect(collection?.[index]);
              collect(collection?.[String(index)]);
            }
            if (stableId !== undefined && stableId !== null) {
              collect(collection?.[stableId]);
              collect(collection?.[String(stableId)]);
            }
          }

          candidates.push(...arrayCandidates);

          const matched = candidates.find(identifyCandidate);
          if (matched) {
            return matched;
          }

          const firstWithReadableTitle = candidates.find((candidate) => {
            const normalized = normalizeDecryptedMetadata(candidate);
            return normalized && normalized.title && normalized.title !== '******* ********';
          });

          return firstWithReadableTitle ?? candidates[0] ?? null;
        };

        // Update the task with decrypted data if available (for both my tasks and received tasks)
        if (result.decryptedData) {
          // Check if task is in receivedTasks or my tasks
          const isReceivedTask = receivedTasks.some(t => t.id === decryptingTask.id);
          
      // IMPORTANT: Get the original readable text from backend/localStorage
      // The result.decryptedData may contain numeric hashes from blockchain
      // We need the actual readable text that was stored when creating the task
      const normalizedRelayerData = normalizeDecryptedMetadata(result.decryptedData);
      let actualDecryptedData = normalizedRelayerData ?? result.decryptedData;
          
          // Try to get original task data from backend first, then localStorage
          if (!isReceivedTask) {
            try {
              // Try 1: Backend (most reliable)
              try {
                const backendTasks = await backendService.getTasks();
                const backendCandidate = resolveTaskMetadata(
                  backendTasks,
                  decryptingTask.stableTaskId ?? decryptingTask.id,
                  decryptingTask.blockchainIndex ?? decryptingTask.id,
                );
                const normalizedBackend = normalizeDecryptedMetadata(backendCandidate);
                if (normalizedBackend) {
                  actualDecryptedData = {
                    ...actualDecryptedData,
                    ...normalizedBackend,
                  };
                  console.log('✅ Using original task data from backend:', actualDecryptedData);
                }
              } catch (backendError) {
                console.warn('⚠️ Backend lookup failed, trying localStorage:', backendError);
                
                // Try 2: localStorage (fallback)
                const userAddress = simpleWalletService.getAddress();
                if (userAddress) {
                  const userKey = `userTaskData_${userAddress}`;
                  const storedTasks = JSON.parse(localStorage.getItem(userKey) || localStorage.getItem('userTaskData') || '{}');
                  const originalTask = resolveTaskMetadata(
                    storedTasks,
                    decryptingTask.stableTaskId ?? decryptingTask.id,
                    decryptingTask.blockchainIndex ?? decryptingTask.id,
                  );

                  const normalizedStored = normalizeDecryptedMetadata(originalTask);
                  if (normalizedStored) {
                    actualDecryptedData = {
                      ...actualDecryptedData,
                      ...normalizedStored,
                    };
                    console.log('✅ Using original task data from localStorage:', actualDecryptedData);
                  }
                }
              }
            } catch (error) {
              console.warn('⚠️ Could not get original task data, using decrypted data:', error);
            }
          } else if (resolvedOriginalOwner) {
            try {
              const ownerTasks = await backendService.getTasksForAddress(resolvedOriginalOwner);
              const matchingOwnerTask = resolveTaskMetadata(
                ownerTasks,
                decryptingTask.stableTaskId ?? decryptingTask.id,
                resolvedBlockchainIndex ?? decryptingTask.id,
              );
              const normalizedOwner = normalizeDecryptedMetadata(matchingOwnerTask);
              if (normalizedOwner) {
                actualDecryptedData = {
                  ...normalizedOwner,
                  description: normalizedOwner.description ?? actualDecryptedData?.description ?? '',
                };
                console.log('✅ Using shared task metadata from original owner:', actualDecryptedData);
              }
            } catch (sharedMetaError) {
              console.warn('⚠️ Could not load shared task metadata from original owner:', sharedMetaError);
            }
          }
          
          // Fallback to relayer-provided values if backend metadata missing
          if ((actualDecryptedData?.title === undefined || actualDecryptedData?.title === '') && normalizedRelayerData?.title) {
            actualDecryptedData = { ...actualDecryptedData, title: normalizedRelayerData.title };
          }
          if ((actualDecryptedData?.description === undefined || actualDecryptedData?.description === '') && normalizedRelayerData?.description) {
            actualDecryptedData = { ...actualDecryptedData, description: normalizedRelayerData.description };
          }
          if ((actualDecryptedData?.dueDate === undefined || actualDecryptedData?.dueDate === '') && normalizedRelayerData?.dueDate) {
            actualDecryptedData = { ...actualDecryptedData, dueDate: normalizedRelayerData.dueDate };
          }
          if ((actualDecryptedData?.priority === undefined || actualDecryptedData?.priority === null) && normalizedRelayerData?.priority !== undefined) {
            actualDecryptedData = { ...actualDecryptedData, priority: normalizedRelayerData.priority };
          }

          // Ensure we have sensible defaults to avoid placeholders persisting
          actualDecryptedData = {
            title: actualDecryptedData?.title ?? '',
            description: actualDecryptedData?.description ?? '',
            dueDate: normalizeDecryptedMetadata({ dueDate: actualDecryptedData?.dueDate })?.dueDate || '',
            priority: typeof actualDecryptedData?.priority === 'number'
              ? actualDecryptedData.priority
              : parseInt(actualDecryptedData?.priority ?? '0', 10) || 0,
          };

          if (isReceivedTask) {
            setReceivedTasks(prev => prev.map(task => 
              task.id === decryptingTask.id 
                ? { 
                    ...task, 
                    title: actualDecryptedData.title,
                    description: actualDecryptedData.description || task.description,
                    dueDate: actualDecryptedData.dueDate,
                    priority: actualDecryptedData.priority ?? task.priority ?? 0,
                    isEncrypted: false, // Mark as decrypted so UI shows plaintext
                    shouldEncrypt: task.shouldEncrypt,
                  }
                : task
            ));
            console.log('✅ Received task decrypted and updated');
          } else {
          setTasks(prev => prev.map(task => 
            task.id === decryptingTask.id 
              ? { 
                  ...task, 
                  title: actualDecryptedData.title,
                  description: actualDecryptedData.description || task.description,
                  dueDate: actualDecryptedData.dueDate,
                  priority: actualDecryptedData.priority,
                  // Keep isEncrypted=true so task can be shared (decryption just makes it readable)
                  isEncrypted: true,
                  shouldEncrypt: true
                }
              : task
          ));
            console.log('✅ My task decrypted and updated');
          }
        } else {
          console.log('✅ Task decrypted successfully via real contract');
        }
        
        setDecryptingTask(null);
        
        // Show success notification
        if ((window as any).addNotification) {
          (window as any).addNotification({
            type: 'success',
            title: 'Task Decrypted',
            message: `Task decrypted successfully!`,
            duration: 3000
          });
        }
      } else {
        // ✅ PRIVACY FIX: Don't show error messages, keep asterisks
        console.log('Decryption failed - keeping encrypted state:', result.error);
        setDecryptingTask(null);
        
        // Show error notification
        if ((window as any).addNotification) {
          (window as any).addNotification({
            type: 'error',
            title: 'Decryption Failed',
            message: result.error || 'Unable to decrypt task. Please try again.',
            duration: 4000
          });
        }
      }
      
    } catch (error: any) {
      console.error('Failed to decrypt task:', error);
      console.error('Error details:', {
        message: error?.message,
        code: error?.code,
        name: error?.name
      });
      
      // Show user-friendly error notification
      let errorTitle = 'Decryption Failed';
      let errorMessage = error?.message || 'Unknown error occurred';
      
      if (error?.message?.includes('requestTaskDecryption method not found')) {
        errorTitle = 'Contract Error';
        errorMessage = 'Decryption method not found. Please check if the contract is properly deployed.';
      } else if (error?.message?.includes('Wallet not connected')) {
        errorTitle = 'Wallet Error';
        errorMessage = 'Please connect your wallet first.';
      } else if (error?.message?.includes('User rejected')) {
        errorTitle = 'Transaction Rejected';
        errorMessage = 'You cancelled the transaction in your wallet.';
      } else if (error?.message?.includes('Transaction timeout')) {
        errorTitle = 'Transaction Timeout';
        errorMessage = 'The transaction took too long to confirm. Please try again.';
      }
      
      if ((window as any).addNotification) {
        (window as any).addNotification({
          type: 'error',
          title: errorTitle,
          message: errorMessage,
          duration: 5000
        });
      }
      
      setDecryptingTask(null);
    } finally {
      setIsDecrypting(false);
    }
  };

  const simulateWalletPopup = async (): Promise<boolean> => {
    return new Promise((resolve) => {
      const popup = window.open('', 'wallet-popup', 'width=400,height=600,scrollbars=yes,resizable=yes');
      
      if (!popup) {
        // Fallback if popup blocked
        const confirmed = confirm('🔐 Wallet Transaction Required\n\nSign transaction to decrypt task data?\n\nGas Fee: ~0.001 ETH\n\nClick OK to confirm, Cancel to reject.');
        resolve(confirmed);
        return;
      }
      
      popup.document.write(`
        <html>
          <head>
            <title>MetaMask Transaction</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; background: #f0f0f0; }
              .container { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              .header { display: flex; align-items: center; margin-bottom: 20px; }
              .logo { width: 40px; height: 40px; background: #f6851b; border-radius: 8px; margin-right: 15px; }
              .title { font-size: 18px; font-weight: bold; }
              .transaction { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; }
              .gas-fee { color: #666; font-size: 14px; margin-top: 10px; }
              .buttons { display: flex; gap: 10px; margin-top: 20px; }
              .btn { padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
              .btn-reject { background: #dc3545; color: white; }
              .btn-confirm { background: #28a745; color: white; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="logo"></div>
                <div class="title">MetaMask Transaction</div>
              </div>
              
              <h3>Decrypt Task Data</h3>
              <p>You are about to decrypt encrypted task data from the blockchain.</p>
              
              <div class="transaction">
                <strong>Contract:</strong> TaskManager<br>
                <strong>Method:</strong> decryptTask<br>
                <strong>Task ID:</strong> ${decryptingTask?.id}<br>
                <div class="gas-fee">Estimated Gas Fee: ~0.001 ETH</div>
              </div>
              
              <p><strong>⚠️ This will:</strong></p>
              <ul>
                <li>Sign a transaction with your wallet</li>
                <li>Pay gas fees for decryption</li>
                <li>Make task data readable to you</li>
                <li>Record the operation on-chain</li>
              </ul>
              
              <div class="buttons">
                <button class="btn btn-reject" onclick="window.close(); parent.postMessage('reject', '*');">Reject</button>
                <button class="btn btn-confirm" onclick="parent.postMessage('confirm', '*'); window.close();">Confirm</button>
              </div>
            </div>
          </body>
        </html>
      `);
      
      const handleMessage = (event: MessageEvent) => {
        if (event.data === 'confirm') {
          resolve(true);
          window.removeEventListener('message', handleMessage);
        } else if (event.data === 'reject') {
          resolve(false);
          window.removeEventListener('message', handleMessage);
        }
      };
      
      window.addEventListener('message', handleMessage);
      
      // Handle popup close
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', handleMessage);
          resolve(false);
        }
      }, 1000);
    });
  };

  const handleShareTask = async (taskId: number, recipientAddress: string | string[]) => {
    try {
      // Normalize to array
      const addresses = Array.isArray(recipientAddress) ? recipientAddress : [recipientAddress];
      console.log('🔗 Sharing task:', taskId, 'with', addresses.length, 'recipient(s)');
      
      // Demo mode - simulate sharing
      if (isDemoMode) {
        console.log('🎮 Demo: Sharing task', taskId, 'with', addresses.length, 'recipient(s)');
      setSharingTask(null);
        if ((window as any).addNotification) {
          (window as any).addNotification({
            type: 'info',
            title: 'Demo Share',
            message: `Task shared with ${addresses.length} recipient(s).`,
            duration: 3000
          });
        }
        return;
      }

      // Real blockchain mode - share task on blockchain
      if (!realContractService.isInitialized()) {
        throw new Error('Contract service not initialized');
      }

      // Find the task (from either list)
      const task = tasks.find(t => t.id === taskId) || receivedTasks.find(t => t.id === taskId);
      if (!task) {
        throw new Error('Task not found');
      }

      // Prevent sharing plain (non-encrypted) tasks
      if (!task.isEncrypted || task.shouldEncrypt === false) {
        throw new Error('Plain tasks cannot be shared. Only encrypted tasks can be shared.');
      }

      // Use stable on-chain taskId when available (share is byId)
      const shareTaskId = (task as any).stableTaskId ?? task.id;

      // Share with each recipient
      const sharedRecipients: string[] = [];
      for (const address of addresses) {
        // Validate recipient address
        if (!address || !address.startsWith('0x') || address.length !== 42) {
          throw new Error(`Invalid recipient address: ${address}`);
        }

        try {
          console.log(`📤 Sharing with ${address}...`);
          await realContractService.shareTask(shareTaskId, address);
          sharedRecipients.push(address);
          console.log(`✅ Shared with ${address}`);
    } catch (error) {
          console.error(`❌ Failed to share with ${address}:`, error);
          throw new Error(`Failed to share with ${address}: ${(error as Error).message}`);
    }
      }
      
      // Update local state to mark task as shared
      setTasks(prev => prev.map(t => 
        t.id === taskId 
          ? { ...t, isShared: true, sharedWith: sharedRecipients }
          : t
      ));

      // Update backend and localStorage with sharedWith data
      const userAddress = simpleWalletService.getAddress();
      if (userAddress) {
        try {
          // Update backend
          await backendService.updateTask(taskId, {
            isShared: true,
            sharedWith: sharedRecipients
          });
          console.log('✅ Shared recipients saved to backend');
        } catch (backendError) {
          console.warn('⚠️ Failed to update backend with shared recipients:', backendError);
        }
      }
      
      // Update localStorage
      const scopedKey = userAddress ? `userTaskData_${userAddress}` : 'userTaskData';
      const storedTasks = JSON.parse(localStorage.getItem(scopedKey) || '{}');
      if (storedTasks[taskId]) {
        const existingShared = storedTasks[taskId].sharedWith || [];
        const updatedShared = [...new Set([...existingShared, ...sharedRecipients])];
        storedTasks[taskId] = { 
          ...storedTasks[taskId], 
          isShared: true, 
          sharedWith: updatedShared 
        };
        localStorage.setItem(scopedKey, JSON.stringify(storedTasks));
      }

      setSharingTask(null);
      console.log('✅ Task shared successfully with all recipients');
      
      // Show success notification
      if ((window as any).addNotification) {
        (window as any).addNotification({
          type: 'success',
          title: 'Task Shared Successfully!',
          message: `Task has been shared with ${sharedRecipients.length} recipient(s). They can now decrypt and view this task.`,
          duration: 6000
        });
      }
      
    } catch (error) {
      console.error('❌ Failed to share task:', error);
      
      // Show error notification
      if ((window as any).addNotification) {
        (window as any).addNotification({
          type: 'error',
          title: 'Failed to Share Task',
          message: (error as Error).message || 'An error occurred while sharing the task.',
          duration: 6000
        });
      }
      throw error;
    }
  };


  const filteredBase = encryptedOnly && activeTab === 'my-tasks'
    ? tasks.filter(t => t.isEncrypted && t.shouldEncrypt !== false)
    : tasks;
  const pendingTasks = filteredBase.filter(task => task.status === 'Pending');
  const completedTasks = filteredBase.filter(task => task.status === 'Completed');

  // Show wallet connection prompt if wallet not connected
  if (showWalletConnect) {
    return (
      <div className="min-h-screen bg-zama-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-zama-black rounded-full flex items-center justify-center mx-auto mb-6">
            <Shield className="w-8 h-8 text-zama-yellow" />
          </div>
          
          <h2 className="text-2xl font-bold text-zama-gray-900 mb-3">
            Connect Your Wallet
          </h2>
          <p className="text-zama-gray-600 mb-6">
            To create encrypted tasks on the blockchain, you need to connect your wallet first.
          </p>
          
          <button
            onClick={connectWallet}
            className="bg-zama-black hover:bg-zama-gray-800 text-zama-yellow font-bold py-3 px-6 rounded-lg transition-colors w-full"
          >
            Connect Wallet
          </button>
          
          <p className="text-xs text-zama-gray-500 mt-4">
            Your tasks will be encrypted and stored on Sepolia testnet
          </p>
          
          {/* Show disconnect option if wallet was previously connected */}
          {simpleWalletService.isWalletConnected() && (
            <button
              onClick={disconnectWallet}
              className="mt-3 text-sm text-zama-gray-500 hover:text-zama-gray-700 underline"
            >
              Disconnect Wallet
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-zama-gray-900">
              📋 My Tasks ({filteredBase.length})
            </h2>
            <div className="mt-1 flex space-x-2">
              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                isDemoMode ? 'bg-blue-100 text-blue-800' : (fhevmService.isReady() ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800')
              }`}>
                {isDemoMode ? '🎮 Demo Mode' : (fhevmService.isReady() ? '✅ FHEVM Ready' : '⏳ FHEVM Initializing...')}
              </span>
            </div>
          </div>
          
          {/* Wallet status removed - already shown in main header */}
          <button
            onClick={() => setShowTaskForm(true)}
            className="btn-primary flex items-center space-x-2"
            // Allow button to work even if FHEVM is still initializing
            title="Create new task"
          >
            <Plus className="w-4 h-4" />
            <span>New Task</span>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-zama-gray-100 p-1 rounded-lg mb-4">
          <button
            onClick={() => setActiveTab('my-tasks')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'my-tasks'
                ? 'bg-white text-zama-gray-900 shadow-sm'
                : 'text-zama-gray-600 hover:text-zama-gray-900'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <Shield className="w-4 h-4" />
              <span>My Tasks ({filteredBase.length})</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('received-tasks')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'received-tasks'
                ? 'bg-white text-zama-gray-900 shadow-sm'
                : 'text-zama-gray-600 hover:text-zama-gray-900'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <Users className="w-4 h-4" />
              <span>Received ({receivedTasks.length})</span>
            </div>
          </button>
        </div>

        {/* Quick Stats */}
        {activeTab === 'received-tasks' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 bg-zama-gray-50 rounded-lg">
              <div className="flex items-center justify-center mb-1">
                <Users className="w-5 h-5 text-zama-yellow" />
              </div>
              <div className="text-lg font-semibold text-zama-gray-900">{receivedTasks.length}</div>
              <div className="text-sm text-zama-gray-600">Received</div>
            </div>
            <div className="text-center p-3 bg-zama-gray-50 rounded-lg">
              <div className="flex items-center justify-center mb-1">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <div className="text-lg font-semibold text-zama-gray-900">{receivedTasks.filter(t => decryptedTasks.has(t.id)).length}</div>
              <div className="text-sm text-zama-gray-600">Decrypted</div>
            </div>
            <div className="text-center p-3 bg-zama-gray-50 rounded-lg">
              <div className="flex items-center justify-center mb-1">
                <Clock className="w-5 h-5 text-blue-500" />
              </div>
              <div className="text-lg font-semibold text-zama-gray-900">{receivedTasks.filter(t => !decryptedTasks.has(t.id)).length}</div>
              <div className="text-sm text-zama-gray-600">Encrypted</div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <div className="text-center p-3 bg-zama-gray-50 rounded-lg">
            <div className="flex items-center justify-center mb-1">
              <Shield className="w-5 h-5 text-zama-yellow" />
            </div>
              <div className="text-lg font-semibold text-zama-gray-900">{filteredBase.length}</div>
              <div className="text-sm text-zama-gray-600">Tasks</div>
          </div>
          <div className="text-center p-3 bg-zama-gray-50 rounded-lg">
            <div className="flex items-center justify-center mb-1">
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-lg font-semibold text-zama-gray-900">{pendingTasks.length}</div>
            <div className="text-sm text-zama-gray-600">Pending</div>
          </div>
          <div className="text-center p-3 bg-zama-gray-50 rounded-lg">
            <div className="flex items-center justify-center mb-1">
              <CheckCircle className="w-5 h-5 text-green-500" />
            </div>
            <div className="text-lg font-semibold text-zama-gray-900">{completedTasks.length}</div>
            <div className="text-sm text-zama-gray-600">Completed</div>
          </div>
            </div>
        )}
      </div>

      {/* Tasks List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="card text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zama-yellow mx-auto mb-4"></div>
            <p className="text-zama-gray-600">Loading encrypted tasks...</p>
          </div>
        ) : (tasks.length === 0 && activeTab === 'my-tasks') ? (
          <div className="card text-center py-12">
            <Shield className="w-12 h-12 text-zama-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-zama-gray-900 mb-2">No tasks yet</h3>
            <p className="text-zama-gray-600 mb-4">Create your first encrypted task to get started</p>
            <button
              onClick={() => setShowTaskForm(true)}
              className="btn-primary"
            >
              Create First Task
            </button>
          </div>
        ) : (
          <>
            {/* Bulk Selection Controls */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setIsSelectionMode(!isSelectionMode)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    isSelectionMode 
                      ? 'bg-zama-yellow text-zama-black' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {isSelectionMode ? 'Exit Selection' : 'Select Tasks'}
                </button>
                
                {isSelectionMode && (
                  <>
                    <button
                      onClick={selectAllTasks}
                      className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                    >
                      Select All
                    </button>
                    <button
                      onClick={clearSelection}
                      className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Clear ({selectedTasks.size})
                    </button>
                    {selectedTasks.size > 0 && (
                      <button
                        onClick={() => setShowBulkDeleteModal(true)}
                        className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                      >
                        Delete Selected ({selectedTasks.size})
                      </button>
                    )}
                  </>
                )}
              </div>
              
              {selectedTasks.size > 0 && (
                <div className="text-sm text-gray-600">
                  {selectedTasks.size} task{selectedTasks.size !== 1 ? 's' : ''} selected
                </div>
              )}
            </div>

            {activeTab === 'my-tasks' && filteredBase.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onComplete={() => handleCompleteTask(task.id)}
                onDelete={() => handleDeleteTask(task.id)}
                onShare={() => setSharingTask(task)}
                onDecrypt={() => handleDecryptTask(task.id)}
                isDecrypted={decryptedTasks.has(task.id)}
                displayIndex={filteredBase.indexOf(task)}
                isSelectionMode={isSelectionMode}
                isSelected={selectedTasks.has(task.id)}
                onToggleSelection={() => toggleTaskSelection(task.id)}
              />
            ))}
            {activeTab === 'received-tasks' && receivedTasks.map((task) => (
              <TaskCard
                key={`received-${task.id}`}
                task={task}
                onComplete={() => handleCompleteTask(task.id)}
                onDelete={() => handleDeleteTask(task.id)}
                onShare={() => setSharingTask(task)}
                onDecrypt={() => handleDecryptTask(task.id, { preferReceived: true })}
                onArchive={() => handleArchiveTask(task.id)}
                isDecrypted={decryptedTasks.has(task.id)}
                displayIndex={receivedTasks.indexOf(task)}
                isSelectionMode={isSelectionMode}
                isSelected={selectedTasks.has(task.id)}
                onToggleSelection={() => toggleTaskSelection(task.id)}
              />
            ))}
            {activeTab === 'received-tasks' && receivedTasks.length === 0 && (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-zama-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-zama-gray-900 mb-2">No Received Tasks</h3>
                <p className="text-zama-gray-600">
                  Tasks shared with you will appear here. Ask someone to share a task with your wallet address!
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Task Form Modal */}
      {showTaskForm && (
        <TaskForm
          onSubmit={handleCreateTask}
          onCancel={() => setShowTaskForm(false)}
          title="Create New Task"
          submitText="Create Task"
          taskType="auto"
        />
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <TaskForm
          task={editingTask}
          onSubmit={handleEditTask}
          onCancel={() => setEditingTask(null)}
          title="Edit Task"
          submitText="Update Task"
        />
      )}

      {/* Share Task Modal */}
      {sharingTask && (
        <ShareModal
          task={sharingTask}
          onShare={handleShareTask}
          onCancel={() => setSharingTask(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingTask && (
        <DeleteConfirmModal
          isOpen={!!deletingTask}
          taskTitle={deletingTask.title}
          onConfirm={confirmDeleteTask}
          onCancel={() => setDeletingTask(null)}
        />
      )}

      {/* Decryption Modal */}
      {decryptingTask && (
        <DecryptionModal
          isOpen={!!decryptingTask}
          taskTitle={decryptingTask.title}
          onDecrypt={confirmDecryptTask}
          onCancel={() => setDecryptingTask(null)}
          isDecrypting={isDecrypting}
        />
      )}

      {/* Bulk Delete Modal */}
      <BulkDeleteModal
        isOpen={showBulkDeleteModal}
        taskCount={selectedTasks.size}
        onConfirm={bulkDeleteTasks}
        onCancel={() => setShowBulkDeleteModal(false)}
      />

      {/* Notification Container */}
      <NotificationContainer />
    </div>
  );
}

