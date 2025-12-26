# 🔍 Diagnosing "Failed to fetch" Error

## ❌ Error: "Failed to fetch"

This means the browser couldn't even reach the gateway - the request failed at the network level before getting a response.

## 🔍 Step 1: Check Network Tab

1. Open DevTools → **Network** tab
2. Clear network log (🚫 icon)
3. Run the diagnostic again:

```javascript
(async()=>{
  try{
    const r = await fetch("https://gateway.testnet.zama.ai/v1/keyurl", { cache: "no-store" });
    console.log('KEYURL status:', r.status);
    const txt = await r.text();
    console.log('KEYURL response:', txt.slice(0,2000));
  }catch(e){
    console.error('KEYURL fetch failed:', e);
  }
})();
```

4. Look for the request to `gateway.testnet.zama.ai/v1/keyurl` in the Network tab

**Check:**
- ❓ **Status**: What status does it show? (Pending, Failed, CORS error, etc.)
- ❓ **Type**: What type is shown? (fetch, xhr, etc.)
- ❓ **Error message**: Hover over or click on the failed request - what error does it show?

## 🔍 Step 2: Try Gateway Status Endpoint

The status endpoint might work even if keyurl doesn't:

```javascript
(async()=>{
  try {
    const r = await fetch("https://gateway.testnet.zama.ai/v1/status", { cache: "no-store" });
    console.log('Status endpoint - HTTP status:', r.status);
    const j = await r.json();
    console.log('Status endpoint - Response:', j);
  } catch(e) {
    console.error('Status endpoint failed:', e && e.message ? e.message : e);
    console.error('Full error:', e);
  }
})();
```

## 🔍 Step 3: Check if Gateway is Reachable

Test basic connectivity:

```javascript
(async()=>{
  // Test 1: Simple fetch to gateway root
  try {
    const r = await fetch("https://gateway.testnet.zama.ai/", { method: 'HEAD' });
    console.log('✅ Gateway root is reachable:', r.status);
  } catch(e) {
    console.error('❌ Gateway root unreachable:', e.message);
  }
  
  // Test 2: Check DNS resolution
  console.log('Checking if DNS resolves...');
  try {
    const response = await fetch("https://gateway.testnet.zama.ai/v1/status", {
      method: 'GET',
      mode: 'no-cors' // This will bypass CORS but won't let us read response
    });
    console.log('✅ DNS resolves (no-cors mode worked)');
  } catch(e) {
    console.error('❌ DNS or connection issue:', e.message);
  }
})();
```

## 🔍 Step 4: Check for CORS Issues

CORS errors usually show in console. Check for messages like:
- "Access to fetch has been blocked by CORS policy"
- "Cross-Origin Request Blocked"

Run this to explicitly test CORS:

```javascript
(async()=>{
  console.log('Testing CORS explicitly...');
  try {
    const r = await fetch("https://gateway.testnet.zama.ai/v1/keyurl", { 
      cache: "no-store",
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    });
    console.log('✅ Fetch succeeded (no CORS error):', r.status);
  } catch(e) {
    const errorMsg = e.message || String(e);
    if (errorMsg.includes('CORS') || errorMsg.includes('cross-origin')) {
      console.error('❌ CORS ERROR:', errorMsg);
      console.error('💡 Gateway is blocking cross-origin requests');
    } else {
      console.error('❌ Other error:', errorMsg);
    }
  }
})();
```

## 🔍 Step 5: Check Browser Console for More Errors

Look in the console for:
- ❓ CORS errors (red text about "CORS policy")
- ❓ Network errors
- ❓ SSL/TLS errors
- ❓ DNS resolution errors

## 🔍 Step 6: Check Status Page

Visit: **https://status.zama.org**

Check:
- ❓ Is "Coprocessor - Testnet" showing as down?
- ❓ Is "Gateway" showing any issues?
- ❓ Any ongoing incidents?

## 🎯 Common Causes of "Failed to fetch"

### Cause 1: CORS Blocking ⭐
**Symptoms:**
- Console shows CORS error
- Network tab shows "CORS" or "blocked"

**Fix:**
- Gateway needs proper CORS headers (contact Zama ops)
- Temporary: Use server-side proxy (we can implement this)

### Cause 2: Network/Firewall Blocking
**Symptoms:**
- No CORS error, just "Failed to fetch"
- Works from different network

**Fix:**
- Check firewall/VPN/proxy settings
- Try from different network
- Check if corporate firewall is blocking

### Cause 3: Gateway Completely Down
**Symptoms:**
- Status page shows gateway down
- All endpoints fail

**Fix:**
- Wait for gateway recovery
- Check status.zama.org

### Cause 4: DNS Resolution Failure
**Symptoms:**
- Can't resolve `gateway.testnet.zama.ai`
- DNS errors in console

**Fix:**
- Check internet connection
- Try different DNS (8.8.8.8)
- Check if domain is blocked

### Cause 5: Browser Extension Blocking
**Symptoms:**
- Works in incognito mode
- Works with extensions disabled

**Fix:**
- Disable ad blockers/privacy extensions
- Check if security extensions are blocking

## 📋 What to Share

Please share:

1. ✅ **Network tab details** - What does the failed request show?
   - Status (Pending, Failed, CORS, etc.)
   - Error message when you click on it

2. ✅ **Console errors** - Any CORS or other errors?

3. ✅ **Status endpoint result** - Does `/v1/status` also fail?

4. ✅ **Status page** - What does status.zama.org show?

5. ✅ **Browser/Network** - 
   - What browser are you using?
   - Are you on a VPN/proxy?
   - Are you behind a corporate firewall?

## 💡 Quick Test: Try from Different Context

Test if it's a browser/network issue:

**From command line (if you have curl):**
```bash
curl -v https://gateway.testnet.zama.ai/v1/keyurl
```

**From different browser/incognito:**
- Try the same fetch in incognito mode
- Disable all browser extensions
- Try from a different network

## 🔧 Potential Fixes

### If CORS Issue:
We can implement a server-side proxy that fetches the key and forwards it to the client.

### If Network/Firewall:
- Check firewall rules
- Try different network
- Check VPN/proxy settings

### If Gateway Down:
- Wait for recovery
- Check status.zama.org

---

**🚀 NEXT STEP:** Run Step 1 (check Network tab) and share what you see. That will tell us exactly what's happening!



