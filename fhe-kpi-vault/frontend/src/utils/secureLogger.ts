/**
 * Secure Logger - Sanitizes sensitive data before logging
 * Only logs in development mode, sanitizes sensitive fields in production
 */

const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';

/**
 * Sanitizes sensitive data from objects
 */
const sanitize = (data: any): any => {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sensitiveKeys = [
    'ownerAddress',
    'viewerAddress',
    'signerAddress',
    'walletAddress',
    'wallet address',
    'address',
    'valueHandle',
    'noteHandle',
    'handle',
    'handles',
    'ciphertext',
    'encrypted',
    'privateKey',
    'publicKey',
    'signature',
    'txHash',
    'transactionHash',
    'hash',
    'metricId',
    'metric ID',
    'entryIndex',
    'pairs',
    'decryptedValue',
    'decryptedNote',
    'value',
    'note',
    'numericValue',
  ];

  const sanitized: any = Array.isArray(data) ? [] : {};

  for (const key in data) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(sk => 
      lowerKey.includes(sk.toLowerCase())
    );

    if (isSensitive) {
      // In production, replace with placeholder
      if (!isDevelopment) {
        sanitized[key] = '[REDACTED]';
      } else {
        // In development, show partial data
        const value = data[key];
        if (typeof value === 'string' && value.length > 10) {
          sanitized[key] = `${value.substring(0, 6)}...${value.substring(value.length - 4)}`;
        } else {
          sanitized[key] = value;
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
 * Secure logger that only logs in development or sanitizes in production
 */
export const secureLogger = {
  /**
   * Log info messages (only in development)
   */
  info: (message: string, data?: any) => {
    if (isDevelopment) {
      console.log(`[KPI Vault] ${message}`, data ? sanitize(data) : '');
    }
  },

  /**
   * Log debug messages (only in development)
   */
  debug: (message: string, data?: any) => {
    if (isDevelopment) {
      console.log(`[KPI Vault] [DEBUG] ${message}`, data ? sanitize(data) : '');
    }
  },

  /**
   * Log warnings (always, but sanitized)
   */
  warn: (message: string, data?: any) => {
    console.warn(`[KPI Vault] ${message}`, data ? sanitize(data) : '');
  },

  /**
   * Log errors (always, but sanitized)
   */
  error: (message: string, error?: any) => {
    const sanitizedError = error ? {
      message: error.message || error,
      ...(error.response ? { status: error.response.status } : {}),
      ...(error.response?.statusText ? { statusText: error.response.statusText } : {}),
    } : error;
    
    console.error(`[KPI Vault] ${message}`, sanitizedError || '');
  },

  /**
   * Log success messages (only in development)
   */
  success: (message: string, data?: any) => {
    if (isDevelopment) {
      console.log(`[KPI Vault] ✅ ${message}`, data ? sanitize(data) : '');
    }
  },

  /**
   * Log operation start (only in development)
   */
  start: (operation: string, data?: any) => {
    if (isDevelopment) {
      console.log(`[KPI Vault] 🚀 Starting: ${operation}`, data ? sanitize(data) : '');
    }
  },

  /**
   * Log operation complete (only in development)
   */
  complete: (operation: string, data?: any) => {
    if (isDevelopment) {
      console.log(`[KPI Vault] ✅ Complete: ${operation}`, data ? sanitize(data) : '');
    }
  },
};

export default secureLogger;

