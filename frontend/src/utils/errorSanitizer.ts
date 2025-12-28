/**
 * Production-Safe Error Sanitization
 * 
 * Prevents information disclosure by converting technical errors
 * into generic, user-friendly messages in production.
 * 
 * In production: Only generic messages shown to users
 * In development: Full error details for debugging
 */

const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';
const isProduction = !isDevelopment;

/**
 * Sanitizes error messages for user display
 * Removes technical details, file paths, stack traces, and system architecture hints
 */
export function sanitizeErrorMessage(error: any): string {
  if (!error) {
    return 'An unexpected error occurred. Please try again.';
  }

  // Extract error message
  let errorMessage = '';
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else if (error?.message) {
    errorMessage = error.message;
  } else {
    errorMessage = String(error);
  }

  // In production, always return generic messages
  if (isProduction) {
    // Map common technical errors to generic messages
    const lowerMessage = errorMessage.toLowerCase();

    // Network/Connection errors
    if (lowerMessage.includes('network') || lowerMessage.includes('fetch') || 
        lowerMessage.includes('connection') || lowerMessage.includes('timeout') ||
        lowerMessage.includes('failed to fetch')) {
      return 'Network error. Please check your connection and try again.';
    }

    // Wallet/Transaction errors
    if (lowerMessage.includes('user rejected') || lowerMessage.includes('user denied') ||
        lowerMessage.includes('rejected the request')) {
      return 'Transaction was cancelled.';
    }

    if (lowerMessage.includes('insufficient funds') || lowerMessage.includes('gas')) {
      return 'Insufficient funds for transaction.';
    }

    // Authentication/Authorization errors
    if (lowerMessage.includes('unauthorized') || lowerMessage.includes('403') ||
        lowerMessage.includes('access denied') || lowerMessage.includes('permission')) {
      return 'Access denied.';
    }

    if (lowerMessage.includes('not found') || lowerMessage.includes('404')) {
      return 'Resource not found.';
    }

    // Server errors
    if (lowerMessage.includes('500') || lowerMessage.includes('502') || 
        lowerMessage.includes('503') || lowerMessage.includes('504') ||
        lowerMessage.includes('server error') || lowerMessage.includes('internal error')) {
      return 'Server error. Please try again later.';
    }

    // Database/Storage errors (should never be exposed)
    if (lowerMessage.includes('database') || lowerMessage.includes('sql') ||
        lowerMessage.includes('mongo') || lowerMessage.includes('redis') ||
        lowerMessage.includes('file system') || lowerMessage.includes('filesystem')) {
      return 'Storage error. Please try again.';
    }

    // Configuration/Environment errors (should never be exposed)
    if (lowerMessage.includes('environment') || lowerMessage.includes('config') ||
        lowerMessage.includes('missing env') || lowerMessage.includes('undefined variable')) {
      return 'Configuration error. Please contact support.';
    }

    // File path errors (should never be exposed)
    if (lowerMessage.includes('/') && (lowerMessage.includes('.js') || lowerMessage.includes('.ts') ||
        lowerMessage.includes('node_modules') || lowerMessage.includes('src/'))) {
      return 'Application error. Please try again.';
    }

    // Stack trace patterns (should never be exposed)
    if (lowerMessage.includes('at ') && (lowerMessage.includes('(') || lowerMessage.includes('.ts:'))) {
      return 'Application error. Please try again.';
    }

    // Generic fallback for any technical error
    return 'An error occurred. Please try again or contact support if the problem persists.';
  }

  // In development, return the actual error message for debugging
  return errorMessage;
}

/**
 * Sanitizes API error responses
 * Ensures backend error responses don't expose system details
 */
export function sanitizeApiError(error: any): { message: string; details?: any } {
  const sanitizedMessage = sanitizeErrorMessage(error);

  if (isProduction) {
    // In production, only return the sanitized message
    return { message: sanitizedMessage };
  }

  // In development, include some details for debugging
  return {
    message: sanitizedMessage,
    details: error?.response?.data || error?.details || undefined
  };
}

/**
 * Logs detailed error information (for developers/logging systems only)
 * This should NEVER be displayed to users
 */
export function logDetailedError(context: string, error: any): void {
  if (isDevelopment) {
    // In development, log full details to console
    console.error(`[${context}] Error details:`, {
      message: error?.message,
      stack: error?.stack,
      response: error?.response?.data,
      status: error?.response?.status,
      url: error?.config?.url || error?.request?.responseURL
    });
  } else {
    // In production, log to error tracking service (e.g., Sentry, LogRocket)
    // For now, we'll use console.error but in a real app, send to monitoring service
    // DO NOT log sensitive data (passwords, keys, tokens, etc.)
    console.error(`[${context}]`, {
      message: error?.message?.substring(0, 100), // Truncate long messages
      type: error?.constructor?.name,
      timestamp: new Date().toISOString()
      // Intentionally NOT logging: stack traces, full error objects, sensitive data
    });
  }
}

/**
 * Generic error messages for common scenarios
 */
export const GenericErrors = {
  NETWORK: 'Network error. Please check your connection and try again.',
  SERVER: 'Server error. Please try again later.',
  UNKNOWN: 'An unexpected error occurred. Please try again.',
  ACCESS_DENIED: 'Access denied.',
  NOT_FOUND: 'Resource not found.',
  INVALID_INPUT: 'Invalid input. Please check your data and try again.',
  TIMEOUT: 'Request timed out. Please try again.',
  UNAVAILABLE: 'Service temporarily unavailable. Please try again later.'
} as const;



