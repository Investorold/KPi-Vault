# 🎥 FHE KPI Vault - Demo Video Script

## Pre-Recording Checklist

✅ **Before You Start Recording:**
- [ ] Make sure Zama relayer is up (check https://status.zama.org)
- [ ] Have 2 MetaMask wallets ready (Owner + Viewer)
- [ ] Both wallets connected to Sepolia Testnet
- [ ] Both wallets have Sepolia ETH for gas fees
- [ ] Clear browser cache if needed
- [ ] Close unnecessary browser tabs
- [ ] Use screen recording software (OBS, Loom, or QuickTime)

---

## 📋 Demo Flow (5-7 minutes)

### **PART 1: Introduction (30 seconds)**

**What to Say:**
> "I'm demonstrating FHE KPI Vault, a privacy-preserving KPI tracking system built on Zama's FHEVM. It allows startups to share sensitive metrics with investors while keeping the actual values encrypted end-to-end."

**What to Show:**
- Landing page with app title
- Highlight the privacy-preserving aspect

---

### **PART 2: Connect Wallet & Setup (30 seconds)**

**What to Do:**
1. Click "Connect Wallet"
2. Select MetaMask
3. Choose Owner Wallet (first wallet)
4. Show connected address in header

**What to Say:**
> "First, I'll connect my wallet as the owner - this is the startup founder who wants to share KPIs with investors."

---

### **PART 3: Create Metric Metadata (1 minute)**

**What to Do:**
1. Go to "Add Metric Metadata" section
2. Fill in:
   - **Metric ID**: `revenue`
   - **Label**: `Monthly Revenue`
   - **Unit**: `USD`
   - **Category**: `Finance`
   - **Description**: `Our monthly recurring revenue`
3. Click "Save Metadata"
4. Show it appears in metadata list

**What to Say:**
> "I'll create a metric for monthly revenue. Metadata is stored in the backend - this is just descriptive information, not the sensitive values."

---

### **PART 4: Encrypt & Submit KPI Value (1-2 minutes)**

**What to Do:**
1. Go to "Encrypted KPI Entries" section
2. Fill in:
   - **Metric ID**: `revenue`
   - **Value**: `12500.50`
   - **Note**: `Q4 2024`
3. Click "Encrypt & Submit"
4. **IMPORTANT**: Show MetaMask popup and explain encryption happens client-side
5. Approve transaction
6. Wait for confirmation
7. Show entry appears as "Encrypted" in the metric card

**What to Say:**
> "Now I'll submit an encrypted KPI value. Notice how the value is encrypted BEFORE being sent to the blockchain using FHEVM. This transaction uses gas because we're storing encrypted data on-chain. The entry appears as 'Encrypted' - the actual value is hidden."

---

### **PART 5: Decrypt Entry (30 seconds)**

**What to Do:**
1. Click "Refresh entries" on the metric card
2. Find the encrypted entry
3. Click "Decrypt" button
4. Approve MetaMask transaction
5. Show decrypted value appears: `12,500.50 USD`
6. Show note appears: `Q4 2024`

**What to Say:**
> "To view the actual value, I decrypt it. This requires another transaction to the FHEVM relayer. Now we can see the real value: 12,500.50 USD."

---

### **PART 6: Submit Multiple Entries for Analytics (1 minute)**

**What to Do:**
1. Submit 2-3 more entries with different values:
   - Entry 2: Value `13500`, Note `Jan 2025`
   - Entry 3: Value `14200`, Note `Feb 2025`
2. Decrypt all entries
3. Show the analytical dashboard appears with:
   - Latest value
   - Change percentage
   - Trend chart
   - Sparkline

**What to Say:**
> "I'll add a few more entries to show the analytics features. Once decrypted, you can see trend charts, percentage changes, and growth streaks - all computed from the encrypted data."

---

### **PART 7: Grant Access to Viewer (1 minute)**

**What to Do:**
1. Scroll to "Access Control" section in metric card
2. Enter the Viewer Wallet address (second wallet address)
3. Click "Grant Access"
4. Approve MetaMask transaction
5. Show viewer appears in "Authorized Viewers" list

**What to Say:**
> "Now I'll grant access to an investor wallet. This is done on-chain through a smart contract call. The investor can now decrypt and view my encrypted KPIs, but only for metrics I've explicitly granted access to."

---

### **PART 8: Viewer Mode - Decrypting from Viewer Wallet (1-2 minutes)**

**What to Do:**
1. **Switch to Viewer Wallet** (disconnect owner, connect viewer)
2. Enter Owner Wallet address in "View as Viewer" input
3. Click "Load Viewer Metrics"
4. Show the metric appears (only the one with access)
5. Show entries are still encrypted
6. Click "Decrypt" on an entry
7. Approve transaction
8. Show decrypted value appears for the viewer
9. Show viewer can see the value but couldn't see it before access was granted

**What to Say:**
> "Let me switch to the investor's wallet. I'll enter the owner's address and load metrics. Notice I can only see metrics I've been granted access to. The entries are still encrypted. After decrypting, I can see the actual values - this is the privacy-preserving aspect in action."

---

### **PART 9: Submit Feedback from Viewer (30 seconds)**

**What to Do:**
1. While in viewer mode, find a decrypted entry
2. Fill in feedback text in the feedback section
3. Click "Submit Feedback"
4. Show success message

**What to Say:**
> "The investor can submit encrypted feedback on the metrics they're viewing, which will notify the owner."

---

### **PART 10: Switch Back to Owner - View Notifications (1 minute)**

**What to Do:**
1. **Switch back to Owner Wallet**
2. Click the **Notification Bell** icon (🔔) in the header
3. Show notification panel opens
4. Show "New Feedback" notification appears
5. Show the feedback from the viewer

**What to Say:**
> "When I switch back to the owner wallet, I can see a notification badge indicating new feedback. The notification system alerts me when thresholds are passed or when investors submit feedback."

---

### **PART 11: Alert System (Optional - 1 minute)**

**What to Do (if time permits):**
1. Show "Alerts" section
2. Create an alert rule (e.g., "Notify when revenue > 15000")
3. Explain that alerts trigger when thresholds are crossed

**What to Say:**
> "You can also set up alert rules that notify you when KPIs cross certain thresholds, all while the data remains encrypted."

---

### **PART 12: Closing (30 seconds)**

**What to Show:**
- Summary view of the app
- Highlight the key features

**What to Say:**
> "FHE KPI Vault combines blockchain immutability with fully homomorphic encryption, allowing startups to share sensitive metrics with investors while maintaining privacy. All data is encrypted end-to-end, and access control is managed on-chain. Thank you for watching!"

---

## 🎬 Recording Tips

1. **Screen Resolution**: Record at 1920x1080 for best quality
2. **Browser Zoom**: Set browser zoom to 80-90% so UI elements fit better
3. **Slow Down**: Take your time - don't rush through steps
4. **Highlight Cursor**: Enable cursor highlighting if your recording software supports it
5. **Test First**: Do a dry run before recording to ensure everything works
6. **Pause for Transactions**: Wait for blockchain transactions to complete before continuing
7. **Show MetaMask**: Keep MetaMask visible during transactions to show the encryption/decryption process

## 🔑 Key Points to Emphasize

1. ✅ **Encryption happens client-side** before blockchain storage
2. ✅ **Selective disclosure** - only grant access to specific metrics
3. ✅ **On-chain access control** - managed by smart contracts
4. ✅ **Privacy-preserving analytics** - compute trends from encrypted data
5. ✅ **Real-world use case** - startup sharing KPIs with investors

## 📝 Quick Reference: Wallet Addresses

**Owner Wallet**: `[Your Owner Address]`  
**Viewer Wallet**: `[Your Viewer Address]`  

**Contract Address**: `0xCa82F1d0BBA127F4cC3A8881ea5991275A9E8Db5`  
**Live Demo**: `https://kpi-vault.zamataskhub.com`

---

## ⚠️ Troubleshooting During Recording

- **If encryption fails**: Check relayer status at https://status.zama.org
- **If transaction fails**: Make sure wallet has Sepolia ETH
- **If viewer can't see metrics**: Verify access was granted correctly
- **If decryption fails**: Wait a few seconds and try again (relayer warm-up)

Good luck with your demo! 🚀

