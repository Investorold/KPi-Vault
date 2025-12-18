import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  backendClient,
  MetricMetadata,
  FeedbackEntry,
  AlertRule,
  Shareboard
} from './services/backendClient';
import { simpleWalletService } from './services/simpleWalletService';
import { kpiContractService, EncryptedMetricEntry } from './services/kpiContractService';
import { fhevmService } from './services/fhevmService';
import { KpiChart, Sparkline } from './components/KpiChart';
import { detectWalletConflicts } from './utils/errorSuppression';
import { keccak256, toUtf8Bytes } from 'ethers';
import { secureLogger } from './utils/secureLogger';

type MetricDraft = {
  metricId: string;
  label: string;
  unit: string;
  category: string;
  description: string;
};

type RecordDraft = {
  metricId: string;
  value: string;
  note: string;
};

type MetricEntryState = EncryptedMetricEntry & {
  decryptedValue?: number;
  decryptedNote?: string;
};

const initialDraft: MetricDraft = {
  metricId: '',
  label: '',
  unit: '',
  category: '',
  description: ''
};

const initialRecordDraft: RecordDraft = {
  metricId: '',
  value: '',
  note: ''
};

const shortenAddress = (address: string) => {
  if (!address) return '';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
};

const formatTimestamp = (timestamp: number) => {
  if (!timestamp) return 'n/a';
  return new Date(timestamp * 1000).toLocaleString();
};

const normalizeAddress = (value: string) => (value || '').trim().toLowerCase();
const buildFeedbackKey = (owner: string, metricId: string, entryIndex: string | number) =>
  `${normalizeAddress(owner)}:${String(metricId)}:${String(entryIndex)}`;

const encodeFeedbackMessage = (text: string) => {
  try {
    if (typeof window !== 'undefined' && window.btoa) {
      return window.btoa(unescape(encodeURIComponent(text)));
    }
  } catch (error) {
    secureLogger.warn('Feedback encoding failed, falling back to UTF-8 string.', error);
  }
  return text;
};

function App() {
  const [ownerAddress, setOwnerAddress] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<MetricDraft>(initialDraft);
  const [metadata, setMetadata] = useState<Record<string, MetricMetadata>>({});
  const [isSubmittingMetadata, setIsSubmittingMetadata] = useState(false);

  const [recordDraft, setRecordDraft] = useState<RecordDraft>(initialRecordDraft);
  const [isRecordingMetric, setIsRecordingMetric] = useState(false);
  const [metricsById, setMetricsById] = useState<Record<string, MetricEntryState[]>>({});
  const [loadingMetricId, setLoadingMetricId] = useState<string | null>(null);
  const [decryptingKey, setDecryptingKey] = useState<string | null>(null);

  // Access management state
  const [viewersByMetric, setViewersByMetric] = useState<Record<string, string[]>>({});
  const [loadingViewers, setLoadingViewers] = useState<Record<string, boolean>>({});
  const [grantingAccess, setGrantingAccess] = useState<Record<string, boolean>>({});
  const [revokingAccess, setRevokingAccess] = useState<Record<string, boolean>>({});
  const [newViewerAddress, setNewViewerAddress] = useState<Record<string, string>>({});

  // Admin management state
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [checkingAdmin, setCheckingAdmin] = useState(false);
  const [adminList, setAdminList] = useState<string[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [removingAdmin, setRemovingAdmin] = useState<Record<string, boolean>>({});
  const [newAdminAddress, setNewAdminAddress] = useState('');

  // Viewer mode state (for viewing someone else's metrics)
  const [viewerMode, setViewerMode] = useState(false);
  const [viewerOwnerAddress, setViewerOwnerAddress] = useState('');
  const [viewerMetadata, setViewerMetadata] = useState<Record<string, MetricMetadata>>({});
  const [viewerMetrics, setViewerMetrics] = useState<Record<string, MetricEntryState[]>>({});
  const [loadingViewerMetrics, setLoadingViewerMetrics] = useState<Record<string, boolean>>({});

  // Wallet conflict detection
  const [hasWalletConflict, setHasWalletConflict] = useState(false);

  const getConnectedAddress = useCallback(() => walletAddress || simpleWalletService.getAddress(), [walletAddress]);

  // Investor feedback state
  const [feedbackOwnerInput, setFeedbackOwnerInput] = useState('');
  const [feedbackMetricInput, setFeedbackMetricInput] = useState('');
  const [feedbackEntryInput, setFeedbackEntryInput] = useState('0');
  const [feedbackThreads, setFeedbackThreads] = useState<Record<string, FeedbackEntry[]>>({});
  const [feedbackLoadingKey, setFeedbackLoadingKey] = useState<string | null>(null);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [feedbackSubmittingKey, setFeedbackSubmittingKey] = useState<string | null>(null);
  const [allFeedback, setAllFeedback] = useState<FeedbackEntry[]>([]);
  // Initialize lastFeedbackCheck from localStorage, or use current time if not set
  const [lastFeedbackCheck, setLastFeedbackCheck] = useState<number>(() => {
    const stored = localStorage.getItem('lastFeedbackCheck');
    return stored ? parseInt(stored, 10) : Date.now();
  });

  // Alerts state
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [alertSubmitting, setAlertSubmitting] = useState(false);
  const [alertActioning, setAlertActioning] = useState<Record<string, boolean>>({});
  const [alertForm, setAlertForm] = useState({
    metricId: '',
    name: '',
    ruleType: 'threshold',
    direction: 'above',
    threshold: '',
    changePercent: '',
    email: '',
    enableInApp: true
  });
  const [alertSubscriptionDrafts, setAlertSubscriptionDrafts] = useState<Record<string, string>>({});

  // Shareboards state
  const [shareboards, setShareboards] = useState<Shareboard[]>([]);

  // Notification panel state
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [loadingShareboards, setLoadingShareboards] = useState(false);
  const [shareboardSubmitting, setShareboardSubmitting] = useState(false);
  const [shareboardActioning, setShareboardActioning] = useState<Record<string, boolean>>({});
  const [shareboardForm, setShareboardForm] = useState({
    title: '',
    description: '',
    metricIds: '',
    includeHistoryWindow: '3',
    snapshotStrategy: 'live',
    accessMode: 'walletAllowlist',
    allowedWallets: '',
    token: ''
  });

  // Only show metadata that belongs to the connected wallet in main dashboard
  const orderedMetadata = useMemo(() => {
    const connectedAddress = walletAddress || simpleWalletService.getAddress();
    if (!connectedAddress) {
      // If no wallet connected, don't show any metadata
      return [];
    }
    
    // Filter metadata to only show entries that belong to the connected wallet
    // Check if ownerAddress matches connected wallet, or if ownerAddress is empty (auto-loaded own data)
    const isViewingOwnData = !ownerAddress.trim() || 
      ownerAddress.trim().toLowerCase() === connectedAddress.toLowerCase();
    
    if (!isViewingOwnData) {
      // If viewing someone else's data, don't show it in main dashboard
      return [];
    }
    
    return Object.values(metadata).sort((a, b) => {
      const left = new Date(a.updatedAt ?? 0).getTime();
      const right = new Date(b.updatedAt ?? 0).getTime();
      return right - left;
    });
  }, [metadata, walletAddress, ownerAddress]);

  const connectedAddress = getConnectedAddress();
  const normalizedViewerAddress = normalizeAddress(connectedAddress || '');
  const activeFeedbackOwner = normalizeAddress(feedbackOwnerInput || connectedAddress || '');
  const activeFeedbackMetricId = feedbackMetricInput.trim();
  const activeFeedbackEntryIndex = feedbackEntryInput || '0';
  const activeFeedbackKey =
    activeFeedbackOwner && activeFeedbackMetricId
      ? buildFeedbackKey(activeFeedbackOwner, activeFeedbackMetricId, activeFeedbackEntryIndex)
      : '';
  const activeFeedbackThread = activeFeedbackKey ? feedbackThreads[activeFeedbackKey] || [] : [];
  const isFeedbackLoading = activeFeedbackKey && feedbackLoadingKey === activeFeedbackKey;
  const feedbackDraftValue = feedbackDrafts[activeFeedbackKey] || '';
  const feedbackSubmitBusy = feedbackSubmittingKey === activeFeedbackKey;

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => {
      setToastMessage(null);
    }, 5000);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [toastMessage]);

  useEffect(() => {
    // Check for wallet conflicts on mount - log to console only (dev mode), not in UI
    const hasConflict = detectWalletConflicts();
    setHasWalletConflict(hasConflict);
    if (hasConflict && import.meta.env.DEV) {
      secureLogger.warn('Wallet Extension Conflict Detected. Multiple wallet extensions detected (e.g., MetaMask + Phantom). This may cause console errors, but the app should still work. For best results, disable other wallet extensions or use a separate browser profile with only MetaMask enabled.');
    }
    
    (async () => {
      try {
        // Wait a bit for wallet extension to initialize
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const restored = await simpleWalletService.loadPersistedConnection();
        if (restored) {
          const address = simpleWalletService.getAddress();
          if (address) {
            setWalletConnected(true);
            setWalletAddress(address);
            simpleWalletService.updateActivity(); // Update activity on successful restore
            // Clear previous metadata when wallet auto-connects
            // This ensures we only show the connected wallet's own data
            setOwnerAddress('');
            setMetadata({});
            setMetricsById({});
            try {
              await fhevmService.initialize();
              await kpiContractService.initialize();
              // Load metadata for connected wallet (their own data)
              await loadMetadataForOwner(address, false);
              await checkAdminStatus();
              secureLogger.debug('Wallet auto-restored successfully');
            } catch (sdkError) {
              const message = sdkError instanceof Error ? sdkError.message : 'Failed to initialise FHEVM';
              setError(message);
              showToast(message);
            }
          }
        } else {
          secureLogger.debug('Wallet connection not restored (may need manual connect)');
        }
      } catch (restoreError) {
        secureLogger.warn('Wallet auto-restore failed:', restoreError);
      }
    })();

    // Listen for wallet account changes (e.g., when MetaMask unlocks)
    const handleAccountsChanged = async (accounts: string[]) => {
      if (accounts.length > 0 && !walletConnected) {
        // Wallet unlocked or account changed - try to restore
        try {
          const restored = await simpleWalletService.loadPersistedConnection();
          if (restored) {
            const address = simpleWalletService.getAddress();
            if (address) {
              setWalletConnected(true);
              setWalletAddress(address);
              simpleWalletService.updateActivity();
              setOwnerAddress('');
              setMetadata({});
              setMetricsById({});
              try {
                await fhevmService.initialize();
                await kpiContractService.initialize();
                await loadMetadataForOwner(address, false);
                await checkAdminStatus();
                secureLogger.debug('Wallet auto-restored after unlock');
              } catch (sdkError) {
                secureLogger.debug('SDK init failed after wallet unlock:', sdkError);
              }
            }
          }
        } catch (error) {
          secureLogger.debug('Restore failed on account change:', error);
        }
      }
    };

    // Listen for MetaMask account changes
    const provider = simpleWalletService.getProvider();
    if (provider) {
      try {
        const ethereumProvider = (provider as any).provider;
        if (ethereumProvider && typeof ethereumProvider.on === 'function') {
          ethereumProvider.on('accountsChanged', handleAccountsChanged);
          return () => {
            if (ethereumProvider && typeof ethereumProvider.removeListener === 'function') {
              ethereumProvider.removeListener('accountsChanged', handleAccountsChanged);
            }
          };
        }
      } catch (e) {
        // Provider might not support events
        secureLogger.debug('Could not attach account change listener:', e);
      }
    }

    // Also check window.ethereum directly
    if (typeof window !== 'undefined' && window.ethereum) {
      try {
        if (typeof window.ethereum.on === 'function') {
          window.ethereum.on('accountsChanged', handleAccountsChanged);
          return () => {
            if (typeof window.ethereum?.removeListener === 'function') {
              window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
            }
          };
        }
      } catch (e) {
        secureLogger.debug('Could not attach window.ethereum listener:', e);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (walletAddress) {
      setFeedbackOwnerInput((prev) => prev || walletAddress);
    }
  }, [walletAddress]);


  const handleConnectWallet = useCallback(async () => {
    setWalletLoading(true);
    setError(null);
    try {
      await simpleWalletService.connect();
      const address = simpleWalletService.getAddress();
      setWalletConnected(true);
      setWalletAddress(address);
      
      // Clear previous metadata and owner address when connecting
      // This ensures we only show the connected wallet's own data in main dashboard
      setOwnerAddress('');
      setMetadata({});
      setMetricsById({});
      
      await fhevmService.initialize();
      await kpiContractService.initialize();
      // Load metadata for connected wallet (their own data)
      await loadMetadataForOwner(address, false);
      await checkAdminStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect wallet';
      setError(message);
      showToast(message);
    } finally {
      setWalletLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDisconnectWallet = useCallback(() => {
    simpleWalletService.disconnect();
    setWalletConnected(false);
    setWalletAddress('');
    setMetricsById({});
  }, []);

  const loadMetrics = useCallback(async (metricId: string, silent = false) => {
    if (!walletConnected) {
      if (!silent) {
        setError('Connect your wallet to load encrypted entries.');
      }
      return;
    }
    const address = walletAddress || simpleWalletService.getAddress();
    if (!address) {
      if (!silent) {
        setError('Wallet address unavailable.');
      }
      return;
    }

    if (!silent) {
      secureLogger.debug('Loading metrics:', { metricId, address });
    }
    setLoadingMetricId(metricId);
    if (!silent) {
      setError(null);
    }
    try {
      const entries = await kpiContractService.getMetrics(address, metricId);
      if (!silent) {
        secureLogger.debug(`Loaded ${entries.length} entries for metric ${metricId}`);
      }
      setMetricsById((prev) => ({
        ...prev,
        [metricId]: entries.map((entry) => ({ ...entry }))
      }));
      if (entries.length === 0 && !silent) {
        secureLogger.warn('No entries found. Make sure:', {
          metricId,
          address,
          'Metric ID matches exactly?': 'Check Metadata Overview',
          'Owner address matches?': 'Check top right corner',
          'Transaction confirmed?': 'Check MetaMask or Etherscan'
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load encrypted metrics';
      if (!silent) {
        secureLogger.error('[KPI Vault] Error loading metrics:', err);
        setError(errorMessage);
      }
    } finally {
      setLoadingMetricId(null);
    }
  }, [walletConnected, walletAddress]);

  const loadMetadataForOwner = useCallback(
    async (address?: string, updateInputField = true) => {
      const target = address?.trim() || ownerAddress.trim();
      if (!target) return;

      setIsLoadingMetadata(true);
      setError(null);
      try {
        const response = await backendClient.getMetadata(target);
        // Only update the input field if explicitly requested (user action)
        // Don't update when auto-loading in background
        if (updateInputField) {
          setOwnerAddress(target);
        }
        setMetadata(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load metadata');
      } finally {
        setIsLoadingMetadata(false);
      }
    },
    [ownerAddress]
  );


  const handleFetchMetadata = async () => {
    if (!ownerAddress.trim()) {
      setError('Enter the owner wallet address to load metadata.');
      return;
    }
    
    // Check if the entered address matches the connected wallet
    const connectedAddress = walletAddress || simpleWalletService.getAddress();
    const enteredAddress = ownerAddress.trim().toLowerCase();
    
    if (connectedAddress && enteredAddress !== connectedAddress.toLowerCase()) {
      // User is trying to load someone else's metadata in the main section
      // This should be done in Viewer Mode instead
      setError('To view other users\' metrics, use "Viewer Mode" section below. This section is for loading your own metadata.');
      showToast('Use Viewer Mode to view other users\' metrics');
      return;
    }
    
    await loadMetadataForOwner(ownerAddress);
  };

  const handleSubmitMetadata = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    simpleWalletService.updateActivity(); // Track activity
    
    // Use ownerAddress if set, otherwise fall back to connected wallet address
    const addressToUse = ownerAddress.trim() || walletAddress || simpleWalletService.getAddress();
    if (!addressToUse) {
      const errorMsg = 'No wallet address available. Connect your wallet or enter an owner address.';
      setError(errorMsg);
      showToast(errorMsg);
      return;
    }
    
    if (!draft.metricId.trim()) {
      const errorMsg = 'Metric ID is required.';
      setError(errorMsg);
      showToast(errorMsg);
      return;
    }

    secureLogger.debug('[KPI Vault] Saving metadata:', { 
      metricId: draft.metricId.trim(), 
      addressToUse 
    });
    
    setIsSubmittingMetadata(true);
    setError(null);
    try {
      const payload: MetricMetadata = {
        metricId: draft.metricId.trim(),
        label: draft.label.trim(),
        unit: draft.unit.trim(),
        category: draft.category.trim(),
        description: draft.description.trim()
      };
      const response = await backendClient.saveMetadata(addressToUse, payload);
      secureLogger.debug('[KPI Vault] Metadata saved successfully:', response);
      
      setMetadata((prev) => ({
        ...prev,
        [String(payload.metricId)]: response.metadata
      }));
      setDraft(initialDraft);
      showToast(`✅ Metadata saved for metric "${payload.metricId}"`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save metadata';
      secureLogger.error('[KPI Vault] Error saving metadata:', err);
      setError(errorMessage);
      showToast(errorMessage);
    } finally {
      setIsSubmittingMetadata(false);
    }
  };

  const handleRemoveMetadata = async (metricId: string) => {
    simpleWalletService.updateActivity(); // Track activity
    
    // Use ownerAddress if set, otherwise fall back to connected wallet address
    const addressToUse = ownerAddress.trim() || walletAddress || simpleWalletService.getAddress();
    if (!addressToUse) {
      const errorMsg = 'No wallet address available. Connect your wallet or enter an owner address.';
      setError(errorMsg);
      showToast(errorMsg);
      return;
    }
    
    secureLogger.debug('[KPI Vault] Removing metadata:', { metricId, addressToUse });
    setIsSubmittingMetadata(true);
    setError(null);
    try {
      const result = await backendClient.deleteMetadata(addressToUse, metricId);
      secureLogger.debug('[KPI Vault] Delete metadata result:', result);
      
      setMetadata((prev) => {
        const next = { ...prev };
        delete next[metricId];
        return next;
      });
      setMetricsById((prev) => {
        const next = { ...prev };
        delete next[metricId];
        return next;
      });
      showToast(`✅ Metadata removed for metric "${metricId}"`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete metadata';
      secureLogger.error('[KPI Vault] Error removing metadata:', err);
      setError(errorMessage);
      showToast(errorMessage);
    } finally {
      setIsSubmittingMetadata(false);
    }
  };

  /*//////////////////////////////////////////////////////////////
                      Investor Feedback (frontend)
  //////////////////////////////////////////////////////////////*/

  const loadFeedbackThread = useCallback(
    async (options?: { owner?: string; metricId?: string; entryIndex?: string; silent?: boolean }) => {
      const owner = normalizeAddress(
        options?.owner || feedbackOwnerInput || getConnectedAddress() || ''
      );
      const metricId = (options?.metricId || feedbackMetricInput || '').trim();
      const entryIndexValue = options?.entryIndex ?? feedbackEntryInput ?? '0';
      const entryIndex = entryIndexValue ? String(entryIndexValue) : '0';

      if (!owner) {
        if (!options?.silent) {
          showToast('Enter the metric owner address to load feedback.');
        }
        return;
      }
      if (!metricId) {
        if (!options?.silent) {
          showToast('Enter the metric ID to load feedback.');
        }
        return;
      }

      const key = buildFeedbackKey(owner, metricId, entryIndex);
      setFeedbackLoadingKey(key);
      try {
        const response = await backendClient.getFeedback(owner, metricId, entryIndex);
        setFeedbackThreads((prev) => ({
          ...prev,
          [key]: response.feedback || []
        }));
        return response.feedback as FeedbackEntry[];
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load feedback thread';
        setError(message);
        if (!options?.silent) {
          showToast(message);
        }
      } finally {
        setFeedbackLoadingKey(null);
      }
    },
    [
      feedbackOwnerInput,
      feedbackMetricInput,
      feedbackEntryInput,
      showToast,
      getConnectedAddress
    ]
  );

  // Load all feedback for the connected wallet (as owner)
  const loadAllFeedback = useCallback(async (updateCheckTime: boolean = false) => {
    const owner = normalizeAddress(getConnectedAddress() || '');
    if (!owner) return;
    
    try {
      const response = await backendClient.getAllFeedback(owner);
      const feedback = response.feedback || [];
      setAllFeedback(feedback);
      // Only update last check time if explicitly requested (e.g., on initial load)
      // This ensures newly submitted feedback shows up in notifications
      if (updateCheckTime) {
        const now = Date.now();
        setLastFeedbackCheck(now);
        localStorage.setItem('lastFeedbackCheck', now.toString());
      }
      return feedback;
    } catch (err) {
      secureLogger.warn('[KPI Vault] Failed to load all feedback:', err);
      return [];
    }
  }, [getConnectedAddress]);

  const handleSubmitFeedback = useCallback(async () => {
    simpleWalletService.updateActivity(); // Track activity
    const owner = normalizeAddress(feedbackOwnerInput || getConnectedAddress() || '');
    const metricId = (feedbackMetricInput || '').trim();
    const entryIndex = feedbackEntryInput ? String(feedbackEntryInput) : '0';
    const viewer = normalizeAddress(getConnectedAddress() || '');

    if (!viewer) {
      showToast('Connect your wallet to submit feedback.');
      return;
    }
    if (!owner || !metricId) {
      showToast('Owner address and metric ID are required for feedback.');
      return;
    }

    const key = buildFeedbackKey(owner, metricId, entryIndex);
    const note = (feedbackDrafts[key] || '').trim();
    if (!note) {
      showToast('Enter a short note before submitting.');
      return;
    }

    setFeedbackSubmittingKey(key);
    try {
      const ciphertext = encodeFeedbackMessage(note);
      const commitment = keccak256(
        toUtf8Bytes(
          JSON.stringify({
            ciphertext,
            owner,
            metricId,
            entryIndex,
            viewer,
            nonce: Date.now()
          })
        )
      );
      await backendClient.createFeedback({
        ownerAddress: owner,
        metricId,
        entryIndex,
        viewerAddress: viewer,
        ciphertext,
        commitment,
        noteMetadata: { preview: note.slice(0, 140) }
      });
      setFeedbackDrafts((prev) => ({ ...prev, [key]: '' }));
      await loadFeedbackThread({ owner, metricId, entryIndex, silent: true });
      
      // Reload all feedback for notifications if current wallet is the owner
      // Don't update lastFeedbackCheck so the new feedback shows as "new" in notifications
      const currentWallet = normalizeAddress(getConnectedAddress() || '');
      if (currentWallet && currentWallet.toLowerCase() === owner.toLowerCase()) {
        // Owner is currently connected, reload their feedback immediately
        await loadAllFeedback(false);
        secureLogger.debug('[KPI Vault] ✅ Feedback submitted - reloaded notifications for owner');
      } else {
        // Viewer submitted feedback - owner will see it on next page load or auto-refresh
        secureLogger.debug('[KPI Vault] ✅ Feedback submitted - owner will see notification on next check');
      }
      
      showToast('Feedback submitted securely.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit feedback';
      setError(message);
      showToast(message);
    } finally {
      setFeedbackSubmittingKey(null);
    }
  }, [
    feedbackOwnerInput,
    feedbackMetricInput,
    feedbackEntryInput,
    feedbackDrafts,
    loadFeedbackThread,
    loadAllFeedback,
    showToast,
    getConnectedAddress
  ]);

  const handleDeleteFeedback = useCallback(
    async (feedbackId: string, owner: string, metricId: string, entryIndex: string) => {
      const actor = normalizeAddress(getConnectedAddress() || '');
      if (!actor) {
        showToast('Connect your wallet to manage feedback.');
        return;
      }
      try {
        await backendClient.deleteFeedback(feedbackId, { actorAddress: actor });
        await loadFeedbackThread({ owner, metricId, entryIndex, silent: true });
        showToast('Feedback entry removed.');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to remove feedback entry';
        setError(message);
        showToast(message);
      }
    },
    [getConnectedAddress, loadFeedbackThread, showToast]
  );

  /*//////////////////////////////////////////////////////////////
                            Alerts helpers
  //////////////////////////////////////////////////////////////*/

  const loadAlerts = useCallback(async () => {
    const owner = normalizeAddress(getConnectedAddress() || '');
    if (!owner) {
      setAlertRules([]);
      return;
    }
    setLoadingAlerts(true);
    try {
      const response = await backendClient.listAlerts(owner);
      setAlertRules(response.alerts || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load alert rules';
      // Treat 404/empty as "no alerts yet" without surfacing a global error
      if (message.includes('status 404')) {
        setAlertRules([]);
      } else {
        setError(message);
      }
    } finally {
      setLoadingAlerts(false);
    }
  }, [getConnectedAddress]);

  const handleCreateAlert = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const owner = normalizeAddress(getConnectedAddress() || '');
      if (!owner) {
        showToast('Connect your wallet to create alerts.');
        return;
      }

      if (!alertForm.metricId.trim()) {
        showToast('Metric ID is required for an alert rule.');
        return;
      }

      const thresholdValue = Number(alertForm.threshold);
      if (Number.isNaN(thresholdValue)) {
        showToast('Enter a valid number for the threshold.');
        return;
      }

      const config = {
        direction: alertForm.direction,
        threshold: thresholdValue,
        changePercent: alertForm.changePercent ? Number(alertForm.changePercent) : undefined
      };

      const commitment = keccak256(
        toUtf8Bytes(
          JSON.stringify({
            owner,
            metricId: alertForm.metricId.trim(),
            ruleType: alertForm.ruleType,
            config,
            nonce: Date.now()
          })
        )
      );

      setAlertSubmitting(true);
      try {
        const response = await backendClient.createAlert({
          ownerAddress: owner,
          metricId: alertForm.metricId.trim(),
          name: alertForm.name.trim() || `Alert ${alertForm.metricId.trim()}`,
          ruleType: alertForm.ruleType,
          config,
          encryptedConfig: null,
          commitment,
          channels: ['in-app'] // Always enable in-app notifications
        });

        if (alertForm.email.trim()) {
          await backendClient.subscribeToAlert(response.alert.id, {
            subscriberAddress: owner,
            channels: ['email'],
            email: alertForm.email.trim()
          });
        }

        await loadAlerts();
        setAlertForm({
          metricId: '',
          name: '',
          ruleType: 'threshold',
          direction: 'above',
          threshold: '',
          changePercent: '',
          email: '',
          enableInApp: true
        });
        showToast('Alert rule saved.');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create alert rule';
        setError(message);
        showToast(message);
      } finally {
        setAlertSubmitting(false);
      }
    },
    [alertForm, getConnectedAddress, loadAlerts, showToast]
  );

  const handleDeleteAlert = useCallback(
    async (alertId: string) => {
      const owner = normalizeAddress(getConnectedAddress() || '');
      if (!owner) {
        showToast('Connect your wallet to update alerts.');
        return;
      }
      setAlertActioning((prev) => ({ ...prev, [alertId]: true }));
      try {
        await backendClient.deleteAlert(alertId, { ownerAddress: owner });
        await loadAlerts();
        showToast('Alert rule removed.');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to remove alert rule';
        setError(message);
        showToast(message);
      } finally {
        setAlertActioning((prev) => ({ ...prev, [alertId]: false }));
      }
    },
    [getConnectedAddress, loadAlerts, showToast]
  );

  const handleSubscribeToAlert = useCallback(
    async (alertId: string) => {
      const owner = normalizeAddress(getConnectedAddress() || '');
      if (!owner) {
        showToast('Connect your wallet to subscribe.');
        return;
      }
      const email = (alertSubscriptionDrafts[alertId] || '').trim();
      if (!email) {
        showToast('Enter an email before subscribing.');
        return;
      }
      setAlertActioning((prev) => ({ ...prev, [`sub-${alertId}`]: true }));
      try {
        await backendClient.subscribeToAlert(alertId, {
          subscriberAddress: owner,
          channels: ['email'],
          email
        });
        setAlertSubscriptionDrafts((prev) => ({ ...prev, [alertId]: '' }));
        showToast('Subscribed to alert.');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to subscribe to alert';
        setError(message);
        showToast(message);
      } finally {
        setAlertActioning((prev) => ({ ...prev, [`sub-${alertId}`]: false }));
      }
    },
    [alertSubscriptionDrafts, getConnectedAddress, showToast]
  );

  /*//////////////////////////////////////////////////////////////
                           Shareboards logic
  //////////////////////////////////////////////////////////////*/

  const loadShareboards = useCallback(async () => {
    const owner = normalizeAddress(getConnectedAddress() || '');
    if (!owner) {
      setShareboards([]);
      return;
    }
    setLoadingShareboards(true);
    try {
      const response = await backendClient.listShareboards(owner);
      setShareboards(response.shareboards || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load shareboards';
      // Treat 404/empty as "no shareboards yet" without surfacing a global error
      if (message.includes('status 404')) {
        setShareboards([]);
      } else {
        setError(message);
      }
    } finally {
      setLoadingShareboards(false);
    }
  }, [getConnectedAddress]);

  const handleCreateShareboard = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const owner = normalizeAddress(getConnectedAddress() || '');
      if (!owner) {
        showToast('Connect your wallet to create a shareboard.');
        return;
      }

      const metricIds = (shareboardForm.metricIds || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);

      if (metricIds.length === 0) {
        showToast('Add at least one metric ID to share.');
        return;
      }

      const allowedWallets = (shareboardForm.allowedWallets || '')
        .split(',')
        .map((address) => normalizeAddress(address))
        .filter(Boolean);

      setShareboardSubmitting(true);
      try {
        await backendClient.createShareboard({
          ownerAddress: owner,
          title: shareboardForm.title || 'Untitled Shareboard',
          description: shareboardForm.description || '',
          metricIds,
          includeHistoryWindow: shareboardForm.includeHistoryWindow
            ? Number(shareboardForm.includeHistoryWindow)
            : null,
          snapshotStrategy: shareboardForm.snapshotStrategy,
          accessMode: shareboardForm.accessMode,
          accessToken: shareboardForm.token || null,
          allowedWallets,
          invitees: [],
          snapshotEntries: [],
          metadata: {}
        });
        await loadShareboards();
        setShareboardForm({
          title: '',
          description: '',
          metricIds: '',
          includeHistoryWindow: '3',
          snapshotStrategy: 'live',
          accessMode: 'walletAllowlist',
          allowedWallets: '',
          token: ''
        });
        showToast('Shareboard created.');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create shareboard';
        setError(message);
        showToast(message);
      } finally {
        setShareboardSubmitting(false);
      }
    },
    [getConnectedAddress, shareboardForm, loadShareboards, showToast]
  );

  const handleDeleteShareboard = useCallback(
    async (shareboardId: string) => {
      const owner = normalizeAddress(getConnectedAddress() || '');
      if (!owner) {
        showToast('Connect your wallet to update shareboards.');
        return;
      }
      setShareboardActioning((prev) => ({ ...prev, [shareboardId]: true }));
      try {
        await backendClient.deleteShareboard(shareboardId, { ownerAddress: owner });
        await loadShareboards();
        showToast('Shareboard revoked.');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to revoke shareboard';
        setError(message);
        showToast(message);
      } finally {
        setShareboardActioning((prev) => ({ ...prev, [shareboardId]: false }));
      }
    },
    [getConnectedAddress, loadShareboards, showToast]
  );

  useEffect(() => {
    if (walletConnected) {
      loadAlerts();
      loadShareboards();
    }
  }, [walletConnected, loadAlerts, loadShareboards]);

  const handleRecordMetric = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    simpleWalletService.updateActivity(); // Track activity
    secureLogger.debug('[KPI Vault] Encrypt & Submit button clicked');
    
    if (!walletConnected) {
      const errorMsg = 'Connect your wallet before submitting KPI values.';
      secureLogger.error('[KPI Vault]', errorMsg);
      setError(errorMsg);
      showToast(errorMsg);
      return;
    }

    const metricId = recordDraft.metricId.trim();
    const numericValue = Number(recordDraft.value);
    const note = recordDraft.note.trim();
    
    if (!metricId) {
      const errorMsg = 'Metric ID is required to submit a KPI value.';
      secureLogger.error('[KPI Vault]', errorMsg);
      setError(errorMsg);
      showToast(errorMsg);
      return;
    }
    if (Number.isNaN(numericValue)) {
      const errorMsg = 'Enter a valid numeric KPI value.';
      secureLogger.error('[KPI Vault]', errorMsg);
      setError(errorMsg);
      showToast(errorMsg);
      return;
    }
    
    // Validate note length: encoded as uint64, so we can safely support up to 8 bytes
    if (note) {
      const encoder = new TextEncoder();
      const noteBytes = encoder.encode(note);
      if (noteBytes.length > 8) {
        const errorMsg = `Note is too long (${noteBytes.length} bytes). Maximum 8 ASCII characters allowed due to 64-bit limit.`;
        secureLogger.error('[KPI Vault]', errorMsg);
        setError(errorMsg);
        showToast(errorMsg);
        return;
      }
    }

    secureLogger.debug('[KPI Vault] Starting encryption and submission:', { 
      metricId, 
      'Metric ID (exact)': `"${metricId}"`,
      'Metric ID length': metricId.length,
      value: numericValue, 
      hasNote: !!recordDraft.note.trim(),
      'Wallet address': walletAddress || simpleWalletService.getAddress()
    });
    setIsRecordingMetric(true);
    setError(null);
    
    try {
      // Verify wallet is still connected before proceeding
      if (!simpleWalletService.isWalletConnected()) {
        throw new Error('Wallet connection lost. Please reconnect your wallet.');
      }

      // Verify provider is available
      const provider = simpleWalletService.getProvider();
      if (!provider) {
        throw new Error('Wallet provider unavailable. Please reconnect your wallet.');
      }

      secureLogger.debug('[KPI Vault] Wallet verified, proceeding with encryption...');
      
      let result: { txHash: string };
      if (note) {
        secureLogger.debug('[KPI Vault] Recording metric with note');
        result = await kpiContractService.recordMetricWithNote({
          metricId,
          value: numericValue,
          note: note
        });
      } else {
        secureLogger.debug('[KPI Vault] Recording metric without note');
        result = await kpiContractService.recordMetric({
          metricId,
          value: numericValue
        });
      }
      
      secureLogger.debug('[KPI Vault] ✅ Transaction successful! Hash:', result.txHash);
      secureLogger.debug('[KPI Vault] 📋 Submission details:', {
        metricId,
        'Metric ID (exact)': `"${metricId}"`,
        value: numericValue,
        txHash: result.txHash,
        'Check on Etherscan': `https://sepolia.etherscan.io/tx/${result.txHash}`
      });
      
      setRecordDraft(initialRecordDraft);
      showToast('✅ Encrypted KPI submitted to the blockchain.');
      
      // Wait longer for transaction to propagate (blockchain can be slow)
      secureLogger.debug('[KPI Vault] ⏳ Waiting 10 seconds for transaction to propagate...');
      setTimeout(async () => {
        secureLogger.debug('[KPI Vault] 🔄 Attempting to refresh entries...');
        try {
          await loadMetrics(metricId);
          const currentEntries = metricsById[metricId] || [];
          secureLogger.debug('[KPI Vault] 📊 After refresh, found entries:', currentEntries.length);
          if (currentEntries.length === 0) {
            secureLogger.warn('[KPI Vault] ⚠️ STILL NO ENTRIES! This could mean:');
            secureLogger.warn('  1. Transaction not fully confirmed yet (wait longer)');
            secureLogger.warn('  2. Metric ID mismatch');
            secureLogger.warn('  3. Wrong owner address');
            secureLogger.warn('  4. Transaction failed (check your wallet activity or block explorer)');
            showToast('⚠️ No entries found yet. Try "Refresh entries" again in 30 seconds or check your wallet activity.');
          } else {
            showToast(`✅ Found ${currentEntries.length} entries!`);
          }
        } catch (refreshError) {
          secureLogger.error('[KPI Vault] ❌ Error refreshing entries:', refreshError);
          showToast('⚠️ Transaction successful, but refresh failed. Click "Refresh entries" manually.');
        }
      }, 10000); // Increased to 10 seconds
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to record KPI value';
      secureLogger.error('[KPI Vault] Error during submission:', err);
      
      // Provide more helpful error messages
      if (errorMessage.includes('user rejected') || errorMessage.includes('User denied')) {
        setError('Transaction was cancelled. Please try again when ready.');
        showToast('Transaction cancelled');
      } else if (errorMessage.includes('provider') || errorMessage.includes('wallet')) {
        setError('Wallet connection issue. Please disconnect and reconnect your wallet, or disable other wallet extensions.');
        showToast('Wallet connection issue - try reconnecting');
      } else {
        setError(errorMessage);
        showToast(errorMessage);
      }
    } finally {
      setIsRecordingMetric(false);
    }
  };

  const handleDecryptMetric = async (metricId: string, entry: EncryptedMetricEntry, ownerAddr?: string) => {
    simpleWalletService.updateActivity(); // Track activity
    if (!walletConnected) {
      setError('Connect your wallet to decrypt KPI entries.');
      return;
    }
    const viewerAddress = walletAddress || simpleWalletService.getAddress();
    if (!viewerAddress) {
      setError('Wallet address unavailable.');
      return;
    }

    // Use provided owner address or default to current wallet (for owner's own metrics)
    const targetOwnerAddress = ownerAddr || viewerAddress;

    setDecryptingKey(`${metricId}:${entry.index}`);
    setError(null);
    try {
      // Check if viewer has access (if viewing someone else's metrics)
      if (targetOwnerAddress.toLowerCase() !== viewerAddress.toLowerCase()) {
        secureLogger.debug('[KPI Vault] ===== CHECKING VIEWER ACCESS =====');
        secureLogger.debug('[KPI Vault] Owner Address:', targetOwnerAddress);
        secureLogger.debug('[KPI Vault] Viewer Address:', viewerAddress);
        secureLogger.debug('[KPI Vault] Metric ID:', metricId);
        const hasAccess = await kpiContractService.hasAccess(targetOwnerAddress, metricId, viewerAddress);
        secureLogger.debug('[KPI Vault] Access Check Result:', hasAccess);
        secureLogger.debug('[KPI Vault] ===================================');
        if (!hasAccess) {
          throw new Error('You do not have access to decrypt this metric. The owner must grant you access first.');
        }
        secureLogger.debug('[KPI Vault] ✅ Access confirmed on-chain. Proceeding with decryption...');
      } else {
        secureLogger.debug('[KPI Vault] Owner decrypting own metric (no access check needed)');
      }

      const result = await kpiContractService.decryptMetric({
        ownerAddress: targetOwnerAddress,
        metricId,
        entryIndex: entry.index
      });

      // Update the appropriate state (viewer mode or owner mode)
      if (ownerAddr && viewerMode) {
        setViewerMetrics((prev) => ({
          ...prev,
          [metricId]: (prev[metricId] || []).map((item) =>
            item.index === entry.index
              ? { ...item, decryptedValue: result.value, decryptedNote: result.note }
              : item
          )
        }));
      } else {
        setMetricsById((prev) => ({
          ...prev,
          [metricId]: (prev[metricId] || []).map((item) =>
            item.index === entry.index
              ? { ...item, decryptedValue: result.value, decryptedNote: result.note }
              : item
          )
        }));
      }
    } catch (err) {
      let errorMessage = err instanceof Error ? err.message : 'Failed to decrypt KPI entry';
      
      // Provide more helpful error messages for common issues
      if (errorMessage.includes('500') || errorMessage.includes('Internal Server Error')) {
        errorMessage = 'Relayer server error (500). This could mean:\n' +
          '1. Access was not properly granted on-chain\n' +
          '2. The Zama relayer service is experiencing issues\n' +
          '3. The encrypted data format is invalid\n\n' +
          'Please verify that access was granted and try again. If the issue persists, the relayer may be temporarily unavailable.';
        secureLogger.error('[KPI Vault] Relayer 500 error. Details:', {
          ownerAddress: targetOwnerAddress,
          viewerAddress: viewerAddress,
          metricId: metricId,
          entryIndex: entry.index,
          isViewerDecryption: targetOwnerAddress.toLowerCase() !== viewerAddress.toLowerCase(),
          hasAccess: targetOwnerAddress.toLowerCase() !== viewerAddress.toLowerCase() ? 'checked (passed)' : 'owner (no check needed)',
          note: 'Check console for detailed relayer request parameters'
        });
        
        // Double-check access on-chain for debugging
        if (targetOwnerAddress.toLowerCase() !== viewerAddress.toLowerCase()) {
          try {
            secureLogger.error('[KPI Vault] ===== RE-CHECKING ACCESS AFTER 500 ERROR =====');
            const recheckAccess = await kpiContractService.hasAccess(targetOwnerAddress, metricId, viewerAddress);
            secureLogger.error('[KPI Vault] Re-check Access Result:', recheckAccess);
            secureLogger.error('[KPI Vault] Owner Address:', targetOwnerAddress);
            secureLogger.error('[KPI Vault] Viewer Address:', viewerAddress);
            secureLogger.error('[KPI Vault] Metric ID:', metricId);
            secureLogger.error('[KPI Vault] ==============================================');
          } catch (recheckErr) {
            secureLogger.error('[KPI Vault] Failed to re-check access:', recheckErr);
          }
        }
      } else if (errorMessage.includes('relayer') || errorMessage.includes('decrypt')) {
        errorMessage = `Decryption failed: ${errorMessage}. Please check:\n` +
          '1. You have been granted access by the owner\n' +
          '2. Your wallet is properly connected\n' +
          '3. The relayer service is available';
      }
      
      setError(errorMessage);
      showToast(errorMessage);
    } finally {
      setDecryptingKey(null);
    }
  };

  const handleLoadViewerMetrics = async () => {
    if (!walletConnected) {
      setError('Connect your wallet to view metrics.');
      return;
    }
    if (!viewerOwnerAddress.trim()) {
      setError('Enter the owner wallet address to view their metrics.');
      return;
    }

    const ownerAddr = viewerOwnerAddress.trim();
    const viewerAddr = walletAddress || simpleWalletService.getAddress();
    if (!viewerAddr) {
      setError('Wallet address not available.');
      return;
    }
    
    setError(null);
    
    try {
      // Load metadata for the owner
      const meta = await backendClient.getMetadata(ownerAddr);
      
      // Filter to only show metrics the viewer has access to
      const accessibleMetrics: Record<string, MetricMetadata> = {};
      secureLogger.debug('[KPI Vault] 🔍 Checking access for viewer mode:', {
        ownerAddress: ownerAddr,
        viewerAddress: viewerAddr,
        totalMetrics: Object.keys(meta).length,
        metricIds: Object.keys(meta)
      });
      
      for (const [metricId, metric] of Object.entries(meta)) {
        try {
          secureLogger.debug(`[KPI Vault] Checking access for metric: "${metricId}" (label: "${metric.label}")`);
          const hasAccess = await kpiContractService.hasAccess(ownerAddr, metricId, viewerAddr);
          secureLogger.debug(`[KPI Vault] Access result for "${metricId}":`, hasAccess);
          if (hasAccess) {
            accessibleMetrics[metricId] = metric;
            secureLogger.debug(`[KPI Vault] ✅ Access granted - Added "${metric.label || metricId}" to accessible metrics`);
          } else {
            secureLogger.debug(`[KPI Vault] ❌ Access denied - Skipping "${metric.label || metricId}"`);
          }
        } catch (err) {
          // If access check fails, skip this metric
          secureLogger.warn(`[KPI Vault] Failed to check access for metric ${metricId}:`, err);
        }
      }
      
      secureLogger.debug('[KPI Vault] 📊 Final accessible metrics:', {
        count: Object.keys(accessibleMetrics).length,
        metricIds: Object.keys(accessibleMetrics),
        labels: Object.values(accessibleMetrics).map(m => m.label)
      });
      
      setViewerMetadata(accessibleMetrics);
      setViewerMode(true);
      
      if (Object.keys(accessibleMetrics).length === 0) {
        showToast('No accessible metrics found. Make sure the owner has granted you access.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load viewer metrics';
      setError(errorMessage);
      showToast(errorMessage);
    }
  };

  const loadViewerMetricEntries = async (metricId: string) => {
    if (!walletConnected || !viewerOwnerAddress.trim()) return;

    const ownerAddr = viewerOwnerAddress.trim();
    const viewerAddr = walletAddress || simpleWalletService.getAddress();
    if (!viewerAddr) return;

    setLoadingViewerMetrics((prev) => ({ ...prev, [metricId]: true }));
    setError(null);
    
    try {
      // Check access first
      secureLogger.debug(`[KPI Vault] 🔍 Loading entries for metric "${metricId}" as viewer:`, {
        ownerAddress: ownerAddr,
        viewerAddress: viewerAddr,
        metricId
      });
      
      const hasAccess = await kpiContractService.hasAccess(ownerAddr, metricId, viewerAddr);
      secureLogger.debug(`[KPI Vault] Access check result for "${metricId}":`, hasAccess);
      
      if (!hasAccess) {
        throw new Error('You do not have access to view this metric. Ask the owner to grant you access.');
      }

      const entries = await kpiContractService.getMetrics(ownerAddr, metricId);
      secureLogger.debug(`[KPI Vault] 📊 Loaded ${entries.length} entries for metric "${metricId}":`, {
        metricId,
        entryCount: entries.length,
        entryIndices: entries.map(e => e.index)
      });
      
      setViewerMetrics((prev) => ({
        ...prev,
        [metricId]: entries.map((entry) => ({ ...entry }))
      }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load viewer metrics';
      setError(errorMessage);
      showToast(errorMessage);
    } finally {
      setLoadingViewerMetrics((prev) => ({ ...prev, [metricId]: false }));
    }
  };

  const loadViewers = useCallback(async (metricId: string) => {
    if (!walletConnected) {
      setError('Connect your wallet to view access controls.');
      return;
    }
    const address = walletAddress || simpleWalletService.getAddress();
    if (!address) {
      setError('Wallet address unavailable.');
      return;
    }

    setLoadingViewers((prev) => ({ ...prev, [metricId]: true }));
    setError(null);
    try {
      const viewers = await kpiContractService.getAuthorizedViewers(address, metricId);
      setViewersByMetric((prev) => ({
        ...prev,
        [metricId]: viewers
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load viewers';
      setError(message);
      showToast(message);
    } finally {
      setLoadingViewers((prev => ({ ...prev, [metricId]: false })));
    }
  }, [walletConnected, walletAddress, showToast]);

  // Auto-load entries and viewers for all metrics when metadata is loaded and wallet is connected
  // Only load if the metadata belongs to the connected wallet
  useEffect(() => {
    if (!walletConnected || Object.keys(metadata).length === 0) return;
    
    const addressToUse = walletAddress || simpleWalletService.getAddress();
    if (!addressToUse) return;

    // Only auto-load if we're viewing our own metadata (not in viewer mode)
    // Check if ownerAddress matches connected wallet, or if ownerAddress is empty (meaning we're viewing our own)
    const isViewingOwnData = !ownerAddress.trim() || 
      ownerAddress.trim().toLowerCase() === addressToUse.toLowerCase();
    
    if (!isViewingOwnData) {
      // Don't auto-load entries if we're viewing someone else's metadata
      return;
    }

    // Load entries and viewers for all metrics automatically (silent mode to avoid errors)
    const autoLoadEntries = async () => {
      for (const metricId of Object.keys(metadata)) {
        try {
          await loadMetrics(metricId, true); // silent = true for auto-loading
          // Also auto-load authorized viewers for each metric
          await loadViewers(metricId);
        } catch (err) {
          // Silently fail for individual metrics, but continue loading others
          secureLogger.warn(`[KPI Vault] Failed to auto-load entries/viewers for metric ${metricId}:`, err);
        }
      }
    };

    autoLoadEntries();
    
    // Also load all feedback for notifications (initial load - update check time)
    loadAllFeedback(true);
  }, [metadata, walletConnected, walletAddress, ownerAddress, loadMetrics, loadViewers, loadAllFeedback]);
  
  // Auto-refresh feedback and alerts every 30 seconds when wallet is connected
  useEffect(() => {
    if (!walletConnected) return;
    
    const addressToUse = walletAddress || simpleWalletService.getAddress();
    if (!addressToUse) return;
    
    // Check if viewing own data
    const isViewingOwnData = !ownerAddress.trim() || 
      ownerAddress.trim().toLowerCase() === addressToUse.toLowerCase();
    
    if (!isViewingOwnData) return;
    
    const interval = setInterval(() => {
      loadAllFeedback(false); // Don't update check time on auto-refresh
      loadAlerts();
    }, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(interval);
  }, [walletConnected, walletAddress, ownerAddress, loadAllFeedback, loadAlerts]);

  const handleGrantAccess = async (metricId: string) => {
    simpleWalletService.updateActivity(); // Track activity
    if (!walletConnected) {
      setError('Connect your wallet to grant access.');
      return;
    }
    const viewerAddress = newViewerAddress[metricId]?.trim();
    if (!viewerAddress || !/^0x[a-fA-F0-9]{40}$/i.test(viewerAddress)) {
      setError('Enter a valid Ethereum address (0x...)');
      showToast('Enter a valid Ethereum address (0x...)');
      return;
    }

    setGrantingAccess((prev) => ({ ...prev, [metricId]: true }));
    setError(null);
    try {
      const metricLabel = metadata[metricId]?.label || metricId;
      secureLogger.debug('[KPI Vault] 🔑 Granting access:', {
        metricId,
        metricLabel,
        viewerAddress,
        ownerAddress: walletAddress || simpleWalletService.getAddress()
      });
      
      await kpiContractService.grantAccess(metricId, viewerAddress);
      
      secureLogger.debug('[KPI Vault] ✅ Access granted successfully:', {
        metricId,
        metricLabel,
        viewerAddress
      });
      
      setNewViewerAddress((prev) => {
        const next = { ...prev };
        delete next[metricId];
        return next;
      });
      showToast(`Access granted to ${shortenAddress(viewerAddress)}`);
      await loadViewers(metricId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to grant access';
      setError(message);
      showToast(message);
    } finally {
      setGrantingAccess((prev => ({ ...prev, [metricId]: false })));
    }
  };

  const handleRevokeAccess = async (metricId: string, viewerAddress: string) => {
    if (!walletConnected) {
      setError('Connect your wallet to revoke access.');
      return;
    }

    const key = `${metricId}:${viewerAddress}`;
    setRevokingAccess((prev) => ({ ...prev, [key]: true }));
    setError(null);
    try {
      await kpiContractService.revokeAccess(metricId, viewerAddress);
      showToast(`Access revoked from ${shortenAddress(viewerAddress)}`);
      await loadViewers(metricId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to revoke access';
      setError(message);
      showToast(message);
    } finally {
      setRevokingAccess((prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      }));
    }
  };

  const checkAdminStatus = useCallback(async () => {
    if (!walletConnected) {
      setIsAdmin(false);
      return;
    }
    const address = walletAddress || simpleWalletService.getAddress();
    if (!address) {
      setIsAdmin(false);
      return;
    }

    setCheckingAdmin(true);
    setError(null);
    try {
      const adminStatus = await kpiContractService.isAdmin(address);
      setIsAdmin(adminStatus);
      if (adminStatus) {
        await loadAdminList();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to check admin status';
      secureLogger.error(message);
      setIsAdmin(false);
    } finally {
      setCheckingAdmin(false);
    }
  }, [walletConnected, walletAddress]);

  const loadAdminList = useCallback(async () => {
    if (!walletConnected) {
      setAdminList([]);
      return;
    }

    setLoadingAdmins(true);
    setError(null);
    try {
      const admins = await kpiContractService.getAdminList();
      setAdminList(admins);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load admin list';
      setError(message);
      showToast(message);
    } finally {
      setLoadingAdmins(false);
    }
  }, [walletConnected]);

  const handleAddAdmin = async () => {
    if (!walletConnected) {
      setError('Connect your wallet to add admin.');
      return;
    }
    const adminAddress = newAdminAddress.trim();
    if (!adminAddress || !/^0x[a-fA-F0-9]{40}$/i.test(adminAddress)) {
      setError('Enter a valid Ethereum address (0x...)');
      showToast('Enter a valid Ethereum address (0x...)');
      return;
    }

    setAddingAdmin(true);
    setError(null);
    try {
      await kpiContractService.addAdmin(adminAddress);
      setNewAdminAddress('');
      showToast(`Admin added: ${shortenAddress(adminAddress)}`);
      await loadAdminList();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add admin';
      setError(message);
      showToast(message);
    } finally {
      setAddingAdmin(false);
    }
  };

  const handleRemoveAdmin = async (adminAddress: string) => {
    if (!walletConnected) {
      setError('Connect your wallet to remove admin.');
      return;
    }

    setRemovingAdmin((prev) => ({ ...prev, [adminAddress]: true }));
    setError(null);
    try {
      await kpiContractService.removeAdmin(adminAddress);
      showToast(`Admin removed: ${shortenAddress(adminAddress)}`);
      await loadAdminList();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove admin';
      setError(message);
      showToast(message);
    } finally {
      setRemovingAdmin((prev => {
        const next = { ...prev };
        delete next[adminAddress];
        return next;
      }));
    }
  };

  return (
    <div className="app-shell">
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            padding: '12px 16px',
            borderRadius: 10,
            background: 'rgba(248, 113, 113, 0.9)',
            color: '#111',
            fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            zIndex: 1000,
            maxWidth: 320
          }}
        >
          {toastMessage}
        </div>
      )}
      <header className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: '1.9rem', color: '#fef08a' }}>FHE KPI Vault</h1>
          </div>
          <div style={{ textAlign: 'right', minWidth: 220 }}>
            {walletConnected ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'flex-end' }}>
                {/* Notification Bell Icon */}
                <button
                  type="button"
                  onClick={() => setShowNotificationPanel(!showNotificationPanel)}
                  title="View notifications"
                  style={{
                    padding: '8px',
                    borderRadius: 10,
                    border: '1px solid rgba(250, 204, 21, 0.3)',
                    background: showNotificationPanel ? 'rgba(250, 204, 21, 0.1)' : 'transparent',
                    color: '#facc15',
                    cursor: 'pointer',
                    fontSize: '1.2rem',
                    lineHeight: 1,
                    position: 'relative'
                  }}
                >
                  🔔
                  {(() => {
                    // Count triggered alerts
                    const triggeredAlerts = alertRules.filter(r => r.status === 'active' && r.lastTriggeredAt).length;
                    // Count new feedback (feedback received after last check)
                    const newFeedback = allFeedback.filter(f => {
                      const feedbackTime = new Date(f.submittedAt || f.createdAt || 0).getTime();
                      return feedbackTime > lastFeedbackCheck;
                    }).length;
                    const totalNotifications = triggeredAlerts + newFeedback;
                    
                    return totalNotifications > 0 && (
                      <span
                        style={{
                          position: 'absolute',
                          top: '-4px',
                          right: '-4px',
                          background: '#f87171',
                          color: '#fff',
                          borderRadius: '50%',
                          width: '18px',
                          height: '18px',
                          fontSize: '0.7rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 600
                        }}
                      >
                        {totalNotifications}
                      </span>
                    );
                  })()}
                </button>
                {isAdmin && (
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      background: 'rgba(250, 204, 21, 0.2)',
                      border: '1px solid rgba(250, 204, 21, 0.4)',
                      color: '#facc15',
                      fontSize: '0.75rem',
                      fontWeight: 600
                    }}
                  >
                    ADMIN
                  </span>
                )}
                <span style={{ fontSize: '0.85rem', color: '#fef3c7' }}>
                  {shortenAddress(walletAddress)}
                </span>
                <button
                  type="button"
                  onClick={handleDisconnectWallet}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(248, 113, 113, 0.3)',
                    background: 'transparent',
                    color: '#f87171',
                    cursor: 'pointer'
                  }}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConnectWallet}
                disabled={walletLoading}
                style={{
                  padding: '10px 16px',
                  borderRadius: 12,
                  border: 'none',
                  background: '#facc15',
                  color: '#111',
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: walletLoading ? 0.7 : 1
                }}
              >
                {walletLoading ? 'Connecting…' : 'Connect Wallet'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Notification Panel */}
      {showNotificationPanel && walletConnected && (
        <>
          {/* Backdrop - closes panel on click outside */}
          <div
            onClick={() => setShowNotificationPanel(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999,
              background: 'rgba(0, 0, 0, 0.3)',
              cursor: 'pointer'
            }}
          />
          <div
            className="card"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside panel
            style={{
              position: 'fixed',
              top: 80,
              right: 20,
              width: '400px',
              maxWidth: '90vw',
              maxHeight: '70vh',
              overflowY: 'auto',
              zIndex: 1000,
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              marginBottom: 24
            }}
          >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ margin: 0, color: '#fde68a' }}>Notifications</h2>
            <button
              type="button"
              onClick={() => setShowNotificationPanel(false)}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                border: 'none',
                background: 'transparent',
                color: '#a1a1aa',
                cursor: 'pointer',
                fontSize: '1.2rem'
              }}
            >
              ×
            </button>
          </div>
          <div style={{ display: 'grid', gap: 16 }}>
            {/* Alert Notifications */}
            {alertRules.length > 0 && (
              <div>
                <h3 style={{ margin: '0 0 12px 0', color: '#fde68a', fontSize: '1rem' }}>Alert Triggers</h3>
                <div style={{ display: 'grid', gap: 12 }}>
                  {alertRules
                    .filter(rule => rule.status === 'active' && rule.lastTriggeredAt)
                    .map((rule) => {
                      const config = (rule.config || {}) as { threshold?: number | string; direction?: string };
                      const threshold =
                        typeof config.threshold === 'number' || typeof config.threshold === 'string'
                          ? config.threshold
                          : 'n/a';
                      const direction = config.direction || 'above';
                      return (
                        <div
                          key={rule.id}
                          style={{
                            border: '1px solid rgba(250, 204, 21, 0.2)',
                            borderRadius: 10,
                            padding: 12,
                            background: 'rgba(250, 204, 21, 0.1)'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                            <div style={{ flex: 1 }}>
                              <h4 style={{ margin: 0, color: '#fef3c7', fontSize: '0.95rem' }}>{rule.name}</h4>
                              <p style={{ margin: '4px 0', color: '#a1a1aa', fontSize: '0.8rem' }}>
                                Metric: {rule.metricId} · {direction} {threshold}
                              </p>
                              <p style={{ margin: '4px 0 0', color: '#4ade80', fontSize: '0.75rem', fontWeight: 600 }}>
                                ✓ Triggered: {new Date(rule.lastTriggeredAt!).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  {alertRules.filter(rule => rule.status === 'active' && rule.lastTriggeredAt).length === 0 && (
                    <p style={{ color: '#a1a1aa', margin: 0, fontSize: '0.85rem' }}>No alert triggers yet.</p>
                  )}
                </div>
              </div>
            )}
            
            {/* Feedback Notifications */}
            <div>
              <h3 style={{ margin: '0 0 12px 0', color: '#fde68a', fontSize: '1rem' }}>New Feedback</h3>
              <div style={{ display: 'grid', gap: 12 }}>
                {allFeedback
                  .filter(f => {
                    const feedbackTime = new Date(f.submittedAt || f.createdAt || 0).getTime();
                    return feedbackTime > lastFeedbackCheck;
                  })
                  .slice(0, 10) // Show max 10 newest
                  .map((feedback) => {
                    const metricLabel = metadata[feedback.metricId]?.label || feedback.metricId;
                    return (
                      <div
                        key={feedback.id}
                        style={{
                          border: '1px solid rgba(34, 197, 94, 0.2)',
                          borderRadius: 10,
                          padding: 12,
                          background: 'rgba(34, 197, 94, 0.1)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <h4 style={{ margin: 0, color: '#86efac', fontSize: '0.95rem' }}>New Feedback Received</h4>
                            <p style={{ margin: '4px 0', color: '#a1a1aa', fontSize: '0.8rem' }}>
                              Metric: {metricLabel} · Entry #{feedback.entryIndex}
                            </p>
                            <p style={{ margin: '4px 0', color: '#a1a1aa', fontSize: '0.75rem' }}>
                              From: {shortenAddress(feedback.viewer)}
                            </p>
                            <p style={{ margin: '4px 0 0', color: '#4ade80', fontSize: '0.75rem', fontWeight: 600 }}>
                              ✓ {new Date(feedback.submittedAt || feedback.createdAt || '').toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                {allFeedback.filter(f => {
                  const feedbackTime = new Date(f.submittedAt || f.createdAt || 0).getTime();
                  return feedbackTime > lastFeedbackCheck;
                }).length === 0 && (
                  <p style={{ color: '#a1a1aa', margin: 0, fontSize: '0.85rem' }}>No new feedback.</p>
                )}
              </div>
            </div>
            
            {alertRules.length === 0 && allFeedback.filter(f => {
              const feedbackTime = new Date(f.submittedAt || f.createdAt || 0).getTime();
              return feedbackTime > lastFeedbackCheck;
            }).length === 0 && (
              <p style={{ color: '#a1a1aa', margin: 0 }}>No notifications.</p>
            )}
          </div>
        </div>
        </>
      )}

      {/* Wallet conflict warning - only in console (dev mode), not in UI */}
      {false && hasWalletConflict && (
        <div
          className="card"
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            background: 'rgba(250, 204, 21, 0.15)',
            border: '1px solid rgba(250, 204, 21, 0.3)',
            color: '#fde68a',
            marginBottom: 24,
            fontSize: '0.9rem'
          }}
        >
          <strong>⚠️ Wallet Extension Conflict Detected</strong>
          <p style={{ margin: '8px 0 0 0', fontSize: '0.85rem', color: '#fef3c7' }}>
            Multiple wallet extensions detected (e.g., MetaMask + Phantom). This may cause console errors, but the app should still work. 
            For best results, disable other wallet extensions or use a separate browser profile with only MetaMask enabled.
          </p>
        </div>
      )}

      {error && (
        <div
          className="card"
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            background: 'rgba(248, 113, 113, 0.18)',
            color: '#fecaca',
            marginBottom: 24
          }}
        >
          {error}
        </div>
      )}

      <main style={{ display: 'grid', gap: 24 }}>
        <section className="card">
          <h2 style={{ marginTop: 0, marginBottom: 12, color: '#fef3c7' }}>Owner & Metadata</h2>
          <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: 0, marginBottom: 12 }}>
            Load your own metadata here. To view other users' metrics, use "Viewer Mode" below.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <input
              value={ownerAddress}
              onChange={(event) => setOwnerAddress(event.target.value.trim())}
              placeholder={walletAddress ? `Your wallet: ${shortenAddress(walletAddress)}` : "0x... your wallet"}
              style={{
                flex: '1 1 320px',
                padding: '12px 14px',
                borderRadius: 12,
                border: '1px solid rgba(250, 204, 21, 0.2)',
                background: '#18181b',
                color: '#f4f4f5'
              }}
            />
            <button
              onClick={handleFetchMetadata}
              type="button"
              disabled={isLoadingMetadata}
              className={clsx('btn', isLoadingMetadata && 'btn-disabled')}
              style={{
                padding: '12px 18px',
                borderRadius: 12,
                border: 'none',
                background: '#facc15',
                color: '#111'
              }}
            >
              {isLoadingMetadata ? 'Loading…' : 'Load My Metadata'}
            </button>
          </div>
        </section>

        {/* Feedback Dashboard - Shows all feedback for owner's metrics */}
        {walletConnected && Object.keys(metadata).length > 0 && (
        <section className="card" style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, color: '#fde68a' }}>Feedback Dashboard</h2>
              <p style={{ margin: '4px 0 0 0', color: '#a1a1aa', fontSize: '0.85rem' }}>
                View all encrypted feedback from viewers for your metrics. Click on any feedback to view the full thread.
              </p>
            </div>
            <button
              type="button"
              onClick={() => loadAllFeedback(true)}
              style={{
                padding: '6px 12px',
                borderRadius: 10,
                border: '1px solid rgba(250, 204, 21, 0.3)',
                background: 'transparent',
                color: '#fde68a',
                cursor: 'pointer'
              }}
            >
              Refresh
            </button>
          </div>

          {allFeedback.length === 0 ? (
            <p style={{ color: '#a1a1aa', margin: 0 }}>
              No feedback yet. Grant access to viewers and they can leave encrypted feedback after decrypting your metrics.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {/* Group feedback by metric */}
              {(() => {
                // Group feedback by metric
                const grouped = allFeedback.reduce((acc, feedback) => {
                  const metricId = feedback.metricId;
                  if (!acc[metricId]) {
                    acc[metricId] = [];
                  }
                  acc[metricId].push(feedback);
                  return acc;
                }, {} as Record<string, FeedbackEntry[]>);

                // Convert to array and sort by most recent feedback
                return Object.entries(grouped)
                  .sort(([, aFeedbacks], [, bFeedbacks]) => {
                    const aLatest = Math.max(...aFeedbacks.map(f => new Date(f.submittedAt || f.createdAt || 0).getTime()));
                    const bLatest = Math.max(...bFeedbacks.map(f => new Date(f.submittedAt || f.createdAt || 0).getTime()));
                    return bLatest - aLatest;
                  })
                  .map(([metricId, feedbacks]) => {
                  const metricLabel = metadata[metricId]?.label || metricId;
                  const sortedFeedbacks = feedbacks.sort((a, b) => {
                    const aTime = new Date(a.submittedAt || a.createdAt || 0).getTime();
                    const bTime = new Date(b.submittedAt || b.createdAt || 0).getTime();
                    return bTime - aTime; // Newest first
                  });

                  return (
                    <div
                      key={metricId}
                      style={{
                        border: '1px solid rgba(250, 204, 21, 0.12)',
                        borderRadius: 12,
                        padding: 16,
                        background: 'rgba(250, 204, 21, 0.02)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <h3 style={{ margin: 0, color: '#fef3c7', fontSize: '1.1rem' }}>
                          {metricLabel}
                        </h3>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: 999,
                            border: '1px solid rgba(250, 204, 21, 0.25)',
                            color: '#fde68a',
                            fontSize: '0.75rem',
                            fontWeight: 600
                          }}
                        >
                          {feedbacks.length} {feedbacks.length === 1 ? 'feedback' : 'feedbacks'}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gap: 10 }}>
                        {sortedFeedbacks.slice(0, 5).map((feedback) => {
                          const feedbackTime = new Date(feedback.submittedAt || feedback.createdAt || 0);
                          const isNew = feedbackTime.getTime() > lastFeedbackCheck;
                          const metaPreview = feedback.noteMetadata?.preview as string | undefined;
                          
                          return (
                            <div
                              key={feedback.id}
                              onClick={() => {
                                setFeedbackOwnerInput(feedback.owner);
                                setFeedbackMetricInput(feedback.metricId);
                                setFeedbackEntryInput(feedback.entryIndex);
                                loadFeedbackThread({
                                  owner: feedback.owner,
                                  metricId: feedback.metricId,
                                  entryIndex: feedback.entryIndex
                                });
                                // Scroll to feedback thread section
                                setTimeout(() => {
                                  const element = document.querySelector('[data-feedback-section]');
                                  if (element) {
                                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                  }
                                }, 100);
                              }}
                              style={{
                                border: `1px solid ${isNew ? 'rgba(34, 197, 94, 0.3)' : 'rgba(250, 204, 21, 0.12)'}`,
                                borderRadius: 10,
                                padding: 12,
                                background: isNew ? 'rgba(34, 197, 94, 0.1)' : 'rgba(250, 204, 21, 0.02)',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = isNew ? 'rgba(34, 197, 94, 0.15)' : 'rgba(250, 204, 21, 0.05)';
                                e.currentTarget.style.borderColor = isNew ? 'rgba(34, 197, 94, 0.5)' : 'rgba(250, 204, 21, 0.25)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = isNew ? 'rgba(34, 197, 94, 0.1)' : 'rgba(250, 204, 21, 0.02)';
                                e.currentTarget.style.borderColor = isNew ? 'rgba(34, 197, 94, 0.3)' : 'rgba(250, 204, 21, 0.12)';
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                    <span style={{ color: '#fef3c7', fontWeight: 600, fontSize: '0.9rem' }}>
                                      {shortenAddress(feedback.viewer)}
                                    </span>
                                    {isNew && (
                                      <span
                                        style={{
                                          padding: '2px 6px',
                                          borderRadius: 999,
                                          background: '#22c55e',
                                          color: '#111',
                                          fontSize: '0.65rem',
                                          fontWeight: 600
                                        }}
                                      >
                                        NEW
                                      </span>
                                    )}
                                    <span style={{ color: '#a1a1aa', fontSize: '0.75rem' }}>
                                      Entry #{feedback.entryIndex}
                                    </span>
                                  </div>
                                  <div style={{ color: '#a1a1aa', fontSize: '0.8rem', marginBottom: 6 }}>
                                    {feedbackTime.toLocaleString()}
                                  </div>
                                  {metaPreview ? (
                                    <div style={{ color: '#e4e4e7', fontSize: '0.85rem' }}>
                                      <strong style={{ color: '#fde68a' }}>Preview:</strong> {metaPreview}
                                    </div>
                                  ) : (
                                    <div style={{ color: '#a1a1aa', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                      Encrypted feedback (click to view)
                                    </div>
                                  )}
                                </div>
                                <span
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: 999,
                                    border: '1px solid rgba(250, 204, 21, 0.25)',
                                    color: feedback.status === 'deleted' ? '#f87171' : '#fde68a',
                                    fontSize: '0.7rem'
                                  }}
                                >
                                  {feedback.status === 'deleted' ? 'Deleted' : 'Active'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                        {feedbacks.length > 5 && (
                          <p style={{ color: '#a1a1aa', fontSize: '0.8rem', margin: '8px 0 0 0', textAlign: 'center' }}>
                            +{feedbacks.length - 5} more feedback entries (click any to view full thread)
                          </p>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </section>
        )}

        {/* Advanced Feedback Thread Viewer (for detailed view) - Show when a thread is loaded */}
        {activeFeedbackKey && (
        <section className="card" style={{ display: 'grid', gap: 16 }} data-feedback-section>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ margin: 0, color: '#fde68a' }}>Feedback Thread</h2>
                <p style={{ margin: '4px 0 0 0', color: '#a1a1aa', fontSize: '0.85rem' }}>
                  Full conversation thread for {metadata[activeFeedbackMetricId]?.label || activeFeedbackMetricId} - Entry #{activeFeedbackEntryIndex}
                </p>
              </div>
              <button
                type="button"
                onClick={() => loadFeedbackThread()}
                disabled={!activeFeedbackKey || Boolean(isFeedbackLoading)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(250, 204, 21, 0.3)',
                  background: 'transparent',
                  color: '#fde68a',
                  cursor: activeFeedbackKey ? 'pointer' : 'not-allowed',
                  opacity: !activeFeedbackKey || isFeedbackLoading ? 0.5 : 1
                }}
              >
                {isFeedbackLoading ? 'Loading…' : 'Reload thread'}
              </button>
            </div>
          </div>

          {/* Advanced filter inputs (primarily for founders/admins to review threads).
              Viewers typically won't touch these; they use the inline composer in Viewer Mode. */}
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <input
              value={feedbackOwnerInput}
              onChange={(e) => setFeedbackOwnerInput(e.target.value)}
              placeholder="Owner address (0x...)"
              style={inputStyle}
            />
            <input
              value={feedbackMetricInput}
              onChange={(e) => setFeedbackMetricInput(e.target.value)}
              placeholder="Metric ID (e.g., revenue)"
              style={inputStyle}
            />
            <input
              value={feedbackEntryInput}
              onChange={(e) => setFeedbackEntryInput(e.target.value)}
              placeholder="Entry index (0 = latest)"
              style={inputStyle}
            />
          </div>

          {activeFeedbackKey ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {activeFeedbackThread.length === 0 ? (
                <p style={{ color: '#a1a1aa', margin: 0 }}>
                  Thread is empty. Invite a viewer to decrypt and leave a note, or add an owner note below.
                </p>
              ) : (
                activeFeedbackThread.map((entry) => {
                  const metaPreview = entry.noteMetadata?.preview as string | undefined;
                  const canModerate =
                    normalizedViewerAddress === entry.viewer ||
                    normalizedViewerAddress === entry.owner;
                  return (
                    <div
                      key={entry.id}
                      style={{
                        border: '1px solid rgba(250, 204, 21, 0.12)',
                        borderRadius: 12,
                        padding: 12,
                        background: 'rgba(250, 204, 21, 0.02)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <div>
                          <div style={{ color: '#fef3c7', fontWeight: 600, fontSize: '0.95rem' }}>
                            {shortenAddress(entry.viewer)}
                          </div>
                          <small style={{ color: '#a1a1aa' }}>
                            {entry.submittedAt ? new Date(entry.submittedAt).toLocaleString() : 'Pending timestamp'}
                          </small>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 999,
                              border: '1px solid rgba(250, 204, 21, 0.25)',
                              color: entry.status === 'deleted' ? '#f87171' : '#fde68a',
                              fontSize: '0.75rem'
                            }}
                          >
                            {entry.status === 'deleted' ? 'Deleted' : 'Active'}
                          </span>
                          {canModerate && entry.status !== 'deleted' && (
                            <button
                              type="button"
                              onClick={() => handleDeleteFeedback(entry.id, entry.owner, entry.metricId, entry.entryIndex)}
                              style={{
                                border: 'none',
                                borderRadius: 8,
                                background: '#f87171',
                                color: '#111',
                                padding: '4px 10px',
                                fontSize: '0.75rem',
                                cursor: 'pointer'
                              }}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ marginTop: 10, color: '#e4e4e7', fontSize: '0.9rem' }}>
                        {metaPreview ? (
                          <>
                            <strong style={{ color: '#fde68a' }}>Preview:</strong> {metaPreview}
                          </>
                        ) : (
                          <span style={{ color: '#a1a1aa' }}>
                            Ciphertext stored (owner can decrypt via relayer). Handle: {entry.ciphertext.slice(0, 18)}…
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <p style={{ margin: 0, color: '#a1a1aa' }}>
              Provide an owner address, metric ID, and entry index to see the feedback timeline.
            </p>
          )}

          <div style={{ display: 'grid', gap: 8 }}>
            <textarea
              value={feedbackDraftValue}
              onChange={(e) =>
                activeFeedbackKey &&
                setFeedbackDrafts((prev) => ({ ...prev, [activeFeedbackKey]: e.target.value }))
              }
              disabled={!activeFeedbackKey}
              rows={3}
              placeholder={
                activeFeedbackKey
                  ? 'Write an encrypted note (viewers sign this with their wallet)'
                  : 'Select a metric + entry to unlock the composer'
              }
              style={{ ...inputStyle, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => handleSubmitFeedback()}
                disabled={!activeFeedbackKey || feedbackSubmitBusy}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: activeFeedbackKey ? '#facc15' : '#3f3f46',
                  color: activeFeedbackKey ? '#111' : '#a1a1aa',
                  cursor: activeFeedbackKey ? 'pointer' : 'not-allowed',
                  opacity: feedbackSubmitBusy ? 0.6 : 1,
                  fontWeight: 600
                }}
              >
                {feedbackSubmitBusy ? 'Submitting…' : 'Send encrypted note'}
              </button>
            </div>
          </div>
        </section>
        )}

        {/* Automated Alerts Section (advanced, optional for power users) */}
        <section className="card" style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, color: '#fde68a' }}>Automated Alerts</h2>
              <p style={{ margin: '4px 0 0', color: '#a1a1aa', fontSize: '0.85rem' }}>
                Optional: set up rules so teammates or investors get notified when a KPI moves. You can skip this for now.
              </p>
            </div>
            <button
              type="button"
              onClick={loadAlerts}
              disabled={loadingAlerts}
              style={{
                padding: '6px 12px',
                borderRadius: 10,
                border: '1px solid rgba(250, 204, 21, 0.3)',
                background: 'transparent',
                color: '#fde68a',
                cursor: 'pointer',
                opacity: loadingAlerts ? 0.6 : 1
              }}
            >
              {loadingAlerts ? 'Refreshing…' : 'Refresh rules'}
            </button>
          </div>

          <form onSubmit={handleCreateAlert} style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <input
                value={alertForm.metricId}
                onChange={(e) => setAlertForm((prev) => ({ ...prev, metricId: e.target.value }))}
                placeholder="Metric ID"
                style={inputStyle}
                required
              />
              <input
                value={alertForm.name}
                onChange={(e) => setAlertForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Alert name (optional)"
                style={inputStyle}
              />
              <select
                value={alertForm.direction}
                onChange={(e) => setAlertForm((prev) => ({ ...prev, direction: e.target.value }))}
                style={{ ...inputStyle, appearance: 'none' }}
              >
                <option value="above">Trigger when above threshold</option>
                <option value="below">Trigger when below threshold</option>
              </select>
              <input
                type="number"
                step="0.01"
                value={alertForm.threshold}
                onChange={(e) => setAlertForm((prev) => ({ ...prev, threshold: e.target.value }))}
                placeholder="Threshold value"
                style={inputStyle}
              />
              <input
                type="number"
                step="0.1"
                value={alertForm.changePercent}
                onChange={(e) => setAlertForm((prev) => ({ ...prev, changePercent: e.target.value }))}
                placeholder="Optional % change"
                style={inputStyle}
              />
              <input
                type="email"
                value={alertForm.email}
                onChange={(e) => setAlertForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Email for notifications"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={alertSubmitting}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#4ade80',
                  color: '#111',
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: alertSubmitting ? 0.7 : 1
                }}
              >
                {alertSubmitting ? 'Saving…' : 'Save alert rule'}
              </button>
            </div>
          </form>

          {loadingAlerts ? (
            <p style={{ color: '#a1a1aa', margin: 0 }}>Loading alert rules…</p>
          ) : alertRules.length === 0 ? (
            <p style={{ color: '#a1a1aa', margin: 0 }}>
              No alert rules yet. Create one above to start receiving notifications.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {alertRules.map((rule) => {
                const config = (rule.config || {}) as { threshold?: number | string; direction?: string };
                const threshold =
                  typeof config.threshold === 'number' || typeof config.threshold === 'string'
                    ? config.threshold
                    : 'n/a';
                const direction = config.direction || 'above';
                const isRemoving = !!alertActioning[rule.id];
                const isSubscribing = !!alertActioning[`sub-${rule.id}`];
                const subscriptionValue = alertSubscriptionDrafts[rule.id] || '';
                return (
                  <div
                    key={rule.id}
                    style={{
                      border: '1px solid rgba(250, 204, 21, 0.12)',
                      borderRadius: 12,
                      padding: 12,
                      background: 'rgba(250, 204, 21, 0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <h3 style={{ margin: 0, color: '#fef3c7' }}>{rule.name}</h3>
                        <small style={{ color: '#a1a1aa' }}>
                          Metric {rule.metricId} · Trigger when {direction} {threshold}
                        </small>
                      </div>
                      <span
                        style={{
                          padding: '2px 10px',
                          borderRadius: 999,
                          border: '1px solid rgba(250, 204, 21, 0.25)',
                          color: rule.status === 'active' ? '#4ade80' : '#f87171',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}
                      >
                        {rule.status === 'active' ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    {rule.lastTriggeredAt && (
                      <div style={{ marginTop: 4, color: '#a1a1aa', fontSize: '0.8rem' }}>
                        Last triggered {new Date(rule.lastTriggeredAt).toLocaleString()}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                      <input
                        type="email"
                        value={subscriptionValue}
                        onChange={(e) =>
                          setAlertSubscriptionDrafts((prev) => ({ ...prev, [rule.id]: e.target.value }))
                        }
                        placeholder="Subscribe another email"
                        style={{ ...inputStyle, flex: '1 1 220px' }}
                      />
                      <button
                        type="button"
                        onClick={() => handleSubscribeToAlert(rule.id)}
                        disabled={isSubscribing}
                        style={{
                          padding: '10px 16px',
                          borderRadius: 10,
                          border: 'none',
                          background: '#fde68a',
                          color: '#111',
                          fontWeight: 600,
                          cursor: 'pointer',
                          opacity: isSubscribing ? 0.6 : 1
                        }}
                      >
                        {isSubscribing ? 'Subscribing…' : 'Subscribe'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAlert(rule.id)}
                        disabled={isRemoving}
                        style={{
                          padding: '10px 16px',
                          borderRadius: 10,
                          border: '1px solid rgba(248, 113, 113, 0.6)',
                          background: 'transparent',
                          color: '#f87171',
                          fontWeight: 600,
                          cursor: 'pointer',
                          opacity: isRemoving ? 0.6 : 1
                        }}
                      >
                        {isRemoving ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Shareboards Section - temporarily hidden for simplified UX */}
        {false && (
        <section className="card" style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, color: '#fde68a' }}>Shared Dashboards (Shareboards)</h2>
              <p style={{ margin: '4px 0 0', color: '#a1a1aa', fontSize: '0.85rem' }}>
                Curate a read-only view for stakeholders. Choose metrics, history ranges, and access mode.
              </p>
            </div>
            <button
              type="button"
              onClick={loadShareboards}
              disabled={loadingShareboards}
              style={{
                padding: '6px 12px',
                borderRadius: 10,
                border: '1px solid rgba(250, 204, 21, 0.3)',
                background: 'transparent',
                color: '#fde68a',
                cursor: 'pointer',
                opacity: loadingShareboards ? 0.6 : 1
              }}
            >
              {loadingShareboards ? 'Refreshing…' : 'Refresh boards'}
            </button>
          </div>

          <form onSubmit={handleCreateShareboard} style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <input
                value={shareboardForm.title}
                onChange={(e) => setShareboardForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Shareboard title"
                style={inputStyle}
              />
              <input
                value={shareboardForm.metricIds}
                onChange={(e) => setShareboardForm((prev) => ({ ...prev, metricIds: e.target.value }))}
                placeholder="Metric IDs (comma separated)"
                style={inputStyle}
              />
              <input
                type="number"
                min="1"
                value={shareboardForm.includeHistoryWindow}
                onChange={(e) =>
                  setShareboardForm((prev) => ({ ...prev, includeHistoryWindow: e.target.value }))
                }
                placeholder="History window (entries)"
                style={inputStyle}
              />
              <select
                value={shareboardForm.snapshotStrategy}
                onChange={(e) =>
                  setShareboardForm((prev) => ({ ...prev, snapshotStrategy: e.target.value }))
                }
                style={{ ...inputStyle, appearance: 'none' }}
              >
                <option value="live">Live (decrypt on view)</option>
                <option value="snapshot">Snapshot (owner pre-approves)</option>
              </select>
              <select
                value={shareboardForm.accessMode}
                onChange={(e) =>
                  setShareboardForm((prev) => ({ ...prev, accessMode: e.target.value }))
                }
                style={{ ...inputStyle, appearance: 'none' }}
              >
                <option value="walletAllowlist">Wallet allowlist</option>
                <option value="token">Protected by token</option>
                <option value="publicLink">Public snapshot link</option>
              </select>
            </div>
            <textarea
              value={shareboardForm.description}
              onChange={(e) => setShareboardForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Optional description for viewers"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
            <input
              value={shareboardForm.allowedWallets}
              onChange={(e) =>
                setShareboardForm((prev) => ({ ...prev, allowedWallets: e.target.value }))
              }
              placeholder="Allowed wallets (comma separated)"
              style={inputStyle}
              disabled={shareboardForm.accessMode !== 'walletAllowlist'}
            />
            <input
              value={shareboardForm.token}
              onChange={(e) => setShareboardForm((prev) => ({ ...prev, token: e.target.value }))}
              placeholder="Shared secret/token"
              style={inputStyle}
              disabled={shareboardForm.accessMode !== 'token'}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={shareboardSubmitting}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#4ade80',
                  color: '#111',
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: shareboardSubmitting ? 0.7 : 1
                }}
              >
                {shareboardSubmitting ? 'Creating…' : 'Create shareboard'}
              </button>
            </div>
          </form>

          {loadingShareboards ? (
            <p style={{ color: '#a1a1aa', margin: 0 }}>Loading shareboards…</p>
          ) : shareboards.length === 0 ? (
            <p style={{ color: '#a1a1aa', margin: 0 }}>
              No shareboards yet. Use the form above to publish a curated dashboard.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {shareboards.map((board) => {
                const isRevoking = !!shareboardActioning[board.id];
                const shareUrl =
                  typeof window !== 'undefined'
                    ? `${window.location.origin}/share/${board.id}`
                    : `/share/${board.id}`;
                return (
                  <div
                    key={board.id}
                    style={{
                      border: '1px solid rgba(250, 204, 21, 0.12)',
                      borderRadius: 12,
                      padding: 12,
                      background: 'rgba(250, 204, 21, 0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <h3 style={{ margin: 0, color: '#fef3c7' }}>{board.title}</h3>
                        <small style={{ color: '#a1a1aa' }}>
                          {board.metricIds.length} metrics · Access mode: {board.access.mode}
                        </small>
                      </div>
                      <span
                        style={{
                          padding: '2px 10px',
                          borderRadius: 999,
                          border: '1px solid rgba(250, 204, 21, 0.25)',
                          color: board.status === 'active' ? '#4ade80' : '#f87171',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}
                      >
                        {board.status}
                      </span>
                    </div>
                    {board.description && (
                      <p style={{ marginTop: 8, color: '#e4e4e7' }}>{board.description}</p>
                    )}
                    <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#a1a1aa' }}>
                      Share link:{' '}
                      <a href={shareUrl} target="_blank" rel="noreferrer" style={{ color: '#fde68a' }}>
                        {shareUrl}
                      </a>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                            navigator.clipboard.writeText(shareUrl);
                            showToast('Shareboard link copied to clipboard.');
                          }
                        }}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 10,
                          border: '1px solid rgba(250, 204, 21, 0.3)',
                          background: 'transparent',
                          color: '#fde68a',
                          cursor: 'pointer'
                        }}
                      >
                        Copy link
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteShareboard(board.id)}
                        disabled={isRevoking}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 10,
                          border: '1px solid rgba(248, 113, 113, 0.5)',
                          background: 'transparent',
                          color: '#f87171',
                          cursor: 'pointer',
                          opacity: isRevoking ? 0.6 : 1
                        }}
                      >
                        {isRevoking ? 'Revoking…' : 'Revoke'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        )}

        {/* Viewer Mode Section */}
        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ marginTop: 0, marginBottom: 0, color: '#fde68a' }}>Viewer Mode</h2>
            <button
              type="button"
              onClick={() => {
                setViewerMode(!viewerMode);
                if (viewerMode) {
                  setViewerOwnerAddress('');
                  setViewerMetadata({});
                  setViewerMetrics({});
                }
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid rgba(250, 204, 21, 0.3)',
                background: viewerMode ? 'rgba(250, 204, 21, 0.1)' : 'transparent',
                color: '#fde68a',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              {viewerMode ? 'Exit Viewer Mode' : 'Enter Viewer Mode'}
            </button>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: 0, marginBottom: 12 }}>
            View metrics from other users if they've granted you access. Enter the owner's wallet address below.
          </p>
          {viewerMode && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <input
                value={viewerOwnerAddress}
                onChange={(event) => setViewerOwnerAddress(event.target.value.trim())}
                placeholder="0x... owner wallet address"
                style={{
                  flex: '1 1 320px',
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(250, 204, 21, 0.2)',
                  background: '#18181b',
                  color: '#f4f4f5'
                }}
              />
              <button
                onClick={handleLoadViewerMetrics}
                type="button"
                disabled={!walletConnected || !viewerOwnerAddress.trim()}
                style={{
                  padding: '12px 18px',
                  borderRadius: 12,
                  border: 'none',
                  background: walletConnected && viewerOwnerAddress.trim() ? '#4ade80' : '#3f3f46',
                  color: walletConnected && viewerOwnerAddress.trim() ? '#111' : '#a1a1aa',
                  fontWeight: 600,
                  cursor: walletConnected && viewerOwnerAddress.trim() ? 'pointer' : 'not-allowed'
                }}
              >
                Load Metrics
              </button>
            </div>
          )}
          {viewerMode && Object.keys(viewerMetadata).length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h3 style={{ color: '#fef3c7', marginBottom: 12 }}>Viewing metrics for {shortenAddress(viewerOwnerAddress)}</h3>
              <div className="metric-grid">
                {Object.values(viewerMetadata).map((metric) => {
                  const metricKey = String(metric.metricId);
                  const entries = viewerMetrics[metricKey] || [];
                  const isBusy = loadingViewerMetrics[metricKey];
                  return (
                    <article className="metric-card" key={metricKey}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0 }}>{metric.label || metricKey}</h3>
                        <button
                          type="button"
                          onClick={() => loadViewerMetricEntries(metricKey)}
                          disabled={isBusy || !walletConnected}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 10,
                            border: '1px solid rgba(250, 204, 21, 0.3)',
                            background: 'transparent',
                            color: '#fde68a',
                            cursor: walletConnected ? 'pointer' : 'not-allowed',
                            opacity: isBusy ? 0.6 : 1,
                            fontSize: '0.8rem'
                          }}
                        >
                          {isBusy ? 'Loading…' : 'Load Entries'}
                        </button>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>
                        Unit: {metric.unit || 'n/a'} · Category: {metric.category || 'n/a'}
                      </p>
                      
                      {/* Analytics Summary for Viewer Mode */}
                      {(() => {
                        const decryptedEntries = entries.filter((e) => e.decryptedValue !== undefined);
                        if (decryptedEntries.length === 0 && entries.length === 0) {
                          return (
                            <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: 12 }}>
                              No entries loaded yet. Click "Load Entries" to view encrypted KPI values.
                            </p>
                          );
                        }
                        
                        if (decryptedEntries.length > 0) {
                          // Sort entries by timestamp (oldest first) for cumulative calculation
                          const sortedEntries = [...decryptedEntries].sort((a, b) => a.timestamp - b.timestamp);
                          
                          // Calculate cumulative totals (running sum) as entries are decrypted
                          let runningTotal = 0;
                          const entriesWithCumulative = sortedEntries.map((entry) => {
                            runningTotal += entry.decryptedValue!;
                            return {
                              ...entry,
                              cumulativeTotal: runningTotal,
                              individualValue: entry.decryptedValue!
                            };
                          });

                          const values = sortedEntries.map((e) => e.decryptedValue!);
                          const cumulativeValues = entriesWithCumulative.map((e) => e.cumulativeTotal);
                          const latest = values[values.length - 1];
                          const latestCumulative = cumulativeValues[cumulativeValues.length - 1]; // This is the total
                          const first = values[0];
                          const previous = values.length > 1 ? values[values.length - 2] : latest;
                          const change = latest - previous;
                          const changePercent = previous !== 0 ? (change / previous) * 100 : 0;
                          const totalChange = latest - first;
                          const totalChangePercent = first !== 0 ? (totalChange / first) * 100 : 0;
                          const average = values.reduce((sum, v) => sum + v, 0) / values.length;
                          const min = Math.min(...values);
                          const max = Math.max(...values);

                          return (
                            <div
                              style={{
                                marginTop: 12,
                                padding: '16px',
                                border: '1px solid rgba(250, 204, 21, 0.15)',
                                borderRadius: 10,
                                background: 'rgba(250, 204, 21, 0.03)',
                                overflow: 'hidden',
                                width: '100%',
                                maxWidth: '100%',
                                boxSizing: 'border-box',
                                display: 'flex',
                                flexDirection: 'column'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <h4 style={{ margin: 0, fontSize: '1.2rem', color: '#fde68a', fontWeight: 600 }}>📊 Time-Series Dashboard</h4>
                                {cumulativeValues.length > 1 && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Sparkline data={cumulativeValues} width={80} height={24} />
                                  </div>
                                )}
                              </div>

                              {/* Key Metrics Summary - Cumulative Total is the main focus */}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
                                <div style={{ 
                                  gridColumn: values.length > 1 ? 'span 2' : 'span 1',
                                  padding: '14px',
                                  borderRadius: 8,
                                  background: 'rgba(250, 204, 21, 0.1)',
                                  border: '2px solid rgba(250, 204, 21, 0.3)'
                                }}>
                                  <div style={{ fontSize: '0.9rem', color: '#fde68a', marginBottom: 8, fontWeight: 500 }}>📈 Cumulative Total</div>
                                  <div style={{ fontSize: '2rem', color: '#fef3c7', fontWeight: 700 }}>
                                    {latestCumulative.toLocaleString(undefined, { maximumFractionDigits: 2 })} {metric.unit || ''}
                                  </div>
                                  <div style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: 6 }}>
                                    {sortedEntries.length} {sortedEntries.length === 1 ? 'entry' : 'entries'} decrypted
                                  </div>
                                </div>
                                {values.length > 1 && (
                                  <>
                                    <div>
                                      <div style={{ fontSize: '0.85rem', color: '#a1a1aa', marginBottom: 6 }}>Latest Entry</div>
                                      <div style={{ fontSize: '1.4rem', color: '#fef3c7', fontWeight: 600 }}>
                                        {latest.toLocaleString(undefined, { maximumFractionDigits: 2 })} {metric.unit || ''}
                                      </div>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: '0.85rem', color: '#a1a1aa', marginBottom: 6 }}>Average per Entry</div>
                                      <div style={{ fontSize: '1.4rem', color: '#fef3c7', fontWeight: 600 }}>
                                        {average.toLocaleString(undefined, { maximumFractionDigits: 2 })} {metric.unit || ''}
                                      </div>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: '0.85rem', color: '#a1a1aa', marginBottom: 6 }}>Latest Change</div>
                                      <div
                                        style={{
                                          fontSize: '1.4rem',
                                          color: change >= 0 ? '#4ade80' : '#f87171',
                                          fontWeight: 600
                                        }}
                                      >
                                        {change >= 0 ? '↑' : '↓'} {Math.abs(changePercent).toFixed(1)}%
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>

                              {/* Full Time-Series Chart */}
                              {decryptedEntries.length > 1 && (
                                <div style={{ 
                                  marginTop: 8,
                                  marginBottom: 16,
                                  width: '100%',
                                  maxWidth: '100%',
                                  overflow: 'hidden',
                                  borderRadius: 8,
                                  display: 'flex',
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                  boxSizing: 'border-box',
                                  padding: '8px',
                                  background: 'rgba(0, 0, 0, 0.2)'
                                }}>
                                  <div style={{ 
                                    width: '100%', 
                                    maxWidth: '100%', 
                                    overflow: 'hidden',
                                    boxSizing: 'border-box',
                                    display: 'flex',
                                    justifyContent: 'center'
                                  }}>
                                    <KpiChart
                                      data={entriesWithCumulative.map((e) => ({
                                        timestamp: e.timestamp,
                                        value: e.cumulativeTotal // Show cumulative totals in chart
                                      }))}
                                      unit={metric.unit || ''}
                                      width={Math.min(600, typeof window !== 'undefined' ? window.innerWidth - 100 : 500)}
                                      height={180}
                                    />
                                  </div>
                                </div>
                              )}

                              {/* All Entries Table - Shows Individual + Cumulative */}
                              <div style={{ marginTop: 8 }}>
                                <div style={{ fontSize: '1rem', color: '#a1a1aa', marginBottom: 10, fontWeight: 500 }}>
                                  All Entries Over Time ({sortedEntries.length} {sortedEntries.length === 1 ? 'entry' : 'entries'}) - Cumulative Totals
                                </div>
                                <div style={{ 
                                  display: 'grid', 
                                  gap: 10,
                                  maxHeight: '300px',
                                  overflowY: 'auto',
                                  paddingRight: 4
                                }}>
                                  {entriesWithCumulative.map((entry, idx) => {
                                    const entryValue = entry.individualValue;
                                    const cumulativeValue = entry.cumulativeTotal;
                                    const date = new Date(entry.timestamp * 1000);
                                    const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                                    
                                    return (
                                      <div
                                        key={`dashboard-${entry.index}`}
                                        style={{
                                          display: 'grid',
                                          gridTemplateColumns: 'auto 1fr auto auto',
                                          gap: 12,
                                          alignItems: 'center',
                                          padding: '12px 14px',
                                          borderRadius: 8,
                                          background: idx % 2 === 0 ? 'rgba(250, 204, 21, 0.02)' : 'transparent',
                                          border: '1px solid rgba(250, 204, 21, 0.08)'
                                        }}
                                      >
                                        <div style={{ fontSize: '0.9rem', color: '#a1a1aa', minWidth: '90px' }}>
                                          {monthName}
                                        </div>
                                        <div style={{ fontSize: '1rem', color: '#e4e4e7', fontWeight: 500 }}>
                                          Entry #{entry.index + 1}
                                        </div>
                                        <div style={{ fontSize: '1rem', color: '#a1a1aa', textAlign: 'right' }}>
                                          +{entryValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} {metric.unit || ''}
                                        </div>
                                        <div style={{ fontSize: '1.15rem', color: '#fef3c7', fontWeight: 700, textAlign: 'right', minWidth: '120px' }}>
                                          = {cumulativeValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} {metric.unit || ''}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        }
                        
                        return null;
                      })()}

                      {/* Entries List */}
                      {entries.length > 0 && (
                        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                          {entries.map((entry) => {
                            const decryptBusy = decryptingKey === `${metricKey}:${entry.index}`;
                            const decrypted = entry.decryptedValue !== undefined;
                            const viewerOwnerNormalized = normalizeAddress(viewerOwnerAddress || '');
                            const entryIndexStr = String(entry.index);
                            const inlineFeedbackKey =
                              viewerOwnerNormalized && metricKey
                                ? buildFeedbackKey(viewerOwnerNormalized, metricKey, entryIndexStr)
                                : '';
                            const inlineDraftValue = inlineFeedbackKey
                              ? feedbackDrafts[inlineFeedbackKey] || ''
                              : '';
                            const inlineSubmitting = inlineFeedbackKey
                              ? feedbackSubmittingKey === inlineFeedbackKey
                              : false;
                            return (
                              <div
                                key={`${metricKey}-${entry.index}`}
                                style={{
                                  border: '1px solid rgba(250, 204, 21, 0.08)',
                                  borderRadius: 12,
                                  padding: '12px'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ color: '#e4e4e7', fontSize: '0.95rem' }}>
                                    Entry #{entry.index + 1}{' '}
                                    <span style={{ color: '#a1a1aa', fontSize: '0.8rem' }}>
                                      ({formatTimestamp(entry.timestamp)})
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleDecryptMetric(metricKey, entry, viewerOwnerAddress)}
                                    disabled={!walletConnected || decryptBusy}
                                    style={{
                                      padding: '6px 12px',
                                      borderRadius: 8,
                                      border: 'none',
                                      background: '#facc15',
                                      color: '#111',
                                      fontWeight: 600,
                                      cursor: walletConnected ? 'pointer' : 'not-allowed',
                                      opacity: decryptBusy ? 0.6 : 1,
                                      fontSize: '0.8rem'
                                    }}
                                  >
                                    {decryptBusy ? 'Decrypting…' : decrypted ? 'Refresh' : 'Decrypt'}
                                  </button>
                                </div>
                                <div style={{ marginTop: 8 }}>
                                  <div style={{ color: '#fef3c7', fontSize: '1.1rem' }}>
                                    {decrypted ? `${entry.decryptedValue?.toLocaleString()} ${metric.unit || ''}` : '🔒 Encrypted'}
                                  </div>
                                  {entry.decryptedNote && (
                                    <div style={{ marginTop: 6, color: '#a1a1aa', fontSize: '0.9rem' }}>
                                      Note: {entry.decryptedNote}
                                    </div>
                                  )}
                                  {/* Inline investor feedback composer for viewers, scoped to this KPI entry */}
                                  {viewerMode && decrypted && viewerOwnerAddress && (
                                    <div
                                      style={{
                                        marginTop: 10,
                                        paddingTop: 10,
                                        borderTop: '1px solid rgba(250, 204, 21, 0.08)',
                                        display: 'grid',
                                        gap: 8
                                      }}
                                    >
                                      <textarea
                                        value={inlineDraftValue}
                                        onChange={(e) => {
                                          if (!inlineFeedbackKey) return;
                                          // Bind global feedback context to this specific owner/metric/entry
                                          setFeedbackOwnerInput(viewerOwnerAddress);
                                          setFeedbackMetricInput(metricKey);
                                          setFeedbackEntryInput(entryIndexStr);
                                          setFeedbackDrafts((prev) => ({
                                            ...prev,
                                            [inlineFeedbackKey]: e.target.value
                                          }));
                                        }}
                                        rows={2}
                                        placeholder="Leave a private note for the founder (only they can decrypt it)…"
                                        style={{ ...inputStyle, resize: 'vertical', fontSize: '0.85rem' }}
                                      />
                                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (!inlineFeedbackKey || !inlineDraftValue.trim()) {
                                              return;
                                            }
                                            // Ensure the global feedback key matches this entry, then reuse handler
                                            setFeedbackOwnerInput(viewerOwnerAddress);
                                            setFeedbackMetricInput(metricKey);
                                            setFeedbackEntryInput(entryIndexStr);
                                            void handleSubmitFeedback();
                                          }}
                                          disabled={!inlineDraftValue.trim() || inlineSubmitting}
                                          style={{
                                            padding: '6px 12px',
                                            borderRadius: 8,
                                            border: 'none',
                                            background: inlineDraftValue.trim() ? '#facc15' : '#3f3f46',
                                            color: inlineDraftValue.trim() ? '#111' : '#a1a1aa',
                                            cursor: inlineDraftValue.trim() ? 'pointer' : 'not-allowed',
                                            opacity: inlineSubmitting ? 0.6 : 1,
                                            fontSize: '0.8rem',
                                            fontWeight: 600
                                          }}
                                        >
                                          {inlineSubmitting ? 'Sending…' : 'Send private feedback'}
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0, color: '#fde68a' }}>Add Metric Metadata</h2>
          <form onSubmit={handleSubmitMetadata} style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <input
                value={draft.metricId}
                onChange={(event) => setDraft((prev) => ({ ...prev, metricId: event.target.value }))}
                placeholder="Metric ID (e.g., mrr)"
                required
                style={inputStyle}
              />
              <input
                value={draft.label}
                onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
                placeholder="Label"
                style={inputStyle}
              />
              <input
                value={draft.unit}
                onChange={(event) => setDraft((prev) => ({ ...prev, unit: event.target.value }))}
                placeholder="Unit (USD, Users, etc.)"
                style={inputStyle}
              />
              <input
                value={draft.category}
                onChange={(event) => setDraft((prev) => ({ ...prev, category: event.target.value }))}
                placeholder="Category (Growth, Revenue)"
                style={inputStyle}
              />
            </div>
            <textarea
              value={draft.description}
              onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Short description for teammates"
              rows={3}
              style={{
                ...inputStyle,
                resize: 'vertical'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={isSubmittingMetadata}
                style={{
                  padding: '12px 24px',
                  borderRadius: 12,
                  border: 'none',
                  background: '#facc15',
                  color: '#111',
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: isSubmittingMetadata ? 0.7 : 1
                }}
              >
                {isSubmittingMetadata ? 'Saving…' : 'Save Metadata'}
              </button>
            </div>
          </form>
        </section>

        {/* Admin Management Section */}
        {isAdmin && (
          <section className="card" style={{ display: 'grid', gap: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, color: '#fde68a' }}>Admin Management</h2>
              <button
                type="button"
                onClick={loadAdminList}
                disabled={loadingAdmins || !walletConnected}
                style={{
                  padding: '6px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(250, 204, 21, 0.3)',
                  background: 'transparent',
                  color: '#fde68a',
                  cursor: walletConnected ? 'pointer' : 'not-allowed',
                  opacity: loadingAdmins ? 0.6 : 1,
                  fontSize: '0.85rem'
                }}
              >
                {loadingAdmins ? 'Loading…' : 'Refresh Admins'}
              </button>
            </div>

            {/* Add Admin Form */}
            <div style={{ padding: '12px', border: '1px solid rgba(250, 204, 21, 0.15)', borderRadius: 10 }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: '#fde68a' }}>Add New Admin</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={newAdminAddress}
                  onChange={(e) => setNewAdminAddress(e.target.value)}
                  placeholder="0x... admin address"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(250, 204, 21, 0.2)',
                    background: '#18181b',
                    color: '#f4f4f5',
                    fontSize: '0.85rem'
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddAdmin}
                  disabled={addingAdmin || !walletConnected}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#4ade80',
                    color: '#111',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: walletConnected ? 'pointer' : 'not-allowed',
                    opacity: addingAdmin ? 0.6 : 1
                  }}
                >
                  {addingAdmin ? 'Adding…' : 'Add Admin'}
                </button>
              </div>
            </div>

            {/* Admin List */}
            <div>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: '#fde68a' }}>Current Admins</h3>
              {adminList.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: '#a1a1aa', margin: 0 }}>
                  {loadingAdmins ? 'Loading admins…' : 'No admins found. The deployer is the initial admin.'}
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {adminList.map((admin) => {
                    const isRemoving = removingAdmin[admin];
                    const isCurrentUser = admin.toLowerCase() === (walletAddress || '').toLowerCase();
                    return (
                      <div
                        key={admin}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 12px',
                          borderRadius: 8,
                          background: isCurrentUser
                            ? 'rgba(250, 204, 21, 0.1)'
                            : 'rgba(250, 204, 21, 0.05)',
                          border: `1px solid ${isCurrentUser ? 'rgba(250, 204, 21, 0.3)' : 'rgba(250, 204, 21, 0.1)'}`
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '0.85rem', color: '#e4e4e7', fontFamily: 'monospace' }}>
                            {shortenAddress(admin)}
                          </span>
                          {isCurrentUser && (
                            <span
                              style={{
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: 'rgba(250, 204, 21, 0.2)',
                                color: '#facc15',
                                fontSize: '0.7rem',
                                fontWeight: 600
                              }}
                            >
                              You
                            </span>
                          )}
                        </div>
                        {!isCurrentUser && (
                          <button
                            type="button"
                            onClick={() => handleRemoveAdmin(admin)}
                            disabled={isRemoving || !walletConnected}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 6,
                              border: '1px solid rgba(248, 113, 113, 0.4)',
                              background: 'transparent',
                              color: '#f87171',
                              fontSize: '0.75rem',
                              cursor: walletConnected ? 'pointer' : 'not-allowed',
                              opacity: isRemoving ? 0.6 : 1
                            }}
                          >
                            {isRemoving ? 'Removing…' : 'Remove'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        <section className="card" style={{ display: 'grid', gap: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, color: '#fde68a' }}>Encrypted KPI Entries</h2>
            <span style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>
              {walletConnected ? 'Wallet ready for submissions' : 'Connect wallet to submit encrypted KPIs'}
            </span>
          </div>

          <form onSubmit={handleRecordMetric} style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <input
                value={recordDraft.metricId}
                onChange={(event) => setRecordDraft((prev) => ({ ...prev, metricId: event.target.value }))}
                placeholder="Metric ID (e.g., mrr)"
                style={inputStyle}
              />
              <input
                value={recordDraft.value}
                onChange={(event) => setRecordDraft((prev) => ({ ...prev, value: event.target.value }))}
                placeholder="Value (e.g., 12450.23)"
                style={inputStyle}
              />
              <input
                value={recordDraft.note}
                onChange={(event) => {
                  const value = event.target.value;
                  // Allow up to 8 characters (fits safely in uint64 payload)
                  if (value.length <= 8) {
                    setRecordDraft((prev) => ({ ...prev, note: value }));
                  }
                }}
                placeholder="Optional note (max 8 chars)"
                maxLength={8}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={isRecordingMetric || !walletConnected}
                style={{
                  padding: '10px 20px',
                  borderRadius: 12,
                  border: 'none',
                  background: walletConnected ? '#4ade80' : '#3f3f46',
                  color: walletConnected ? '#111' : '#a1a1aa',
                  fontWeight: 600,
                  cursor: walletConnected ? 'pointer' : 'not-allowed',
                  opacity: isRecordingMetric ? 0.75 : 1
                }}
              >
                {isRecordingMetric ? 'Encrypting…' : 'Encrypt & Submit'}
              </button>
            </div>
          </form>

          <div>
            <h3 style={{ marginTop: 0, color: '#fef3c7' }}>Metric Streams</h3>
            {orderedMetadata.length === 0 ? (
              <p style={{ color: '#a1a1aa' }}>
                Define your KPI streams above, then record encrypted values and decrypt on demand.
              </p>
            ) : (
              <div className="metric-grid">
                {orderedMetadata.map((metric) => {
                  const metricKey = String(metric.metricId);
                  const entries = metricsById[metricKey] || [];
                  const isBusy = loadingMetricId === metricKey;
                  return (
                    <article className="metric-card" key={metricKey}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0 }}>{metric.label || metricKey}</h3>
                        <button
                          type="button"
                          onClick={() => loadMetrics(metricKey)}
                          disabled={isBusy || !walletConnected}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 10,
                            border: '1px solid rgba(250, 204, 21, 0.3)',
                            background: 'transparent',
                            color: '#fde68a',
                            cursor: walletConnected ? 'pointer' : 'not-allowed',
                            opacity: isBusy ? 0.6 : 1
                          }}
                        >
                          {isBusy ? 'Loading…' : 'Refresh entries'}
                        </button>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>
                        Unit: {metric.unit || 'n/a'} · Category: {metric.category || 'n/a'}
                      </p>

                      {/* Analytics Summary - Cumulative Totals Dashboard */}
                      {(() => {
                        const decryptedEntries = entries.filter((e) => e.decryptedValue !== undefined);
                        if (decryptedEntries.length === 0) return null;

                        // Sort entries by timestamp (oldest first) for cumulative calculation
                        const sortedEntries = [...decryptedEntries].sort((a, b) => a.timestamp - b.timestamp);
                        
                        // Calculate cumulative totals (running sum) as entries are decrypted
                        let runningTotal = 0;
                        const entriesWithCumulative = sortedEntries.map((entry) => {
                          runningTotal += entry.decryptedValue!;
                          return {
                            ...entry,
                            cumulativeTotal: runningTotal,
                            individualValue: entry.decryptedValue!
                          };
                        });

                        const values = sortedEntries.map((e) => e.decryptedValue!);
                        const cumulativeValues = entriesWithCumulative.map((e) => e.cumulativeTotal);
                        const latest = values[values.length - 1];
                        const latestCumulative = cumulativeValues[cumulativeValues.length - 1]; // This is the total
                        const first = values[0];
                        const previous = values.length > 1 ? values[values.length - 2] : latest;
                        const change = latest - previous;
                        const changePercent = previous !== 0 ? (change / previous) * 100 : 0;
                        const average = values.reduce((sum, v) => sum + v, 0) / values.length;

                        return (
                          <div
                            style={{
                              marginTop: 12,
                              padding: '16px',
                              border: '1px solid rgba(250, 204, 21, 0.15)',
                              borderRadius: 10,
                              background: 'rgba(250, 204, 21, 0.03)',
                              overflow: 'hidden',
                              width: '100%',
                              maxWidth: '100%',
                              boxSizing: 'border-box',
                              display: 'flex',
                              flexDirection: 'column'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                              <h4 style={{ margin: 0, fontSize: '1.2rem', color: '#fde68a', fontWeight: 600 }}>📊 Time-Series Dashboard</h4>
                              {cumulativeValues.length > 1 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <Sparkline data={cumulativeValues} width={80} height={24} />
                                </div>
                              )}
                            </div>

                            {/* Key Metrics Summary - Cumulative Total is the main focus */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
                              <div style={{ 
                                gridColumn: values.length > 1 ? 'span 2' : 'span 1',
                                padding: '14px',
                                borderRadius: 8,
                                background: 'rgba(250, 204, 21, 0.1)',
                                border: '2px solid rgba(250, 204, 21, 0.3)'
                              }}>
                                <div style={{ fontSize: '0.9rem', color: '#fde68a', marginBottom: 8, fontWeight: 500 }}>📈 Cumulative Total</div>
                                <div style={{ fontSize: '2rem', color: '#fef3c7', fontWeight: 700 }}>
                                  {latestCumulative.toLocaleString(undefined, { maximumFractionDigits: 2 })} {metric.unit || ''}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: 6 }}>
                                  {sortedEntries.length} {sortedEntries.length === 1 ? 'entry' : 'entries'} decrypted
                                </div>
                              </div>
                              {values.length > 1 && (
                                <>
                                  <div>
                                    <div style={{ fontSize: '0.85rem', color: '#a1a1aa', marginBottom: 6 }}>Latest Entry</div>
                                    <div style={{ fontSize: '1.4rem', color: '#fef3c7', fontWeight: 600 }}>
                                      {latest.toLocaleString(undefined, { maximumFractionDigits: 2 })} {metric.unit || ''}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '0.85rem', color: '#a1a1aa', marginBottom: 6 }}>Average per Entry</div>
                                    <div style={{ fontSize: '1.4rem', color: '#fef3c7', fontWeight: 600 }}>
                                      {average.toLocaleString(undefined, { maximumFractionDigits: 2 })} {metric.unit || ''}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '0.85rem', color: '#a1a1aa', marginBottom: 6 }}>Latest Change</div>
                                    <div
                                      style={{
                                        fontSize: '1.4rem',
                                        color: change >= 0 ? '#4ade80' : '#f87171',
                                        fontWeight: 600
                                      }}
                                    >
                                      {change >= 0 ? '↑' : '↓'} {Math.abs(changePercent).toFixed(1)}%
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Full Time-Series Chart */}
                            {decryptedEntries.length > 1 && (
                              <div style={{ 
                                marginTop: 8,
                                marginBottom: 16,
                                width: '100%',
                                maxWidth: '100%',
                                overflow: 'hidden',
                                borderRadius: 8,
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                boxSizing: 'border-box',
                                padding: '8px',
                                background: 'rgba(0, 0, 0, 0.2)'
                              }}>
                                <div style={{ 
                                  width: '100%', 
                                  maxWidth: '100%', 
                                  overflow: 'hidden',
                                  boxSizing: 'border-box',
                                  display: 'flex',
                                  justifyContent: 'center'
                                }}>
                                  <KpiChart
                                    data={entriesWithCumulative.map((e) => ({
                                      timestamp: e.timestamp,
                                      value: e.cumulativeTotal // Show cumulative totals in chart
                                    }))}
                                    unit={metric.unit || ''}
                                    width={Math.min(600, typeof window !== 'undefined' ? window.innerWidth - 100 : 500)}
                                    height={180}
                                  />
                                </div>
                              </div>
                            )}

                            {/* All Entries Table - Shows Individual + Cumulative */}
                            {sortedEntries.length > 0 && (
                              <div style={{ marginTop: 8, marginBottom: 16 }}>
                                <div style={{ fontSize: '1rem', color: '#a1a1aa', marginBottom: 10, fontWeight: 500 }}>
                                  All Entries Over Time ({sortedEntries.length} {sortedEntries.length === 1 ? 'entry' : 'entries'}) - Cumulative Totals
                                </div>
                                <div style={{ 
                                  display: 'grid', 
                                  gap: 10,
                                  maxHeight: '300px',
                                  overflowY: 'auto',
                                  paddingRight: 4
                                }}>
                                  {entriesWithCumulative.map((entry, idx) => {
                                    const entryValue = entry.individualValue;
                                    const cumulativeValue = entry.cumulativeTotal;
                                    const date = new Date(entry.timestamp * 1000);
                                    const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                                    
                                    return (
                                      <div
                                        key={`dashboard-${entry.index}`}
                                        style={{
                                          display: 'grid',
                                          gridTemplateColumns: 'auto 1fr auto auto',
                                          gap: 12,
                                          alignItems: 'center',
                                          padding: '12px 14px',
                                          borderRadius: 8,
                                          background: idx % 2 === 0 ? 'rgba(250, 204, 21, 0.02)' : 'transparent',
                                          border: '1px solid rgba(250, 204, 21, 0.08)'
                                        }}
                                      >
                                        <div style={{ fontSize: '0.9rem', color: '#a1a1aa', minWidth: '90px' }}>
                                          {monthName}
                                        </div>
                                        <div style={{ fontSize: '1rem', color: '#e4e4e7', fontWeight: 500 }}>
                                          Entry #{entry.index + 1}
                                        </div>
                                        <div style={{ fontSize: '1rem', color: '#a1a1aa', textAlign: 'right' }}>
                                          +{entryValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} {metric.unit || ''}
                                        </div>
                                        <div style={{ fontSize: '1.15rem', color: '#fef3c7', fontWeight: 700, textAlign: 'right', minWidth: '120px' }}>
                                          = {cumulativeValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} {metric.unit || ''}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Access Management Section - Now inside Analytics */}
                            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(250, 204, 21, 0.1)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#fde68a' }}>Access Control</h4>
                                <button
                                  type="button"
                                  onClick={() => loadViewers(metricKey)}
                                  disabled={loadingViewers[metricKey] || !walletConnected}
                                  style={{
                                    padding: '4px 10px',
                                    borderRadius: 8,
                                    border: '1px solid rgba(250, 204, 21, 0.3)',
                                    background: 'transparent',
                                    color: '#fde68a',
                                    fontSize: '0.8rem',
                                    cursor: walletConnected ? 'pointer' : 'not-allowed',
                                    opacity: loadingViewers[metricKey] ? 0.6 : 1
                                  }}
                                >
                                  {loadingViewers[metricKey] ? 'Loading…' : 'Refresh viewers'}
                                </button>
                              </div>

                              {/* Grant Access Form */}
                              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                <input
                                  type="text"
                                  value={newViewerAddress[metricKey] || ''}
                                  onChange={(e) => setNewViewerAddress((prev) => ({ ...prev, [metricKey]: e.target.value }))}
                                  placeholder="0x... viewer address"
                                  style={{
                                    flex: 1,
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    border: '1px solid rgba(250, 204, 21, 0.2)',
                                    background: '#18181b',
                                    color: '#f4f4f5',
                                    fontSize: '0.85rem'
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleGrantAccess(metricKey)}
                                  disabled={grantingAccess[metricKey] || !walletConnected}
                                  style={{
                                    padding: '8px 16px',
                                    borderRadius: 8,
                                    border: 'none',
                                    background: '#4ade80',
                                    color: '#111',
                                    fontWeight: 600,
                                    fontSize: '0.85rem',
                                    cursor: walletConnected ? 'pointer' : 'not-allowed',
                                    opacity: grantingAccess[metricKey] ? 0.6 : 1
                                  }}
                                >
                                  {grantingAccess[metricKey] ? 'Granting…' : 'Grant Access'}
                                </button>
                              </div>

                              {/* Authorized Viewers List */}
                              <div style={{ marginTop: 12 }}>
                                {viewersByMetric[metricKey] && viewersByMetric[metricKey].length > 0 ? (
                                  <div style={{ display: 'grid', gap: 8 }}>
                                    {viewersByMetric[metricKey].map((viewer) => {
                                      const revokeKey = `${metricKey}:${viewer}`;
                                      const isRevoking = revokingAccess[revokeKey];
                                      return (
                                        <div
                                          key={viewer}
                                          style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '8px 12px',
                                            borderRadius: 8,
                                            background: 'rgba(250, 204, 21, 0.05)',
                                            border: '1px solid rgba(250, 204, 21, 0.1)'
                                          }}
                                        >
                                          <span style={{ fontSize: '0.85rem', color: '#e4e4e7', fontFamily: 'monospace' }}>
                                            {shortenAddress(viewer)}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => handleRevokeAccess(metricKey, viewer)}
                                            disabled={isRevoking || !walletConnected}
                                            style={{
                                              padding: '4px 10px',
                                              borderRadius: 6,
                                              border: '1px solid rgba(248, 113, 113, 0.4)',
                                              background: 'transparent',
                                              color: '#f87171',
                                              fontSize: '0.75rem',
                                              cursor: walletConnected ? 'pointer' : 'not-allowed',
                                              opacity: isRevoking ? 0.6 : 1
                                            }}
                                          >
                                            {isRevoking ? 'Revoking…' : 'Revoke'}
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p style={{ fontSize: '0.8rem', color: '#a1a1aa', margin: 0 }}>
                                    No authorized viewers yet. Grant access to share this metric.
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Access Management Section - Only show if no Analytics (no decrypted entries) */}
                      {(() => {
                        const decryptedEntries = entries.filter((e) => e.decryptedValue !== undefined);
                        if (decryptedEntries.length > 0) return null; // Already shown inside Analytics
                        
                        return (
                          <div style={{ marginTop: 16, padding: '12px', border: '1px solid rgba(250, 204, 21, 0.15)', borderRadius: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                              <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#fde68a' }}>Access Control</h4>
                              <button
                                type="button"
                                onClick={() => loadViewers(metricKey)}
                                disabled={loadingViewers[metricKey] || !walletConnected}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 8,
                                  border: '1px solid rgba(250, 204, 21, 0.3)',
                                  background: 'transparent',
                                  color: '#fde68a',
                                  fontSize: '0.8rem',
                                  cursor: walletConnected ? 'pointer' : 'not-allowed',
                                  opacity: loadingViewers[metricKey] ? 0.6 : 1
                                }}
                              >
                                {loadingViewers[metricKey] ? 'Loading…' : 'Refresh viewers'}
                              </button>
                            </div>

                            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                              <input
                                type="text"
                                value={newViewerAddress[metricKey] || ''}
                                onChange={(e) => setNewViewerAddress((prev) => ({ ...prev, [metricKey]: e.target.value }))}
                                placeholder="0x... viewer address"
                                style={{
                                  flex: 1,
                                  padding: '8px 12px',
                                  borderRadius: 8,
                                  border: '1px solid rgba(250, 204, 21, 0.2)',
                                  background: '#18181b',
                                  color: '#f4f4f5',
                                  fontSize: '0.85rem'
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => handleGrantAccess(metricKey)}
                                disabled={grantingAccess[metricKey] || !walletConnected}
                                style={{
                                  padding: '8px 16px',
                                  borderRadius: 8,
                                  border: 'none',
                                  background: '#4ade80',
                                  color: '#111',
                                  fontWeight: 600,
                                  fontSize: '0.85rem',
                                  cursor: walletConnected ? 'pointer' : 'not-allowed',
                                  opacity: grantingAccess[metricKey] ? 0.6 : 1
                                }}
                              >
                                {grantingAccess[metricKey] ? 'Granting…' : 'Grant Access'}
                              </button>
                            </div>

                            <div style={{ marginTop: 12 }}>
                              {viewersByMetric[metricKey] && viewersByMetric[metricKey].length > 0 ? (
                                <div style={{ display: 'grid', gap: 8 }}>
                                  {viewersByMetric[metricKey].map((viewer) => {
                                    const revokeKey = `${metricKey}:${viewer}`;
                                    const isRevoking = revokingAccess[revokeKey];
                                    return (
                                      <div
                                        key={viewer}
                                        style={{
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          alignItems: 'center',
                                          padding: '8px 12px',
                                          borderRadius: 8,
                                          background: 'rgba(250, 204, 21, 0.05)',
                                          border: '1px solid rgba(250, 204, 21, 0.1)'
                                        }}
                                      >
                                        <span style={{ fontSize: '0.85rem', color: '#e4e4e7', fontFamily: 'monospace' }}>
                                          {shortenAddress(viewer)}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleRevokeAccess(metricKey, viewer)}
                                          disabled={isRevoking || !walletConnected}
                                          style={{
                                            padding: '4px 10px',
                                            borderRadius: 6,
                                            border: '1px solid rgba(248, 113, 113, 0.4)',
                                            background: 'transparent',
                                            color: '#f87171',
                                            fontSize: '0.75rem',
                                            cursor: walletConnected ? 'pointer' : 'not-allowed',
                                            opacity: isRevoking ? 0.6 : 1
                                          }}
                                        >
                                          {isRevoking ? 'Revoking…' : 'Revoke'}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p style={{ fontSize: '0.8rem', color: '#a1a1aa', margin: 0 }}>
                                  No authorized viewers yet. Grant access to share this metric.
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                          {/* Entries Section */}
                      <div style={{ marginTop: 16 }}>
                        <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: '#fde68a' }}>Entries</h4>
                        {entries.length === 0 ? (
                          <p style={{ fontSize: '0.85rem', color: '#a1a1aa', margin: 0 }}>
                            No encrypted entries yet. Submit a value above.
                          </p>
                        ) : (
                          <div style={{ display: 'grid', gap: 12 }}>
                            {entries.map((entry) => {
                              const decryptBusy = decryptingKey === `${metric.metricId}:${entry.index}`;
                              const decrypted = entry.decryptedValue !== undefined;
                              return (
                                <div
                                  key={`${metricKey}-${entry.index}`}
                                  style={{
                                    border: '1px solid rgba(250, 204, 21, 0.08)',
                                    borderRadius: 12,
                                    padding: '12px'
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ color: '#e4e4e7', fontSize: '0.95rem' }}>
                                      Entry #{entry.index + 1}{' '}
                                      <span style={{ color: '#a1a1aa', fontSize: '0.8rem' }}>
                                        ({formatTimestamp(entry.timestamp)})
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleDecryptMetric(metricKey, entry)}
                                      disabled={!walletConnected || decryptBusy}
                                      style={{
                                        padding: '6px 12px',
                                        borderRadius: 8,
                                        border: 'none',
                                        background: '#facc15',
                                        color: '#111',
                                        fontWeight: 600,
                                        cursor: walletConnected ? 'pointer' : 'not-allowed',
                                        opacity: decryptBusy ? 0.6 : 1
                                      }}
                                    >
                                      {decryptBusy ? 'Decrypting…' : decrypted ? 'Refresh' : 'Decrypt'}
                                    </button>
                                  </div>
                                  <div style={{ marginTop: 8 }}>
                                    <div style={{ color: '#fef3c7', fontSize: '1.1rem' }}>
                                      {decrypted ? `${entry.decryptedValue?.toLocaleString()} ${metric.unit || ''}` : '🔒 Encrypted'}
                                    </div>
                                    {entry.decryptedNote && (
                                      <div style={{ marginTop: 6, color: '#a1a1aa', fontSize: '0.9rem' }}>
                                        Note: {entry.decryptedNote}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, color: '#fde68a' }}>Metadata Overview</h2>
            <span style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>
              {orderedMetadata.length === 0 ? 'No metrics yet' : `${orderedMetadata.length} configured`}
            </span>
          </div>

          {isLoadingMetadata ? (
            <div className="metric-grid" style={{ marginTop: 24 }}>
              {Array.from({ length: 3 }).map((_, index) => (
                <div className="skeleton" key={index} />
              ))}
            </div>
          ) : orderedMetadata.length === 0 ? (
            <p style={{ marginTop: 18, color: '#a1a1aa' }}>
              Configure a metric to see it listed here. Each stream can have encrypted KPI entries stored on-chain.
            </p>
          ) : (
            <div className="metric-grid">
              {orderedMetadata.map((metric) => {
                const metricKey = String(metric.metricId);
                return (
                  <article className="metric-card" key={metricKey}>
                    <h3>{metric.label || metricKey}</h3>
                  <p>
                      <strong>Metric ID:</strong> {metricKey}
                  </p>
                  {metric.unit && (
                    <p>
                      <strong>Unit:</strong> {metric.unit}
                    </p>
                  )}
                  {metric.category && (
                    <p>
                      <strong>Category:</strong> {metric.category}
                    </p>
                  )}
                  {metric.description && (
                    <p style={{ color: '#f4f4f5' }}>{metric.description}</p>
                  )}
                  <footer style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <small style={{ color: '#71717a' }}>
                      Updated {metric.updatedAt ? new Date(metric.updatedAt).toLocaleString() : 'recently'}
                    </small>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => loadMetrics(metricKey)}
                        disabled={loadingMetricId === metricKey || !walletConnected}
                        style={{
                          background: 'transparent',
                          border: '1px solid rgba(250, 204, 21, 0.3)',
                          color: '#fde68a',
                          borderRadius: 10,
                          padding: '6px 12px',
                          cursor: walletConnected ? 'pointer' : 'not-allowed',
                          opacity: loadingMetricId === metricKey ? 0.6 : 1
                        }}
                      >
                        {loadingMetricId === metricKey ? 'Loading…' : 'Load entries'}
                      </button>
                      <button
                        onClick={() => handleRemoveMetadata(metricKey)}
                        disabled={isSubmittingMetadata}
                        style={{
                          background: 'transparent',
                          border: '1px solid rgba(248, 113, 113, 0.4)',
                          color: '#f87171',
                          borderRadius: 10,
                          padding: '6px 12px',
                          cursor: 'pointer'
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </footer>
                </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid rgba(250, 204, 21, 0.2)',
  background: '#18181b',
  color: '#f4f4f5'
};

export default App;

