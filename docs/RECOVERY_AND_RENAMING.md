# How Recovery and Renaming Works

## The Critical Point

**You CANNOT change the Metric ID** - it's the key that links metadata to encrypted data on the blockchain.

**You CAN change the LABEL** - it's just a display name for your convenience.

## Recovery Scenario

### Step 1: Discover Metrics from Blockchain
```
You click "Discover Metrics"
→ System finds: hex = "0x1234abcd..." (5 entries)
→ No original string found (localStorage was cleared)
```

### Step 2: System Creates Metadata
```
Metric ID = "1234abcd..." (the hex - this is the KEY)
Label = "Unknown Metric (1234abcd...)" (display name)
Unit = ""
Category = "Recovered (Hex Only)"
Description = "Auto-recovered from blockchain (5 entries)"
```

### Step 3: You Load and Decrypt Entries
```
You click "Load entries" for "Unknown Metric (1234abcd...)"
→ System queries blockchain using hex "1234abcd..."
→ Returns 5 encrypted entries
→ You decrypt them: $5000, $5200, $5400, $5600, $5800
→ You think: "Oh! This is my MRR data!"
```

### Step 4: You "Rename" (Actually Just Change the Label)
```
You click "Edit" on the metadata
→ Form opens with:
  - Metric ID = "1234abcd..." (DISABLED - cannot change!)
  - Label = "Unknown Metric (1234abcd...)" (you can edit this)
  
You change:
  - Metric ID = "1234abcd..." (stays the same - it's the key!)
  - Label = "MRR" (changed - just the display name)
  
You save
→ Metadata updated:
  - Metric ID = "1234abcd..." (unchanged - still links to encrypted data)
  - Label = "MRR" (changed - now shows a friendly name)
```

### Step 5: You Can Now Access Data with Friendly Name
```
In the UI, you see "MRR" instead of "Unknown Metric (1234abcd...)"
When you click "Load entries" on "MRR":
→ System uses Metric ID "1234abcd..." to query blockchain
→ Returns your 5 encrypted entries
→ You can decrypt and see: $5000, $5200, $5400, $5600, $5800
```

## Why This Works

The system uses the **Metric ID** (not the label) to:
1. Query encrypted entries from blockchain
2. Decrypt entries
3. Link metadata to encrypted data

The **Label** is just for display - it doesn't affect data access.

## Visual Flow

```
┌─────────────────────────────────────────┐
│  METADATA (Backend)                     │
├─────────────────────────────────────────┤
│  Metric ID: "1234abcd..."              │ ← KEY (cannot change)
│  Label: "MRR"                           │ ← Display name (can change)
│  Unit: "USD"                            │ ← Can change
│  Category: "Revenue"                   │ ← Can change
└─────────────────────────────────────────┘
           ↓ Uses Metric ID ↓
┌─────────────────────────────────────────┐
│  ENCRYPTED DATA (Blockchain)            │
├─────────────────────────────────────────┤
│  Query: getMetrics(address, "1234abcd...")│
│  Returns: 5 encrypted entries           │
│  - Entry #1: $5000 (encrypted)          │
│  - Entry #2: $5200 (encrypted)          │
│  - Entry #3: $5400 (encrypted)           │
│  - Entry #4: $5600 (encrypted)          │
│  - Entry #5: $5800 (encrypted)          │
└─────────────────────────────────────────┘
```

## What Happens If You Change Metric ID?

**DON'T DO THIS!** If you change the Metric ID:

```
Before:
  Metric ID = "1234abcd..." → Links to 5 encrypted entries ✅

After (WRONG):
  Metric ID = "mrr" → Links to NOTHING ❌
  (The encrypted data is still stored under "1234abcd..." on blockchain)
```

You would lose access to your encrypted data because:
- Encrypted data is stored under hex "1234abcd..." on blockchain
- Metadata now says Metric ID = "mrr"
- System queries blockchain with "mrr" → finds nothing
- Your data is still there, but you can't access it!

## Summary

✅ **What you CAN change:**
- Label (display name)
- Unit
- Category
- Description

❌ **What you CANNOT change:**
- Metric ID (it's the key to encrypted data)

**When "renaming" a recovered metric:**
- You're actually just changing the LABEL
- The Metric ID stays the same (the hex)
- This maintains the link to encrypted data on blockchain





