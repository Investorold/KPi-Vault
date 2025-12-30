# Metadata vs Encrypted Data - What Can Be Changed?

## Important Distinction

There are **TWO separate things** stored in different places:

### 1. **Encrypted Data (On Blockchain) - PERMANENT** 🔒
- **Where**: Stored on the Sepolia blockchain in the smart contract
- **What**: The actual encrypted KPI values (numbers)
- **Can it be changed?**: ❌ **NO - It's permanent and immutable**
- **Example**: 
  - Entry #1: $5000 (encrypted)
  - Entry #2: $5200 (encrypted)
  - Entry #3: $5400 (encrypted)

Once these are stored on-chain, they **cannot be modified or deleted**. This is by design - blockchain is immutable.

### 2. **Metadata (In Backend) - CAN BE CHANGED** 📝
- **Where**: Stored in backend JSON file (`metrics.json` or `metrics.dev.json`)
- **What**: Just labels, descriptions, and organizational info
- **Can it be changed?**: ✅ **YES - It's just descriptive information**
- **Example**:
  - Metric ID: `"mrr"` (this links to encrypted data)
  - Label: `"Monthly Recurring Revenue"` ← **You can change this**
  - Unit: `"USD"` ← **You can change this**
  - Category: `"Revenue"` ← **You can change this**
  - Description: `"Our monthly recurring revenue"` ← **You can change this**

## Why Edit Metadata?

### Scenario 1: Fix Typos
```
Before: Label = "Montly Recurring Revenue" (typo)
After:  Label = "Monthly Recurring Revenue" (fixed)
```
The encrypted data doesn't change - just the label.

### Scenario 2: Reorganize Categories
```
Before: Category = "Revenue"
After:  Category = "Growth Metrics"
```
The encrypted data doesn't change - just how you organize it.

### Scenario 3: Update Units
```
Before: Unit = "USD"
After:  Unit = "$"
```
The encrypted data doesn't change - just how it's displayed.

### Scenario 4: Recover and Rename
```
Before: 
  Metric ID = "1234abcd..." (hex - this is the KEY, cannot change)
  Label = "Unknown Metric (1234abcd...)" (recovered from blockchain)
  
After:  
  Metric ID = "1234abcd..." (SAME - must stay the same!)
  Label = "MRR" (you decrypted, recognized it, and renamed the LABEL)
```

**Important**: You're renaming the LABEL (display name), NOT the Metric ID. The Metric ID must stay as the hex to maintain the link to encrypted data.

**How it works:**
1. You discover metric from blockchain → hex = "0x1234abcd..."
2. System creates metadata with:
   - Metric ID = "1234abcd..." (the hex, this is the KEY)
   - Label = "Unknown Metric (1234abcd...)" (display name)
3. You decrypt entries and see: $5000, $5200, $5400
4. You recognize: "Oh, this is my MRR data!"
5. You edit metadata:
   - Metric ID = "1234abcd..." (unchanged - this is the key!)
   - Label = "MRR" (changed - just the display name)
6. Now you can load entries using "1234abcd..." and see them labeled as "MRR"

## What CANNOT Be Changed

### ❌ Metric ID
- The Metric ID is the **key** that links metadata to encrypted data
- If you change it, you lose the connection to your encrypted entries
- Example: If encrypted data is stored under `"mrr"`, the metadata must also use `"mrr"`

### ❌ Encrypted Values
- Once stored on blockchain, values are permanent
- You can only add new entries, not modify existing ones

### ❌ Entry Timestamps
- Timestamps are part of the encrypted entry structure
- They cannot be changed after submission

## Visual Example

```
┌─────────────────────────────────────────┐
│  METADATA (Backend - Can Edit)          │
├─────────────────────────────────────────┤
│  Metric ID: "mrr"                       │ ← Cannot change (it's the key)
│  Label: "Monthly Recurring Revenue"     │ ← ✅ Can edit
│  Unit: "USD"                            │ ← ✅ Can edit
│  Category: "Revenue"                   │ ← ✅ Can edit
│  Description: "Our MRR"                 │ ← ✅ Can edit
└─────────────────────────────────────────┘
           ↓ Links to ↓
┌─────────────────────────────────────────┐
│  ENCRYPTED DATA (Blockchain - Permanent)│
├─────────────────────────────────────────┤
│  Entry #1: $5000 (encrypted)            │ ← ❌ Cannot change
│  Entry #2: $5200 (encrypted)            │ ← ❌ Cannot change
│  Entry #3: $5400 (encrypted)            │ ← ❌ Cannot change
└─────────────────────────────────────────┘
```

## Summary

- **Edit Metadata** = Change labels, descriptions, units, categories
- **Edit Metadata** ≠ Change encrypted values (impossible)
- **Edit Metadata** ≠ Change Metric ID (would break the link)

The edit function is useful for:
1. ✅ Fixing typos in labels
2. ✅ Reorganizing categories
3. ✅ Updating display units
4. ✅ Renaming recovered metrics after you identify them
5. ✅ Improving descriptions

It does NOT allow you to:
1. ❌ Change encrypted values (they're on blockchain)
2. ❌ Change Metric ID (it's the key)
3. ❌ Delete encrypted entries (blockchain is immutable)

