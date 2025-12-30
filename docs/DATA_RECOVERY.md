# KPI Vault - Data Recovery Guide

## How Data Storage Works

### Two Separate Systems:

1. **Encrypted Data (On-Chain)**
   - Stored permanently on the blockchain via smart contract
   - Never lost, even if backend metadata is deleted
   - Requires: Wallet address + Metric ID to access

2. **Metadata (Backend)**
   - Stored in backend JSON files (`metrics.json` or `metrics.dev.json`)
   - Just labels/descriptions for display
   - Can be recreated at any time

## Why Your Data Appeared

When you created metadata with the same Metric ID you used before:
- ✅ The system queried the blockchain for that Metric ID
- ✅ Found all your encrypted entries from before
- ✅ Displayed them because the Metric ID matched

**The data was never lost - it was always on-chain!**

## How to Recover More Data

### If You Remember Your Metric IDs:

1. **Create Metadata** with the Metric ID you remember
2. **Save it** - this creates the metadata entry
3. **Load Metrics** - the system will automatically fetch all encrypted entries from the blockchain
4. **All your data appears!** 🎉

### If You Don't Remember Metric IDs:

The encrypted data is still on-chain, but you need the exact Metric ID to access it.

**Options:**
1. Check your transaction history on Etherscan
2. Look for old screenshots or notes with Metric IDs
3. Check browser history/localStorage (if you saved them)
4. Query the contract directly (advanced)

## Important Notes

- **Data is permanent** - Once encrypted and stored on-chain, it cannot be deleted
- **Metadata is temporary** - Can be lost, but can always be recreated
- **Metric ID must match exactly** - Case-sensitive, must be the exact same string
- **Wallet address must match** - Data is tied to the wallet that submitted it

## Recovery Process

```
1. Connect your wallet (same one that submitted the data)
2. Create new metadata with your old Metric ID
3. System automatically loads encrypted entries from blockchain
4. Your data appears! ✅
```

## Before Security Implementations

Any data submitted before the dev/prod separation is still accessible if you:
- Know the Metric ID
- Use the same wallet address
- Create metadata with that Metric ID

The data was never lost - it just needed the metadata entry to display it!








