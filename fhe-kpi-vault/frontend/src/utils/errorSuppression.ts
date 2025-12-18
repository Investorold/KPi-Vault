/**
 * Suppress harmless browser extension errors that don't affect functionality
 * These are caused by wallet extension conflicts (e.g., MetaMask vs Phantom)
 */

export function suppressHarmlessErrors() {
  // Suppress MetaMask provider conflict errors
  const originalError = console.error;
  console.error = (...args: any[]) => {
    const message = args[0]?.toString() || '';
    const fullMessage = args.map(a => String(a)).join(' ');
    
    // Suppress MetaMask provider setting errors
    if (
      message.includes('MetaMask encountered an error setting the global Ethereum provider') ||
      message.includes('Cannot set property ethereum of #<Window> which has only a getter') ||
      message.includes('global Ethereum provider') ||
      fullMessage.includes('Cannot set property ethereum') ||
      fullMessage.includes('which has only a getter') ||
      fullMessage.includes('Invalid property descriptor') ||
      fullMessage.includes('Failed to assign ethereum proxy') ||
      fullMessage.includes('another Ethereum wallet extension') ||
      fullMessage.includes('property ethereum') ||
      fullMessage.includes('TypeError: Cannot set property') ||
      fullMessage.includes('solanaActionsContentScript') ||
      fullMessage.includes('Could not establish connection') ||
      fullMessage.includes('Receiving end does not exist')
    ) {
      // Silently ignore - this is a known extension conflict
      return;
    }
    
    // Suppress CORS errors from status check (known Zama server-side issue)
    if (
      fullMessage.includes('CORS policy') ||
      fullMessage.includes('Access-Control-Allow-Origin') ||
      (fullMessage.includes('relayer.testnet.zama.org/v1/status') && fullMessage.includes('blocked'))
    ) {
      // Silently ignore - Zama's status endpoint doesn't have CORS headers
      return;
    }
    
    // Call original error handler for everything else
    originalError.apply(console, args);
  };

  // Suppress runtime.lastError warnings (common with extensions)
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    const message = args[0]?.toString() || '';
    const fullMessage = args.map(a => String(a)).join(' ');
    
    // Suppress extension communication errors
    if (
      message.includes('Unchecked runtime.lastError') ||
      fullMessage.includes('Could not establish connection') ||
      fullMessage.includes('Receiving end does not exist')
    ) {
      // Silently ignore - these are harmless extension communication issues
      return;
    }
    
    // Suppress CORS warnings
    if (
      fullMessage.includes('CORS policy') ||
      fullMessage.includes('Access-Control-Allow-Origin') ||
      (fullMessage.includes('relayer.testnet.zama.org/v1/status') && fullMessage.includes('blocked'))
    ) {
      // Silently ignore
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
      message.includes('parameter 1 is not of type') ||
      message.includes('Cannot set property ethereum')
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

