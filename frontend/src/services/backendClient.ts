import { ethers } from 'ethers';
import {
  deriveEncryptionKey,
  encryptTaskData,
  decryptTaskData,
  clearEncryptionKeyCache
} from '../utils/clientEncryption';
import { simpleWalletService } from './simpleWalletService';
import { isDevMode } from '../utils/devMode';

// Encryption key management
let encryptionKey: CryptoKey | null = null;
let keyDerivationInProgress: Promise<CryptoKey> | null = null;

async function getEncryptionKey(): Promise<CryptoKey | null> {
  if (encryptionKey) return encryptionKey;
  if (keyDerivationInProgress) return keyDerivationInProgress;

  const signer = simpleWalletService.getSigner();
  if (!signer) {
    if (isDevMode()) console.warn('[KPI Vault] No signer available for encryption');
    return null;
  }

  try {
    keyDerivationInProgress = deriveEncryptionKey(signer as ethers.Signer);
    encryptionKey = await keyDerivationInProgress;
    keyDerivationInProgress = null;
    if (isDevMode()) console.log('[KPI Vault] 🔐 Encryption key derived');
    return encryptionKey;
  } catch (error) {
    keyDerivationInProgress = null;
    console.error('[KPI Vault] Failed to derive encryption key:', error);
    return null;
  }
}

export function clearKpiEncryptionKey(): void {
  encryptionKey = null;
  keyDerivationInProgress = null;
  clearEncryptionKeyCache();
}

// Encrypt sensitive metadata fields
async function encryptMetadata(metadata: MetricMetadata): Promise<any> {
  const key = await getEncryptionKey();
  if (!key) return metadata; // Fallback to plaintext if no key

  try {
    const sensitiveData = {
      title: metadata.label,
      description: metadata.description,
      dueDate: metadata.category,
      priority: 0, // Required by encryption function
      unit: metadata.unit,
      metricId: metadata.metricId
    };
    const encrypted = await encryptTaskData(sensitiveData, key);
    return {
      metricId: metadata.metricId,
      encrypted: true,
      data: encrypted,
      updatedAt: metadata.updatedAt
    };
  } catch (error) {
    console.error('[KPI Vault] Encryption failed:', error);
    return metadata;
  }
}

// Decrypt sensitive metadata fields
async function decryptMetadata(data: any): Promise<MetricMetadata> {
  if (!data?.encrypted || !data?.data) return data;

  const key = await getEncryptionKey();
  if (!key) return data;

  try {
    const decrypted = await decryptTaskData(data.data, key);
    if (decrypted) {
      return {
        metricId: data.metricId,
        label: decrypted.title || '',
        description: decrypted.description || '',
        category: decrypted.dueDate || '',
        unit: (decrypted as any).unit || '',
        updatedAt: data.updatedAt
      };
    }
  } catch (error) {
    if (isDevMode()) console.warn('[KPI Vault] Decryption failed:', error);
  }
  return data;
}

// Auto-detect backend URL based on current hostname
const getBackendUrl = () => {
  // PRIORITY 1: If running on production domain via Cloudflare Tunnel, ALWAYS use HTTPS tunnel URL
  // This overrides any env var to prevent mixed content errors
  if (typeof window !== 'undefined' && window.location.hostname === 'kpi-vault.zamataskhub.com') {
    return 'https://kpi-api.zamataskhub.com';
  }
  
  // PRIORITY 2: If explicitly set via env var, use it (but only for local/dev)
  if (import.meta.env.VITE_KPI_BACKEND_URL) {
    return import.meta.env.VITE_KPI_BACKEND_URL.replace(/\/$/, '');
  }
  
  // PRIORITY 3: Default to localhost for local development
  return 'http://localhost:3101';
};

// Don't set API_BASE at module load - compute it dynamically per request
// This ensures we always use the correct URL based on current hostname
const getApiBase = () => getBackendUrl();

export type MetricMetadata = {
  metricId: number | string;
  label: string;
  unit: string;
  category: string;
  description: string;
  updatedAt?: string;
};

export type FeedbackEntry = {
  id: string;
  owner: string;
  metricId: string;
  entryIndex: string;
  viewer: string;
  ciphertext: string;
  commitment: string;
  noteMetadata?: Record<string, unknown>;
  attachments?: unknown[];
  status: 'active' | 'deleted';
  submittedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  deletedBy?: string;
};

export type AlertRule = {
  id: string;
  owner: string;
  metricId: string;
  name: string;
  ruleType: string;
  config: Record<string, unknown>;
  encryptedConfig?: unknown;
  commitment: string;
  channels: string[];
  status: string;
  createdAt?: string;
  updatedAt?: string;
  lastTriggeredAt?: string | null;
};

export type Shareboard = {
  id: string;
  owner: string;
  title: string;
  description: string;
  metricIds: string[];
  includeHistoryWindow: number | null;
  snapshotStrategy: string;
  access: {
    mode: string;
    token: string | null;
    allowedWallets: string[];
    invitees: string[];
  };
  snapshotEntries: unknown[];
  metadata: Record<string, unknown>;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  revokedAt?: string;
};

const toJson = async (response: Response) => {
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error || `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return response.json();
};

const jsonFetch = async (path: string, init?: RequestInit) => {
  const resp = await fetch(`${getApiBase()}${path}`, init);
  return toJson(resp);
};

// Helper to build headers with wallet address for authenticated requests
const buildHeaders = (walletAddress?: string): HeadersInit => {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (walletAddress) {
    headers['x-wallet-address'] = walletAddress.toLowerCase();
  }
  return headers;
};

export const backendClient = {
  /* Metadata */
  async getMetadata(ownerAddress: string): Promise<Record<string, MetricMetadata>> {
    const rawData = await jsonFetch(`/metrics/meta/${ownerAddress}`);

    // Decrypt each metric's metadata
    const decrypted: Record<string, MetricMetadata> = {};
    for (const [key, value] of Object.entries(rawData)) {
      decrypted[key] = await decryptMetadata(value);
    }
    return decrypted;
  },

  async saveMetadata(ownerAddress: string, metadata: MetricMetadata, walletAddress?: string) {
    // Encrypt metadata before sending
    const encryptedData = await encryptMetadata(metadata);

    return jsonFetch(`/metrics/meta/${ownerAddress}`, {
      method: 'POST',
      headers: buildHeaders(walletAddress),
      body: JSON.stringify(encryptedData)
    });
  },

  async deleteMetadata(ownerAddress: string, metricId: number | string, walletAddress?: string) {
    return jsonFetch(`/metrics/meta/${ownerAddress}/${metricId}`, {
      method: 'DELETE',
      headers: buildHeaders(walletAddress)
    });
  },

  /* Investor Feedback */
  async getAllFeedback(ownerAddress: string, includeDeleted = false) {
    const query = includeDeleted ? '?includeDeleted=true' : '';
    return jsonFetch(`/feedback/${ownerAddress}${query}`);
  },

  async getFeedback(ownerAddress: string, metricId: string, entryIndex: string, includeDeleted = false) {
    const query = includeDeleted ? '?includeDeleted=true' : '';
    return jsonFetch(`/feedback/${ownerAddress}/${metricId}/${entryIndex}${query}`);
  },

  async createFeedback(payload: {
    ownerAddress: string;
    metricId: string;
    entryIndex: string;
    viewerAddress: string;
    ciphertext: string;
    commitment: string;
    noteMetadata?: Record<string, unknown>;
    attachments?: unknown[];
    timestamp?: string;
  }) {
    return jsonFetch('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },

  async updateFeedback(feedbackId: string, payload: Record<string, unknown>) {
    return jsonFetch(`/feedback/${feedbackId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },

  async deleteFeedback(feedbackId: string, payload: Record<string, unknown>) {
    return jsonFetch(`/feedback/${feedbackId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },

  /* Alerts */
  async createAlert(payload: Record<string, unknown>) {
    return jsonFetch('/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },

  async listAlerts(ownerAddress: string): Promise<{ alerts: AlertRule[] }> {
    return jsonFetch(`/alerts/${ownerAddress}`);
  },

  async updateAlert(alertId: string, payload: Record<string, unknown>) {
    return jsonFetch(`/alerts/${alertId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },

  async deleteAlert(alertId: string, payload: Record<string, unknown>) {
    return jsonFetch(`/alerts/${alertId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },

  async subscribeToAlert(alertId: string, payload: Record<string, unknown>) {
    return jsonFetch(`/alerts/${alertId}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },

  async unsubscribeFromAlert(alertId: string, payload: Record<string, unknown>) {
    return jsonFetch(`/alerts/${alertId}/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },

  async listAlertTriggers(alertId: string) {
    return jsonFetch(`/alerts/${alertId}/triggers`);
  },

  /* Shareboards */
  async createShareboard(payload: Record<string, unknown>) {
    return jsonFetch('/shareboards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },

  async listShareboards(ownerAddress: string): Promise<{ shareboards: Shareboard[] }> {
    return jsonFetch(`/shareboards/${ownerAddress}`);
  },

  async updateShareboard(shareboardId: string, payload: Record<string, unknown>) {
    return jsonFetch(`/shareboards/${shareboardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },

  async deleteShareboard(shareboardId: string, payload: Record<string, unknown>) {
    return jsonFetch(`/shareboards/${shareboardId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },

  async viewShareboard(shareboardId: string, token?: string) {
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    return jsonFetch(`/shareboards/view/${shareboardId}${query}`);
  }
};

