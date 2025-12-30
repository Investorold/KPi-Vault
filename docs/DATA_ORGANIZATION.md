# How Data is Organized in KPI Vault

## Simple Explanation: Think of it Like a Filing Cabinet

Imagine you have a filing cabinet with drawers. Each drawer is labeled with a **Metric ID**.

```
┌─────────────────────────────────────────┐
│  Your Wallet Address: 0x999d...         │
├─────────────────────────────────────────┤
│                                         │
│  Drawer 1: "mrr" (Metric ID)            │
│  ┌─────────────────────────────────┐   │
│  │ Entry 1: $5000 (encrypted)      │   │
│  │ Entry 2: $5200 (encrypted)      │   │
│  │ Entry 3: $5400 (encrypted)      │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Drawer 2: "users" (Metric ID)         │
│  ┌─────────────────────────────────┐   │
│  │ Entry 1: 1000 users (encrypted) │   │
│  │ Entry 2: 1050 users (encrypted) │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Drawer 3: "revenue" (Metric ID)        │
│  ┌─────────────────────────────────┐   │
│  │ Entry 1: $10000 (encrypted)     │   │
│  │ Entry 2: $11000 (encrypted)     │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

## How the Smart Contract Stores Data

The contract uses this structure:
```solidity
mapping(address => mapping(uint256 => EncryptedMetric[])) private metrics;
```

This means:
- **First key**: Your wallet address (0x999d...)
- **Second key**: Metric ID (converted to a number like 0x1234...)
- **Value**: Array of encrypted entries for that specific metric

**Important**: Each metric ID has its OWN separate array. They are NEVER mixed together!

## Example: You Have 3 Metrics

### Scenario: You created 3 metrics

1. **"mrr"** → Converted to hex: `0x1234abcd...`
   - All your MRR entries go here
   - Query: `getMetrics(yourAddress, 0x1234abcd...)`
   - Returns: Only MRR entries, nothing else

2. **"users"** → Converted to hex: `0x5678efgh...`
   - All your user count entries go here
   - Query: `getMetrics(yourAddress, 0x5678efgh...)`
   - Returns: Only user entries, nothing else

3. **"revenue"** → Converted to hex: `0x9abc1234...`
   - All your revenue entries go here
   - Query: `getMetrics(yourAddress, 0x9abc1234...)`
   - Returns: Only revenue entries, nothing else

## How We Know Which Data is Which

### Method 1: Blockchain Events (Automatic Discovery)

When you submit data, the contract emits an event:
```
MetricRecorded(owner=0x999d..., metricId=0x1234abcd..., timestamp=..., entryIndex=0)
```

We can query ALL these events to find:
- Which metricIds exist for your wallet
- How many entries each metricId has
- When each entry was created

**This is how `discoverMetricIds()` works!**

### Method 2: The Metric ID is the Key

The metric ID **separates** the data. It's like a label on each drawer:
- Drawer labeled "mrr" → Only MRR data inside
- Drawer labeled "users" → Only user data inside
- Drawer labeled "revenue" → Only revenue data inside

**You don't need to decrypt to know which drawer is which** - the metric ID tells you!

## What Happens If You Lose the Original String?

### If you remember the original string (e.g., "mrr"):
1. ✅ We convert "mrr" → hex (0x1234abcd...)
2. ✅ We query entries for that hex
3. ✅ We get all MRR entries
4. ✅ We can decrypt and see the values
5. ✅ We know it's MRR because you told us the name

### If you DON'T remember the original string:
1. ✅ We find the hex from blockchain events (e.g., 0x1234abcd...)
2. ✅ We query entries for that hex
3. ✅ We get all entries (but we don't know what they represent)
4. ✅ We can decrypt and see the values
5. ❓ We don't know it's "MRR" until you decrypt and recognize the pattern

**Solution**: We create metadata with a placeholder name like "Unknown Metric (0x1234...)". You can:
- Decrypt the entries
- See the values (e.g., "$5000, $5200, $5400")
- Recognize "Oh, this is my MRR data!"
- Rename the metadata to "MRR"

## Visual Flow: Recovery Process

```
Step 1: Query Blockchain Events
    ↓
Find all MetricRecorded events for your wallet
    ↓
Result: Found 3 metricIds:
  - 0x1234abcd... (5 entries)
  - 0x5678efgh... (3 entries)
  - 0x9abc1234... (8 entries)
    ↓
Step 2: Check localStorage for Original Strings
    ↓
Found mappings:
  - 0x1234abcd... → "mrr" ✅
  - 0x5678efgh... → "users" ✅
  - 0x9abc1234... → (not found) ❌
    ↓
Step 3: Create Metadata
    ↓
For "mrr" and "users": Use original names ✅
For 0x9abc1234...: Use placeholder "Unknown Metric (0x9abc...)" ⚠️
    ↓
Step 4: You Can Now Access All Data
    ↓
- "mrr" → Query → Decrypt → See MRR values ✅
- "users" → Query → Decrypt → See user counts ✅
- "Unknown Metric (0x9abc...)" → Query → Decrypt → See values → Recognize → Rename ✅
```

## Key Points

1. **Data is separated by Metric ID** - Each metric has its own "drawer"
2. **We don't need to decrypt to know which is which** - The metric ID is the label
3. **Blockchain events tell us what exists** - We can discover all your metrics automatically
4. **If we lose the original string, we can still access data** - Just with a placeholder name
5. **You can rename later** - After decrypting and recognizing the data

## Why This Works

The smart contract structure ensures:
- ✅ Each metric ID is stored separately
- ✅ No mixing of data between metrics
- ✅ We can query specific metrics by ID
- ✅ We can discover all metrics from events
- ✅ Data is always recoverable (it's on-chain forever)





