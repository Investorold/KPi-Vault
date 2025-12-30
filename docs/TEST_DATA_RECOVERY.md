# Testing Data Recovery Mechanism

## Quick Test Guide

### Prerequisites
1. ✅ Frontend is running
2. ✅ Wallet is connected
3. ✅ You have recorded at least one metric before

## Test Steps

### Step 1: Check if Mappings are Stored

Open browser console (F12) and run:

```javascript
// Check if mappings exist in localStorage
const mappings = JSON.parse(localStorage.getItem('kpi_metric_id_mappings') || '{}');
console.log('Stored Metric ID Mappings:', mappings);
console.log('Count:', Object.keys(mappings).length);
```

**Expected**: You should see mappings like:
```json
{
  "0xabc123...": "mrr",
  "0xdef456...": "dau"
}
```

### Step 2: Test Discovery Function

In the browser console, run:

```javascript
// Import the service (if using modules) or access via window
// The service should be available if the app is loaded

// Get your wallet address
const walletAddress = window.ethereum?.selectedAddress || 
  (await window.ethereum?.request({ method: 'eth_accounts' }))[0];

console.log('Testing discovery for:', walletAddress);

// Call the discovery function
// Note: You may need to import kpiContractService or access it via the app
// This depends on how your app exposes it

// If kpiContractService is available globally:
try {
  const discovered = await kpiContractService.discoverMetricIds(walletAddress);
  console.log('✅ Discovered Metric IDs:', discovered);
  console.log('Total discovered:', discovered.length);
  
  discovered.forEach((metric, index) => {
    console.log(`\nMetric ${index + 1}:`);
    console.log('  Hex:', metric.hex);
    console.log('  Original:', metric.original || '❌ NOT RECOVERED');
    console.log('  Entry Count:', metric.entryCount || 0);
  });
} catch (error) {
  console.error('❌ Discovery failed:', error);
}
```

### Step 3: Test Full Recovery Workflow

```javascript
// 1. Discover metric IDs
const discovered = await kpiContractService.discoverMetricIds(walletAddress);

// 2. For each discovered metric with original string, create metadata
for (const metric of discovered) {
  if (metric.original) {
    console.log(`Recovering: ${metric.original} (${metric.entryCount} entries)`);
    
    // Create metadata (you'll need backendClient)
    // await backendClient.createMetadata(walletAddress, {
    //   metricId: metric.original,
    //   label: `Recovered: ${metric.original}`,
    //   unit: '',
    //   category: 'Recovered',
    //   description: `Auto-recovered from blockchain (${metric.entryCount} entries)`
    // });
    
    console.log(`✅ Would recover: ${metric.original}`);
  } else {
    console.log(`⚠️  Cannot recover original for: ${metric.hex}`);
  }
}
```

## Testing Scenarios

### Scenario 1: Normal Operation (Mappings Exist)
1. Record a metric with Metric ID "test-metric"
2. Check localStorage - should see mapping stored
3. Call `discoverMetricIds()` - should recover "test-metric"

### Scenario 2: Metadata Lost (Mappings Still Exist)
1. Clear backend metadata (or switch dev/prod)
2. Call `discoverMetricIds()` - should still recover original strings
3. Recreate metadata with recovered IDs
4. Data should load from blockchain ✅

### Scenario 3: localStorage Cleared (Worst Case)
1. Clear localStorage: `localStorage.removeItem('kpi_metric_id_mappings')`
2. Call `discoverMetricIds()` - should still find hex IDs from blockchain
3. Original strings will be missing (shows as `undefined`)
4. User can manually try common metric IDs or use hex value

## Expected Results

### ✅ Success Case
```javascript
[
  {
    hex: "0x1234...",
    original: "mrr",  // ✅ Recovered from localStorage
    entryCount: 15
  },
  {
    hex: "0x5678...",
    original: "dau",  // ✅ Recovered
    entryCount: 30
  }
]
```

### ⚠️ Partial Success (localStorage cleared)
```javascript
[
  {
    hex: "0x1234...",
    original: undefined,  // ❌ Cannot recover
    entryCount: 15
  }
]
```

## Debugging

If discovery fails, check:

1. **Wallet connected?**
   ```javascript
   console.log('Wallet:', window.ethereum?.selectedAddress);
   ```

2. **Contract initialized?**
   ```javascript
   // Check if contract is available
   console.log('Contract:', kpiContractService.contract);
   ```

3. **Events query working?**
   ```javascript
   // Try querying events directly
   const filter = kpiContractService.contract.filters.MetricRecorded(walletAddress);
   const events = await kpiContractService.contract.queryFilter(filter, 0);
   console.log('Events found:', events.length);
   ```

4. **Check console logs**
   - Look for `[KPI Contract] Discovering metric IDs` logs
   - Check for any error messages

## Quick Test Script

Copy-paste this into browser console:

```javascript
(async function testRecovery() {
  console.log('🧪 Testing Data Recovery Mechanism...\n');
  
  // Get wallet address
  const accounts = await window.ethereum?.request({ method: 'eth_accounts' });
  if (!accounts || accounts.length === 0) {
    console.error('❌ No wallet connected');
    return;
  }
  const walletAddress = accounts[0];
  console.log('📍 Wallet:', walletAddress);
  
  // Check mappings
  const mappings = JSON.parse(localStorage.getItem('kpi_metric_id_mappings') || '{}');
  console.log('📦 Stored mappings:', Object.keys(mappings).length);
  console.log('   Mappings:', mappings);
  
  // Test discovery
  try {
    console.log('\n🔍 Discovering metric IDs from blockchain...');
    const discovered = await kpiContractService.discoverMetricIds(walletAddress);
    
    console.log(`\n✅ Found ${discovered.length} metric IDs:`);
    discovered.forEach((m, i) => {
      console.log(`\n  ${i + 1}. Hex: ${m.hex.substring(0, 20)}...`);
      console.log(`     Original: ${m.original || '❌ NOT RECOVERED'}`);
      console.log(`     Entries: ${m.entryCount || 0}`);
    });
    
    // Summary
    const recovered = discovered.filter(m => m.original).length;
    const total = discovered.length;
    console.log(`\n📊 Summary: ${recovered}/${total} recovered with original strings`);
    
  } catch (error) {
    console.error('❌ Discovery failed:', error);
  }
})();
```

## Next Steps After Testing

Once testing confirms it works:
1. ✅ Create recovery UI component
2. ✅ Add "Recover My Data" button
3. ✅ Auto-discover and bulk-recover metadata
4. ✅ Show recovery progress to user







