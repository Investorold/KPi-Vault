# FHE KPI Vault - User Guide

Complete guide for using the KPI Vault to manage and share encrypted KPIs.

## Getting Started

### 1. Connect Your Wallet

1. Install [MetaMask](https://metamask.io/) browser extension
2. Switch to **Sepolia Testnet** network
3. Click "Connect Wallet" in the KPI Vault
4. Approve the connection in MetaMask

**Note**: You need Sepolia ETH for transaction fees. Get testnet ETH from [Sepolia Faucet](https://sepoliafaucet.com/).

### 2. Create Your First KPI

1. **Define Metadata**:
   - Enter a unique Metric ID (e.g., "mrr", "dau", "revenue")
   - Add a label (e.g., "Monthly Recurring Revenue")
   - Specify unit (e.g., "USD", "Users")
   - Add category and description (optional)
   - Click "Save Metadata"

2. **Submit Encrypted Value**:
   - Enter the same Metric ID
   - Enter your KPI value (e.g., 12500.50)
   - Add an optional note (keep it short - under 8 characters)
   - Click "Encrypt & Submit"
   - Approve the transaction in MetaMask

3. **View Your Metrics**:
   - Click "Refresh entries" on your metric card
   - Click "Decrypt" to view the decrypted value
   - Approve the decryption request in MetaMask

## Features

### Access Management

**Grant Access to Viewers**:
1. Open the "Access Control" section in your metric card
2. Enter the viewer's Ethereum address (0x...)
3. Click "Grant Access"
4. Approve the transaction in MetaMask

**Revoke Access**:
1. Find the viewer in the "Authorized Viewers" list
2. Click "Revoke"
3. Approve the transaction in MetaMask

**Note**: Viewers can decrypt and view your encrypted KPIs once granted access. You can revoke access at any time.

### Analytics Dashboard

For metrics with multiple decrypted entries, you'll see:

- **Latest Value**: Most recent KPI value
- **Change %**: Period-over-period change with trend indicator
- **Streak**: Consecutive growth entries
- **Trend Chart**: Visual representation of KPI over time
- **Sparkline**: Mini trend visualization

### Admin Management

If you deployed the contract, you're the initial admin. You can:

1. **View Admin Status**: Check the "ADMIN" badge in the header
2. **Add Admins**: Enter an address and click "Add Admin"
3. **Remove Admins**: Click "Remove" next to an admin address
4. **View Admin List**: See all current admins

**Note**: Admins can add/remove other admins. You cannot remove yourself.

## Best Practices

### Metric IDs

- Use lowercase, descriptive IDs (e.g., "mrr", "monthly_revenue")
- Keep IDs consistent - use the same ID for all entries of a metric
- Use underscores or hyphens, avoid spaces

### Notes

- Notes are encrypted but have size limitations (~8 characters)
- For longer notes, consider storing them off-chain or in metadata description
- Notes are optional - you can submit values without them

### Access Control

- Only grant access to trusted addresses
- Regularly review your authorized viewers
- Revoke access immediately when relationships change
- Remember: viewers can decrypt all historical entries once granted access

### Data Privacy

- All KPI values are encrypted on-chain using FHEVM
- Only you and authorized viewers can decrypt values
- Metadata (labels, descriptions) is stored off-chain in the backend
- Contract admins cannot decrypt your KPIs (they only manage the contract)

## Troubleshooting

### "Browser session is not cross-origin isolated"

**Cause**: Server not configured with required headers

**Solution**: 
- Ensure you're using the production build (`npm run preview:static`)
- Or deploy to a hosting service that supports COOP/COEP headers
- See [Deployment Guide](./DEPLOYMENT.md) for details

### "No Ethereum provider detected"

**Cause**: MetaMask not installed or not enabled

**Solution**:
- Install MetaMask browser extension
- Refresh the page
- Ensure MetaMask is unlocked

### "Failed to initialize FHEVM SDK"

**Cause**: SDK files not loading or headers missing

**Solution**:
- Check browser console for specific errors
- Verify WASM files are being served correctly
- Ensure COOP/COEP headers are set
- Try clearing browser cache

### Transaction Rejected

**Cause**: User rejected or insufficient funds

**Solution**:
- Ensure you have Sepolia ETH in your wallet
- Check network is set to Sepolia Testnet
- Approve transactions when MetaMask prompts

### Encrypted KPIs Not Showing

**Cause**: Metric ID mismatch or transaction not confirmed

**Solution**:
- Ensure the Metric ID matches exactly (case-sensitive)
- Wait for transaction confirmation
- Click "Refresh entries" to reload from blockchain
- Check transaction on Etherscan

### Can't Decrypt Entry

**Cause**: Not authorized or decryption request failed

**Solution**:
- Ensure you're the owner or have been granted access
- Check wallet is connected
- Approve the decryption signature request
- Try refreshing and decrypting again

## Advanced Usage

### Multiple Metrics

You can track multiple KPIs independently:
- Each metric has its own access control
- Viewers can be granted access to specific metrics only
- Analytics are calculated per metric

### Sharing with Investors

1. Create your KPI metadata
2. Submit encrypted values regularly
3. Grant access to investor's wallet address
4. They can decrypt and view your KPIs
5. Revoke access when needed

### Audit Trail

All encrypted submissions are:
- Timestamped on-chain
- Immutable (cannot be deleted)
- Verifiable via blockchain explorer
- Accessible to authorized viewers

## Support

For technical issues:
- Check browser console for errors
- Review [Deployment Guide](./DEPLOYMENT.md)
- Verify all configuration is correct

For contract-related questions:
- Check contract on Etherscan
- Review contract events
- Contact the contract deployer/admin

