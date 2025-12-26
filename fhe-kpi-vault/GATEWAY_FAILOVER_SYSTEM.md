# Gateway Failover System - FHEVM v0.9

## Overview

The Gateway Failover System automatically handles DNS issues and endpoint availability for the Zama Gateway. It provides:

- ✅ Automatic health checks
- ✅ Smart endpoint selection (.org → .ai → proxy)
- ✅ Exponential backoff retries
- ✅ Health status caching
- ✅ Real-time failover during runtime

## Architecture

### Endpoint Priority

1. **Primary:** `https://gateway.testnet.zama.org` (future, when DNS is live)
2. **Fallback:** `https://gateway.testnet.zama.ai` (current working endpoint)
3. **Ultimate Fallback:** Backend proxy route `/api/_zama_keyurl`

### How It Works

```
┌─────────────────────────────────────────┐
│  Frontend Initialization                │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Gateway Failover System                │
│  1. Check .org endpoint health         │
│  2. If unhealthy, check .ai endpoint    │
│  3. Select best available endpoint      │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  SDK Initialization                      │
│  Uses selected gateway URL              │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Runtime Monitoring                     │
│  - Records successes/failures           │
│  - Auto-failover on errors             │
│  - Health check cache (1 min TTL)       │
└─────────────────────────────────────────┘
```

## Usage

### Automatic (Default)

The failover system is **automatically integrated** into `fhevmService.ts`. No code changes needed - it just works!

### Manual Control (Browser Console)

```javascript
// Check health of all endpoints
await window.__gatewayFailover.checkHealth();

// Find the best endpoint
await window.__gatewayFailover.findBest();

// Get current status
window.__gatewayFailover.getStatus();

// Clear health check cache (force re-check)
window.__gatewayFailover.clearCache();

// Full FHEVM status (includes gateway info)
window.__fhevmStatus();
```

## Health Check Details

### What Gets Checked

- **DNS Resolution:** Can the domain be resolved?
- **Network Reachability:** Can we connect to the endpoint?
- **Response Time:** How fast is the endpoint?
- **Error Tracking:** How many failures has this endpoint had?

### Health Check Cache

- **TTL:** 1 minute (60 seconds)
- **Purpose:** Avoid excessive health checks
- **Clear:** Use `window.__gatewayFailover.clearCache()`

### Failure Threshold

- **Max Errors:** 3 consecutive errors mark endpoint as unhealthy
- **Recovery:** Endpoint marked healthy again on first success

## Backend Proxy Failover

The backend proxy (`/api/_zama_keyurl`) also implements failover:

```javascript
// Tries endpoints in order:
1. https://gateway.testnet.zama.org/v1/keyurl
2. https://gateway.testnet.zama.ai/v1/keyurl

// Returns first successful response
// If all fail, returns 502 with error details
```

## Configuration

### Frontend Override (index.html)

You can still force a specific gateway URL:

```html
<script>
  window.__ZAMA_FORCE_GATEWAY_CONFIG = {
    gatewayUrl: "https://gateway.testnet.zama.ai", // Forces this URL
    gatewayChainId: 10901,
    relayerUrl: "https://relayer.testnet.zama.org"
  };
</script>
```

**Note:** If `gatewayUrl` is forced, failover will still check health but won't switch endpoints.

### Default Behavior

If no override is set, the failover system:
1. Checks all endpoints
2. Selects the healthiest one
3. Uses it for SDK initialization
4. Monitors and auto-failovers on errors

## Error Handling

### DNS Failures (ERR_NAME_NOT_RESOLVED)

- **Detection:** Automatic via health checks
- **Action:** Automatically switches to `.ai` endpoint
- **Logging:** Console warnings with endpoint status

### Network Timeouts

- **Timeout:** 5 seconds per health check
- **Retry:** Exponential backoff (500ms → 1s → 2s → 4s → 8s → 10s max)
- **Max Retries:** 6 for key fetch errors, 3 for other errors

### Gateway Unavailable

- **Detection:** HTTP 5xx errors or network failures
- **Action:** 
  1. Record failure
  2. Try next endpoint
  3. If all fail, increase retry count
  4. Log detailed error information

## Monitoring & Debugging

### Console Logs

The system logs detailed information:

```
[Gateway Failover] 🔍 Checking gateway endpoints...
[Gateway Failover] ✅ Selected: Gateway (.ai) (https://gateway.testnet.zama.ai)
[Gateway Failover] ⚡ Response time: 234ms
```

### Status Check

```javascript
// Get full status
const status = window.__fhevmStatus();
console.log(status.gatewayStatus);
// Output:
// [
//   {
//     url: 'https://gateway.testnet.zama.org',
//     name: 'Gateway (.org)',
//     priority: 1,
//     isHealthy: false,
//     errorCount: 3,
//     lastChecked: 1234567890
//   },
//   {
//     url: 'https://gateway.testnet.zama.ai',
//     name: 'Gateway (.ai)',
//     priority: 2,
//     isHealthy: true,
//     errorCount: 0,
//     lastChecked: 1234567890
//   }
// ]
```

## Migration from Hardcoded URLs

### Before (Hardcoded)

```typescript
config.gatewayUrl = 'https://gateway.testnet.zama.ai';
```

### After (Failover System)

```typescript
// Automatic - no code needed!
// System selects best endpoint automatically
```

### Manual Override (If Needed)

```typescript
const selectedGatewayUrl = await gatewayFailover.getGatewayUrl();
config.gatewayUrl = selectedGatewayUrl;
```

## Benefits

1. **Resilience:** Automatically handles DNS issues and endpoint failures
2. **Future-Proof:** Will automatically use `.org` when DNS is live
3. **Performance:** Health checks ensure fastest endpoint is used
4. **Transparency:** Detailed logging and status reporting
5. **Zero Configuration:** Works out of the box

## Troubleshooting

### All Endpoints Unhealthy

If all endpoints are marked unhealthy:

1. Check network connectivity
2. Verify DNS resolution: `nslookup gateway.testnet.zama.ai`
3. Check Zama status: https://status.zama.org
4. Clear cache: `window.__gatewayFailover.clearCache()`
5. Check console for detailed error messages

### Endpoint Not Switching

If failover isn't switching endpoints:

1. Check if `gatewayUrl` is forced in `index.html`
2. Verify health check cache isn't stale
3. Check console for health check results
4. Manually trigger: `await window.__gatewayFailover.findBest()`

### Still Getting ERR_NAME_NOT_RESOLVED

If you still see DNS errors:

1. The failover system should have caught this
2. Check if health checks are running: `window.__gatewayFailover.getStatus()`
3. Verify the selected endpoint: `window.__fhevmStatus().config.gatewayUrl`
4. Clear cache and retry: `window.__gatewayFailover.clearCache()`

## Future Enhancements

- [ ] Add metrics/analytics for endpoint usage
- [ ] Implement circuit breaker pattern
- [ ] Add endpoint performance scoring
- [ ] Support custom endpoint lists
- [ ] Add health check webhook notifications

## Related Files

- `frontend/src/utils/gatewayFailover.ts` - Core failover logic
- `frontend/src/services/fhevmService.ts` - Integration point
- `backend/api/index.js` - Backend proxy with failover
- `frontend/index.html` - Optional override configuration

