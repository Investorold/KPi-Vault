/**
 * Client-Side Encryption Utility
 *
 * Encrypts task data locally using a key derived from the user's wallet.
 * The backend only stores encrypted blobs - zero knowledge of actual content.
 *
 * Security Model:
 * 1. User signs a deterministic message with their wallet
 * 2. Signature is hashed to create AES-256 encryption key
 * 3. Task data is encrypted with AES-GCM before sending to backend
 * 4. Only the user with the wallet private key can decrypt
 */

import { ethers } from 'ethers';

// Constants
const ENCRYPTION_DOMAIN = 'FHEVM-TaskManager-Encryption-v1';
const KEY_DERIVATION_MESSAGE = `Sign this message to derive your encryption key for ${ENCRYPTION_DOMAIN}.\n\nThis signature will NOT be sent to any server.\nIt is used locally to encrypt/decrypt your task data.`;

// Cache for derived keys (per address, per session)
const keyCache: Map<string, CryptoKey> = new Map();

/**
 * Derives an AES-256-GCM encryption key from the user's wallet signature
 */
export async function deriveEncryptionKey(signer: ethers.Signer): Promise<CryptoKey> {
  const address = await signer.getAddress();
  const cacheKey = address.toLowerCase();

  // Return cached key if available
  if (keyCache.has(cacheKey)) {
    return keyCache.get(cacheKey)!;
  }

  // Sign a deterministic message to derive the key
  // The same wallet will always produce the same signature for the same message
  const signature = await signer.signMessage(KEY_DERIVATION_MESSAGE);

  // Hash the signature to get raw key material (32 bytes for AES-256)
  const keyMaterial = ethers.keccak256(ethers.toUtf8Bytes(signature));
  const keyBytes = ethers.getBytes(keyMaterial);

  // Import as AES-GCM key
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false, // not extractable
    ['encrypt', 'decrypt']
  );

  // Cache the key
  keyCache.set(cacheKey, cryptoKey);

  return cryptoKey;
}

/**
 * Encrypts task data using AES-256-GCM
 * Returns base64-encoded ciphertext with IV prepended
 */
export async function encryptTaskData(
  data: {
    title: string;
    description: string;
    dueDate: string;
    priority: number;
    [key: string]: any;
  },
  encryptionKey: CryptoKey
): Promise<string> {
  // Generate random IV (12 bytes for GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Serialize data to JSON
  const plaintext = JSON.stringify(data);
  const plaintextBytes = new TextEncoder().encode(plaintext);

  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    encryptionKey,
    plaintextBytes
  );

  // Combine IV + ciphertext and encode as base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts task data using AES-256-GCM
 * Expects base64-encoded ciphertext with IV prepended
 */
export async function decryptTaskData(
  encryptedData: string,
  encryptionKey: CryptoKey
): Promise<{
  title: string;
  description: string;
  dueDate: string;
  priority: number;
  [key: string]: any;
} | null> {
  try {
    // Decode base64
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

    // Extract IV (first 12 bytes) and ciphertext
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    // Decrypt
    const plaintextBytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      encryptionKey,
      ciphertext
    );

    // Parse JSON
    const plaintext = new TextDecoder().decode(plaintextBytes);
    return JSON.parse(plaintext);
  } catch (error) {
    console.error('Failed to decrypt task data:', error);
    return null;
  }
}

/**
 * Check if data appears to be encrypted (base64 with expected structure)
 */
export function isEncryptedData(data: any): boolean {
  if (typeof data !== 'string') return false;
  if (data.length < 20) return false; // Too short to be encrypted

  try {
    // Try to decode as base64
    const decoded = atob(data);
    // Should be at least 12 bytes IV + some ciphertext
    return decoded.length >= 16;
  } catch {
    return false;
  }
}

/**
 * Clears the key cache (call on disconnect)
 */
export function clearEncryptionKeyCache(): void {
  keyCache.clear();
}

/**
 * High-level helper: Encrypt task for storage
 */
export async function encryptTaskForStorage(
  signer: ethers.Signer,
  taskData: {
    title: string;
    description: string;
    dueDate: string;
    priority: number;
    stableTaskId?: number;
    blockchainIndex?: number;
    [key: string]: any;
  }
): Promise<{ encrypted: string; address: string }> {
  const key = await deriveEncryptionKey(signer);
  const encrypted = await encryptTaskData(taskData, key);
  const address = await signer.getAddress();

  return { encrypted, address: address.toLowerCase() };
}

/**
 * High-level helper: Decrypt task from storage
 */
export async function decryptTaskFromStorage(
  signer: ethers.Signer,
  encryptedData: string
): Promise<{
  title: string;
  description: string;
  dueDate: string;
  priority: number;
  [key: string]: any;
} | null> {
  const key = await deriveEncryptionKey(signer);
  return decryptTaskData(encryptedData, key);
}
