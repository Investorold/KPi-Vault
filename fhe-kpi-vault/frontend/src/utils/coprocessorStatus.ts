/**
 * Check Zama Coprocessor Status
 * 
 * This utility checks if the Zama Coprocessor is operational by attempting
 * a lightweight request to the relayer endpoint.
 */

import { secureLogger } from './secureLogger';

export interface CoprocessorStatus {
  isOperational: boolean;
  status: 'operational' | 'degraded' | 'down' | 'unknown';
  message: string;
  lastChecked: number;
  error?: string;
}

/**
 * Check if the Zama Coprocessor is operational
 * This is a lightweight check that doesn't require encryption
 */
export async function checkCoprocessorStatus(relayerUrl: string = 'https://relayer.testnet.zama.org'): Promise<CoprocessorStatus> {
  const startTime = Date.now();
  
  try {
    // Try a lightweight endpoint to check if relayer is responding
    // We use HEAD request to minimize bandwidth
    // NOTE: This endpoint may return CORS errors - that's expected (Zama server-side issue)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    try {
      const response = await fetch(`${relayerUrl}/v1/status`, {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-store',
        // Don't throw on CORS errors - we'll catch them gracefully
        mode: 'cors' as RequestMode
      }).catch((err) => {
        // Catch CORS errors specifically - these don't mean the coprocessor is down
        if (err.message && err.message.includes('CORS')) {
          // CORS error means the server responded but doesn't allow cross-origin requests
          // This is a Zama server-side configuration issue, not a coprocessor issue
          return null; // Signal that we got a CORS error
        }
        throw err; // Re-throw other errors
      });
      
      clearTimeout(timeoutId);
      
      // If we got a CORS error (response is null), the server is up but endpoint isn't configured
      if (response === null) {
        // Can't determine status due to CORS, but server responded (so it's likely operational)
        // We'll assume unknown status rather than saying it's down
        return {
          isOperational: false,
          status: 'unknown',
          message: 'Cannot check status (CORS issue on Zama endpoint) - check https://status.zama.org',
          lastChecked: Date.now(),
          error: 'CORS error - endpoint exists but missing CORS headers'
        };
      }
      
      if (response.ok || response.status === 404) {
        // 404 is OK - means endpoint exists but might not have status endpoint
        // The important thing is the server responded
        return {
          isOperational: true,
          status: 'operational',
          message: 'Coprocessor appears to be operational',
          lastChecked: Date.now()
        };
      } else if (response.status >= 500) {
        return {
          isOperational: false,
          status: 'down',
          message: `Relayer returned ${response.status} - Coprocessor may be down`,
          lastChecked: Date.now(),
          error: `HTTP ${response.status}`
        };
      } else {
        return {
          isOperational: true,
          status: 'operational',
          message: 'Relayer is responding',
          lastChecked: Date.now()
        };
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      // Check if it's a CORS error (common with this endpoint)
      const errorMessage = fetchError?.message || String(fetchError);
      if (errorMessage.includes('CORS') || errorMessage.includes('Access-Control-Allow-Origin')) {
        return {
          isOperational: false,
          status: 'unknown',
          message: 'Cannot check status (CORS issue) - check https://status.zama.org',
          lastChecked: Date.now(),
          error: 'CORS error - endpoint exists but missing CORS headers'
        };
      }
      
      // Check if it's a timeout or network error
      if (fetchError.name === 'AbortError' || fetchError.name === 'TimeoutError') {
        return {
          isOperational: false,
          status: 'down',
          message: 'Relayer did not respond within 5 seconds - Coprocessor may be down',
          lastChecked: Date.now(),
          error: 'Timeout'
        };
      }
      
      throw fetchError;
    }
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    
    // Check for CORS errors
    if (errorMessage.includes('CORS') || errorMessage.includes('Access-Control-Allow-Origin')) {
      return {
        isOperational: false,
        status: 'unknown',
        message: 'Cannot check status (CORS issue) - check https://status.zama.org',
        lastChecked: Date.now(),
        error: 'CORS error'
      };
    }
    
    // Check for specific error patterns
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      return {
        isOperational: false,
        status: 'down',
        message: 'Cannot reach relayer - Coprocessor may be down or network issue',
        lastChecked: Date.now(),
        error: errorMessage
      };
    }
    
    return {
      isOperational: false,
      status: 'unknown',
      message: 'Unable to determine coprocessor status',
      lastChecked: Date.now(),
      error: errorMessage
    };
  }
}

/**
 * Check coprocessor status and log to console with helpful message
 */
export async function logCoprocessorStatus(): Promise<void> {
  console.log('[Coprocessor Status] 🔍 Checking Zama Coprocessor status...');
  
  const status = await checkCoprocessorStatus();
  
  if (status.isOperational) {
    console.log(`[Coprocessor Status] ✅ ${status.message}`);
    console.log(`[Coprocessor Status] Status: ${status.status}`);
  } else {
    console.warn(`[Coprocessor Status] ❌ ${status.message}`);
    console.warn(`[Coprocessor Status] Status: ${status.status}`);
    if (status.error) {
      console.warn(`[Coprocessor Status] Error: ${status.error}`);
    }
    console.warn('[Coprocessor Status] 💡 Check https://status.zama.org for official status');
    console.warn('[Coprocessor Status] 💡 Wait 5-10 minutes and retry when coprocessor is operational');
  }
  
  return;
}

/**
 * Get user-friendly status message
 */
export function getStatusMessage(status: CoprocessorStatus): string {
  if (status.isOperational) {
    return '✅ Coprocessor is operational - encryption should work';
  }
  
  switch (status.status) {
    case 'down':
      return '🔴 Coprocessor is down - encryption unavailable. Check https://status.zama.org';
    case 'degraded':
      return '⚠️ Coprocessor is degraded - encryption may fail. Check https://status.zama.org';
    default:
      return '❓ Unable to determine coprocessor status. Check https://status.zama.org';
  }
}


