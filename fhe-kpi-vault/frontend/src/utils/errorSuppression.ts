/**
 * Suppress harmless browser extension errors that don't affect functionality
 * These are caused by wallet extension conflicts (e.g., MetaMask vs Phantom)
 */

export function suppressHarmlessErrors() {
  // Suppress MetaMask provider conflict errors
  const originalError = console.error;
  console.error = (...args: any[]) => {
    const message = args[0]?.toString() || '';
    
    // Suppress MetaMask provider setting errors
    if (
      message.includes('MetaMask encountered an error setting the global Ethereum provider') ||
      message.includes('Cannot set property ethereum of #<Window> which has only a getter')
    ) {
      // Silently ignore - this is a known extension conflict
      return;
    }
    
    // Call original error handler for everything else
    originalError.apply(console, args);
  };

  // Suppress runtime.lastError warnings (common with extensions)
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    const message = args[0]?.toString() || '';
    
    // Suppress extension communication errors
    if (
      message.includes('Unchecked runtime.lastError') ||
      message.includes('Could not establish connection') ||
      message.includes('Receiving end does not exist')
    ) {
      // Silently ignore - these are harmless extension communication issues
      return;
    }
    
    // Call original warn handler for everything else
    originalWarn.apply(console, args);
  };

  // Suppress Solana extension errors (if present)
  window.addEventListener('error', (event) => {
    const message = event.message || '';
    if (
      message.includes('solanaActionsContentScript') ||
      message.includes('MutationObserver') ||
      message.includes('parameter 1 is not of type')
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
}

/**
 * Check if there are multiple wallet extensions that might conflict
 */
export function detectWalletConflicts(): boolean {
  try {
    // Check if window.ethereum is read-only (sign of conflict)
    const descriptor = Object.getOwnPropertyDescriptor(window, 'ethereum');
    if (descriptor && !descriptor.writable && !descriptor.configurable) {
      return true;
    }
    
    // Check for multiple providers
    if (window.ethereum?.providers && window.ethereum.providers.length > 1) {
      return true;
    }
    
    // Check for Phantom wallet
    if (window.phantom?.ethereum) {
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}

