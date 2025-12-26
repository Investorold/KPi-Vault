# Gateway Key Fetch Diagnostic

## 🔑 Error: "You must provide a public key with its public key ID"

This error occurs when the SDK cannot fetch the gateway's encryption public key during initialization.

## 🚀 Quick Diagnostic (Copy/Paste into Browser Console)

### Check 1: Gateway Key URL

```javascript
(async()=>{
  try{
    const r = await fetch("https://gateway.testnet.zama.ai/v1/keyurl", { cache: "no-store" });
    console.log('KEYURL fetch status:', r.status);
    const txt = await r.text();
    console.log('KEYURL response (first 2000 chars):', txt.slice(0,2000));
    try { console.log('KEYURL json:', JSON.parse(txt)); } catch(e){}
  }catch(e){
    console.error('KEYURL fetch failed:', e);
  }
})();
```

**Expected result:**
- HTTP 200 with JSON containing `keyId` and `publicKey`
- Example: `{ "keyId": "k_abc123", "publicKey": "-----BEGIN PUBLIC KEY-----..." }`

### Check 2: Gateway Status

```javascript
(async()=>{
  try {
    const r = await fetch("https://gateway.testnet.zama.ai/v1/status", { cache: "no-store" });
    const j = await r.json();
    console.log('GATEWAY /v1/status:', r.status, j);
  } catch(e) {
    console.error('GATEWAY status fetch failed:', e);
  }
})();
```

**Expected result:**
- HTTP 200 with JSON indicating healthy status

### Check 3: SDK Config

```javascript
// Print config the page will pass to SDK
console.log('SDK config (best-effort):', 
  window.__ZAMA_FORCE_GATEWAY_CONFIG || 
  window.__ZAMA_RELAYER_CONFIG || 
  (window.__fhevmStatus && window.__fhevmStatus()) || 
  null
);

// Try manual init
(async()=>{
  try{
    if (typeof window.__fhevmReset === 'function') {
      console.log('✅ FHEVM service found');
      const status = window.__fhevmStatus();
      console.log('FHEVM Status:', status);
    } else {
      console.log('⚠️ FHEVM service not found');
    }
  }catch(e){
    console.error('getFhevm init failed:', e && e.message ? e.message : e);
    console.error(e);
  }
})();
```

## 📋 Or Use the Full Diagnostic Script

Run this in browser console:

```javascript
fetch("/key-fetch-diagnostic.js").then(r=>r.text()).then(eval)
```

## 🎯 Root Causes & Fixes

### Cause A: Gateway Key Service Temporarily Unavailable
**Symptoms:** 
- Fetch to `/v1/keyurl` fails or returns error
- Gateway status shows degraded

**Fix:** 
- Wait until gateway/coprocessor services are healthy
- Check https://status.zama.org for "Coprocessor - Testnet" status
- Retry after status shows "Operational"

### Cause B: Gateway Returns Malformed/Missing Key Info
**Symptoms:** 
- `/v1/keyurl` returns 200 but missing `keyId` or `publicKey` fields

**Fix:** 
- This is a gateway-side issue - report to Zama ops
- Show UI error: "Encryption key unavailable — try again shortly"

### Cause C: Network/CORS/DNS Blocks the Key Fetch
**Symptoms:** 
- Fetch throws networking error or CORS block
- Network tab shows CORS error for `/v1/keyurl`

**Fix:** 
- Ensure `gatewayUrl` is correct (`https://gateway.testnet.zama.ai`)
- Confirm network allows outbound HTTPS to gateway
- Check for proxy/VPN interference
- If CORS error: Gateway needs correct CORS headers (contact Zama ops)

### Cause D: SDK Initialized Before Gateway Key Could Be Fetched
**Symptoms:** 
- Intermittent failure on first init
- Subsequent attempts succeed

**Fix:** 
- SDK now has retry logic with exponential backoff
- Up to 6 retries for key fetch errors
- Automatic retry with increasing delays

## ✅ What's Already Fixed

The SDK initialization now includes:

1. **Automatic Retry Logic**
   - Up to 6 retries for key fetch errors
   - Exponential backoff (500ms, 1s, 2s, 4s, 8s, 10s max)

2. **Better Error Detection**
   - Detects key fetch errors specifically
   - Provides clear error messages

3. **User-Friendly Messages**
   - Clear guidance on what to check
   - Links to status page
   - Diagnostic script recommendations

## 📝 What to Share

After running diagnostics, share:

1. ✅ `/v1/keyurl` fetch status & response (VERY IMPORTANT)
2. ✅ `/v1/status` fetch output
3. ✅ SDK config output
4. ✅ Any error messages from manual init attempts



