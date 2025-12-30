# Data Availability Fix - Solving the CIA Triad Availability Breach

## The Problem

**Critical Issue**: When metadata is lost (dev/prod switch, backend reset, etc.), users lose access to their encrypted data even though it's permanently stored on-chain.

**Root Cause**: 
- Encrypted data is stored on-chain (permanent)
- Metadata (including Metric IDs) is stored in backend (temporary)
- Users need the **exact Metric ID string** to access their data
- If metadata is lost, users can't remember their Metric IDs → **Data becomes inaccessible**

**Impact**: 
- Violates CIA Triad **Availability** principle
- Affects all users (not just developers)
- Users with multiple projects can't remember all Metric IDs
- Data exists but is inaccessible = availability breach

## The Solution

### 1. **Automatic Metric ID Mapping Storage**

When users record metrics, we now automatically store:
- **Original Metric ID string** → **Encoded hex value** mapping
- Stored in `localStorage` as backup
- Persists across sessions

**Implementation**: 
- `kpiContractService.storeMetricIdMapping()` called automatically when recording metrics
- Stored in `localStorage` key: `kpi_metric_id_mappings`

### 2. **Blockchain Event Discovery**

New function: `discoverMetricIds(ownerAddress)`
- Queries all `MetricRecorded` events for a wallet
- Extracts unique encoded metric IDs from blockchain
- Attempts to recover original strings from localStorage mappings
- Returns discovered metric IDs with entry counts

**How it works**:
```typescript
const discovered = await kpiContractService.discoverMetricIds(walletAddress);
// Returns: [{ hex: "0x...", original: "mrr", entryCount: 15 }, ...]
```

### 3. **Recovery Workflow**

1. **User connects wallet**
2. **System queries blockchain events** → Finds all encoded metric IDs
3. **System matches with stored mappings** → Recovers original strings
4. **System auto-creates metadata** for discovered metric IDs
5. **Data becomes accessible again!** ✅

### 4. **Fallback for Lost Mappings**

If localStorage is cleared:
- System still discovers encoded metric IDs from events
- Shows "Unknown Metric ID: 0x..." 
- Users can manually try common metric IDs
- Or use recovery UI to bulk-recover

## Implementation Details

### Files Modified

1. **`frontend/src/services/kpiContractService.ts`**:
   - Added `discoverMetricIds()` function
   - Added `storeMetricIdMapping()` function
   - Auto-stores mappings when recording metrics
   - Added `MetricRecorded` event to ABI

2. **Storage**:
   - `localStorage.getItem('kpi_metric_id_mappings')`
   - Format: `{ "0x...": "original-metric-id", ... }`

### Usage Example

```typescript
// Automatic - happens when recording metrics
await kpiContractService.recordMetric({ metricId: "mrr", value: 1000 });
// Mapping automatically stored: "0x..." → "mrr"

// Recovery - discover all metric IDs
const discovered = await kpiContractService.discoverMetricIds(walletAddress);
// discovered = [
//   { hex: "0xabc...", original: "mrr", entryCount: 15 },
//   { hex: "0xdef...", original: "dau", entryCount: 30 }
// ]

// For each discovered metric, create metadata to recover data
for (const metric of discovered) {
  if (metric.original) {
    // Create metadata with original metric ID
    await backendClient.createMetadata(walletAddress, {
      metricId: metric.original,
      label: `Recovered: ${metric.original}`,
      // ... other fields
    });
    // Data automatically loads from blockchain!
  }
}
```

## Benefits

✅ **Solves Availability Problem**: Users can recover data without remembering Metric IDs
✅ **Automatic**: No user action required - mappings stored automatically
✅ **Persistent**: localStorage survives page reloads
✅ **Blockchain-Based Discovery**: Even if localStorage is cleared, we can still discover metric IDs
✅ **Backward Compatible**: Works with existing data

## Limitations

⚠️ **localStorage can be cleared**: If user clears browser data, mappings are lost
- **Mitigation**: Blockchain event discovery still works, just can't recover original strings
- **Future**: Could sync mappings to backend as backup

⚠️ **One-way hash**: Can't reverse `ethers.id(metricId)` to get original string
- **Mitigation**: Store mappings proactively
- **Fallback**: Show hex value, let users manually try common IDs

## Next Steps

1. ✅ **Automatic mapping storage** - DONE
2. ✅ **Event-based discovery** - DONE
3. ⏳ **Recovery UI component** - TODO
4. ⏳ **Backend sync for mappings** - TODO (optional)
5. ⏳ **Bulk recovery endpoint** - TODO

## Testing

To test the recovery mechanism:

1. Record some metrics with known Metric IDs
2. Clear backend metadata (or switch dev/prod)
3. Call `discoverMetricIds(walletAddress)`
4. Verify original Metric IDs are recovered
5. Create metadata with recovered IDs
6. Verify data loads from blockchain

## Security Considerations

- ✅ Mappings stored locally (not sent to backend)
- ✅ No sensitive data in mappings (just Metric ID strings)
- ✅ Blockchain events are public anyway
- ✅ Users can only discover their own metric IDs (filtered by wallet address)







