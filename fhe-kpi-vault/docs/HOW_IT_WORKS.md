# How FHE KPI Vault Works

## Overview

FHE KPI Vault is a privacy-preserving KPI (Key Performance Indicator) tracking system that uses **Fully Homomorphic Encryption (FHE)** to store sensitive metrics on the blockchain. Only authorized viewers can decrypt and see the actual values.

## Two Types of Data

### 1. **Metadata (Plain Text - Stored in Backend)**

**What it is:**
- Plain text information about your metrics
- Stored in the backend database (not encrypted)
- Examples: metric name, unit (USD, Users), category, description

**Where it's stored:**
- Backend server (`/root/Zama/fhe-kpi-vault/backend/`)
- File: `metrics.json`

**How to use:**
1. Fill in the "Add Metric Metadata" form:
   - **Metric ID**: A unique identifier (e.g., `mrr`, `users`, `revenue`)
   - **Label**: Display name (e.g., "Monthly Recurring Revenue")
   - **Unit**: Unit of measurement (e.g., "USD", "Users")
   - **Category**: Grouping (e.g., "Revenue", "Growth")
   - **Description**: What this metric tracks

2. Click "Save Metadata"
   - This saves to the backend (no blockchain transaction needed)
   - You'll see it appear in "Metadata Overview" immediately

**Why it's plain text:**
- This is just descriptive information, not sensitive data
- It helps organize and label your encrypted KPI entries
- Anyone can see metadata, but only authorized viewers can decrypt values

---

### 2. **Encrypted KPI Entries (Encrypted - Stored on Blockchain)**

**What it is:**
- Actual KPI values (numbers) that are **encrypted** before being stored
- Stored on the Sepolia blockchain (Ethereum testnet)
- Only people you grant access to can decrypt and see the real values

**Where it's stored:**
- On-chain in the smart contract (`KpiManager.sol`)
- Each entry is encrypted using FHEVM (Fully Homomorphic Encryption Virtual Machine)

**How to use:**
1. Fill in the "Encrypted KPI Entries" form:
   - **Metric ID**: Must match a metadata entry you created (e.g., `mrr`)
   - **Value**: The actual number (e.g., `12450.23`)
   - **Note**: Optional text note (keep it short, ~8 characters max)

2. Click "Encrypt & Submit"
   - This triggers MetaMask to sign a transaction
   - The value is encrypted using FHEVM
   - The encrypted value is sent to the blockchain
   - You pay gas fees (on Sepolia testnet)

**What happens behind the scenes:**
1. Your browser encrypts the value using FHEVM SDK
2. MetaMask pops up asking you to sign the transaction
3. The encrypted value is sent to the smart contract
4. The transaction is mined on Sepolia
5. The entry appears in "Metric Streams" (still encrypted)

**To see the actual value:**
- Click "Decrypt" on an entry
- This triggers another MetaMask transaction
- The FHEVM relayer decrypts the value
- You see the real number (e.g., `12,450.23 USD`)

---

## Workflow Example

### Step 1: Create Metadata (Plain Text)
```
Metric ID: mrr
Label: Monthly Recurring Revenue
Unit: USD
Category: Revenue
Description: Our monthly subscription revenue
```
→ Click "Save Metadata" (no blockchain transaction)

### Step 2: Submit Encrypted KPI Value
```
Metric ID: mrr
Value: 12450.23
Note: Q1 2024
```
→ Click "Encrypt & Submit" (MetaMask transaction required)

### Step 3: View Encrypted Entry
- Entry appears in "Metric Streams" section
- Shows as "Encrypted" (you can't see the value yet)

### Step 4: Decrypt to See Value
- Click "Decrypt" button
- MetaMask transaction (for decryption permission)
- Value appears: `12,450.23 USD`
- Note appears: `Q1 2024`

### Step 5: Grant Access to Others
- Enter viewer's wallet address (e.g., `0x1234...`)
- Click "Grant Access"
- That person can now decrypt and see your KPI values

---

## Key Concepts

### **Why Two Separate Systems?**

1. **Metadata (Backend)**: 
   - Fast to read/write
   - No gas fees
   - Easy to update
   - Used for organizing and displaying information

2. **Encrypted Values (Blockchain)**:
   - Immutable (can't be changed once submitted)
   - Verifiable (on-chain proof of when values were recorded)
   - Private (encrypted, only authorized viewers can decrypt)
   - Decentralized (stored on blockchain, not just one server)

### **Access Control**

- **Owner**: The person who submits KPI values (you)
- **Viewers**: People you grant access to (they can decrypt your values)
- **Admins**: Can add/remove other admins (for contract management)

### **Encryption Process**

1. Your browser uses FHEVM SDK to encrypt the value
2. Creates an "encrypted handle" (a reference to the encrypted data)
3. Sends the handle to the smart contract (not the actual value)
4. The contract stores the handle on-chain
5. To decrypt, you request the FHEVM relayer to decrypt using your private key

---

## Common Questions

### "Why can't I see my values immediately after submitting?"

Values are encrypted. You need to click "Decrypt" to see them. This is by design for privacy.

### "What's the difference between 'Save Metadata' and 'Encrypt & Submit'?"

- **Save Metadata**: Saves plain text info about your metric (name, unit, etc.) to the backend
- **Encrypt & Submit**: Encrypts and stores an actual KPI value on the blockchain

### "Why do I need to click 'Decrypt' every time?" 

Each decryption requires a permission signature (for security). The decrypted value is cached in your browser session, but refreshing the page will require decrypting again.

### "Can I edit or delete encrypted entries?"

No. Once submitted to the blockchain, entries are immutable. You can add new entries with updated values, but you cannot modify or delete old ones. This ensures a verifiable history.

### "What if I forget my Metric ID?"

Check the "Metadata Overview" section - it lists all your configured metrics with their IDs.

---

## Troubleshooting

### "Encrypt & Submit button doesn't trigger MetaMask"

1. Make sure your wallet is connected (top right should show your address)
2. Check browser console for errors
3. Disable other wallet extensions (Phantom, etc.) that might conflict
4. Try refreshing the page and reconnecting your wallet

### "I see 'Encrypted' but can't decrypt"

1. Make sure you're connected with the same wallet that submitted the entry
2. Check that you're on Sepolia testnet
3. Ensure FHEVM is initialized (check console for errors)

### "Note field shows weird characters"

Notes are limited to ~8 ASCII characters due to 64-bit encryption limits. Keep notes short!

---

## Summary

- **Metadata** = Plain text labels/descriptions (backend, no blockchain)
- **Encrypted Entries** = Actual KPI values (blockchain, encrypted)
- **Workflow**: Create metadata → Submit encrypted values → Decrypt to view → Grant access to others

The app combines the convenience of a backend database (for metadata) with the security and verifiability of blockchain (for encrypted values).

---

## New Additions (Investor Feedback, Alerts, Shareboards)

- **Investor Feedback:** Authorized viewers can leave encrypted notes tied to a specific KPI entry. Use the new “Investor Feedback” panel on the dashboard to load a thread (owner + metric + entry) and submit comments. The backend stores ciphertext + commitment so owners can verify provenance.

- **Automated Alerts:** Define threshold/delta rules per metric in the “Automated Alerts” card. The backend keeps alert configs, subscriptions (email and in-app), and trigger logs while the smart contract records commitments/events. Run the optional worker (`cd backend && npm run alerts`) so new KPI entries are decrypted automatically and alert triggers are emitted without manual steps.

- **Shareboards (Shared Dashboards):** Curate a set of metrics/notes for stakeholders with configurable access modes (wallet allowlist, token, or public snapshot). Shareboards reuse on-chain ACLs but expose a clean, read-only UI via `/shareboards/view/:id`.

These features layer on top of the core workflow without compromising the encrypted KPI history—owners stay in control of who can decrypt, comment, or receive automated updates.


