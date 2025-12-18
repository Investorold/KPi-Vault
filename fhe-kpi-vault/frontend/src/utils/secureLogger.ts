/**
 * Production-Safe Logger
 * 
 * In production:
 * - NO debug/info logs (console.log, console.debug, console.trace)
 * - Only user-actionable warnings
 * - Sanitized error messages (no sensitive data, no stack traces)
 * - No cryptographic material (handles, ciphertexts, signatures, addresses)
 * 
 * In development:
 * - Full logging with sanitization
 */

const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';
const isProduction = !isDevelopment;

/**
 * Sanitizes sensitive data from objects
 * In production, completely removes sensitive fields
 */
const sanitize = (data: any): any => {
  if (!data || typeof data !== 'object') {
    // If it's a string, check if it contains sensitive patterns
    if (typeof data === 'string') {
      // Remove addresses, handles, hashes
      if (/0x[a-fA-F0-9]{40}/.test(data) || /0x[a-fA-F0-9]{64}/.test(data)) {
        return '[REDACTED]';
      }
      return data;
    }
    return data;
  }

  const sensitiveKeys = [
    'ownerAddress', 'viewerAddress', 'signerAddress', 'walletAddress',
    'wallet address', 'address', 'addresses',
    'valueHandle', 'noteHandle', 'handle', 'handles',
    'ciphertext', 'encrypted', 'encryptedValue', 'encryptedNote',
    'privateKey', 'publicKey', 'signature', 'signatures',
    'txHash', 'transactionHash', 'hash',
    'metricId', 'metric ID', 'entryIndex',
    'pairs', 'decryptedValue', 'decryptedNote',
    'value', 'note', 'numericValue',
    'relayerUrl', 'gatewayUrl', 'chainId',
    'contractAddress', 'abi',
    'response', 'data', 'body', 'result',
    'encryptedInput', 'userDecrypt', 'attestation',
    'eip712', 'payload', 'message'
  ];

  const sanitized: any = Array.isArray(data) ? [] : {};

  for (const key in data) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(sk => 
      lowerKey.includes(sk.toLowerCase())
    );

    if (isSensitive) {
      // In production, completely remove sensitive data
      if (isProduction) {
        continue; // Skip this field entirely
      } else {
        // In development, show partial data
        const value = data[key];
        if (typeof value === 'string' && value.length > 10) {
          sanitized[key] = `${value.substring(0, 6)}...${value.substring(value.length - 4)}`;
        } else {
          sanitized[key] = '[REDACTED]';
        }
      }
    } else if (typeof data[key] === 'object' && data[key] !== null) {
      sanitized[key] = sanitize(data[key]);
    } else {
      sanitized[key] = data[key];
    }
  }

  return sanitized;
};

/**
 * Sanitize error objects - remove stack traces and sensitive data in production
 */
const sanitizeError = (error: any): any => {
  if (!error) return error;
  
  if (isProduction) {
    // In production, only return safe error message
    return {
      message: error.message || String(error),
      // Remove stack, response data, and all sensitive fields
    };
  }
  
  // In development, sanitize but keep structure
  const sanitized: any = {
    message: error.message || String(error),
  };
  
  if (error.response) {
    sanitized.status = error.response.status;
    sanitized.statusText = error.response.statusText;
    // Don't include response.data in production
    if (isDevelopment && error.response.data) {
      sanitized.data = sanitize(error.response.data);
    }
  }
  
  return sanitized;
};

/**
 * Production-safe logger
 */
export const secureLogger = {
  /**
   * Debug logs - ONLY in development
   */
  debug: (message: string, data?: any) => {
    if (isDevelopment) {
      console.log(`[KPI Vault] ${message}`, data ? sanitize(data) : '');
    }
  },

  /**
   * Info logs - ONLY in development
   */
  info: (message: string, data?: any) => {
    if (isDevelopment) {
      console.log(`[KPI Vault] ${message}`, data ? sanitize(data) : '');
    }
  },

  /**
   * Success logs - ONLY in development
   */
  success: (message: string, data?: any) => {
    if (isDevelopment) {
      console.log(`[KPI Vault] ✅ ${message}`, data ? sanitize(data) : '');
    }
  },

  /**
   * User-actionable warnings - visible in production but sanitized
   */
  warn: (message: string, data?: any) => {
    // Only show warnings that are user-actionable
    const userActionablePatterns = [
      'wallet not connected',
      'network mismatch',
      'signature rejected',
      'transaction failed',
      'please try again',
      'check your wallet',
      'switch network'
    ];
    
    const isUserActionable = userActionablePatterns.some(pattern => 
      message.toLowerCase().includes(pattern)
    );
    
    if (isProduction && !isUserActionable) {
      // In production, suppress non-user-actionable warnings
      return;
    }
    
    console.warn(`[KPI Vault] ${message}`, data ? sanitize(data) : '');
  },

  /**
   * Errors - visible in production but heavily sanitized
   */
  error: (message: string, error?: any) => {
    // In production, show only short, user-friendly error messages
    if (isProduction) {
      // Map technical errors to user-friendly messages
      const userFriendlyMessage = message
        .replace(/Relayer.*rejected/i, 'Transaction rejected')
        .replace(/Handle.*mismatch/i, 'Session expired')
        .replace(/Access.*denied/i, 'Access denied')
        .replace(/Network.*error/i, 'Network error')
        .replace(/Failed to.*/i, 'Operation failed');
      
      console.error(`[KPI Vault] ${userFriendlyMessage}`);
      return;
    }
    
    // In development, show sanitized error details
    console.error(`[KPI Vault] ${message}`, error ? sanitizeError(error) : '');
  },

  /**
   * User-facing status messages (visible in production)
   * Use for: "App initialized", "Wallet connected", "Transaction submitted"
   */
  status: (message: string) => {
    // Only show high-level status, no data
    if (isDevelopment) {
      console.log(`[KPI Vault] ${message}`);
    }
    // In production, we could optionally show these, but for now keep them dev-only
    // Uncomment if you want status messages in production:
    // secureLogger.debug(`[KPI Vault] ${message}`);
  },
};

export default secureLogger;
