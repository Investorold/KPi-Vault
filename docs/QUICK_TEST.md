# Quick Test - Data Recovery

## Issue: `testDataRecovery is not defined`

The function should be available, but if it's not, try these:

### Option 1: Hard Refresh
1. Press `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)
2. Wait for page to reload
3. Check console for: `🧪 Data Recovery Test Function Available!`
4. Try `testDataRecovery()` again

### Option 2: Direct Service Access
If the function still doesn't work, use the service directly:

```javascript
// 1. Get your wallet address
const accounts = await window.ethereum.request({ method: 'eth_accounts' });
const walletAddress = accounts[0];
console.log('Wallet:', walletAddress);

// 2. Check mappings
const mappings = JSON.parse(localStorage.getItem('kpi_metric_id_mappings') || '{}');
console.log('Stored mappings:', Object.keys(mappings).length, mappings);

// 3. Access service (should be available if app loaded)
// Try accessing via the app's global scope or import
// If kpiContractService is not available, the app might need a rebuild
```

### Option 3: Rebuild Frontend
If the function isn't available, rebuild:

```bash
cd /root/Zama/frontend
npm run build
# Or if using dev server:
npm run dev
```

Then hard refresh the browser.

### Option 4: Manual Test Script
Copy-paste this complete script:

```javascript
(async function() {
  console.log('🧪 Manual Data Recovery Test\n');
  
  // Get wallet
  const accounts = await window.ethereum?.request({ method: 'eth_accounts' });
  if (!accounts || accounts.length === 0) {
    console.error('❌ Connect wallet first');
    return;
  }
  const walletAddress = accounts[0];
  console.log('📍 Wallet:', walletAddress);
  
  // Check mappings
  const mappings = JSON.parse(localStorage.getItem('kpi_metric_id_mappings') || '{}');
  console.log('📦 Mappings:', Object.keys(mappings).length);
  
  // Try to access service
  // The service should be available if the React app loaded
  // If not, we need to check why
  
  // Check if service exists
  if (typeof window.kpiContractService === 'undefined') {
    console.error('❌ kpiContractService not available on window');
    console.log('💡 Try: Hard refresh (Ctrl+Shift+R) or rebuild frontend');
    return;
  }
  
  try {
    console.log('\n🔍 Discovering...');
    const discovered = await window.kpiContractService.discoverMetricIds(walletAddress);
    console.log('✅ Found:', discovered.length);
    discovered.forEach((m, i) => {
      console.log(`${i+1}. ${m.hex.substring(0, 20)}... | Original: ${m.original || '❌'} | Entries: ${m.entryCount || 0}`);
    });
  } catch (error) {
    console.error('❌ Error:', error);
  }
})();
```







