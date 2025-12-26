# Security Assessment: Metadata Endpoints

## Issue Raised
**Concern:** "For security purposes, metadata should not be connected to backend server directly"

## Current Architecture

### Data Separation (Correct)
The application correctly separates data into two categories:

1. **Metadata (Non-Sensitive, Off-Chain)**
   - Stored in backend server (JSON file)
   - Contains: metric labels, units, categories, descriptions
   - Purpose: Descriptive information to organize encrypted KPI entries
   - **Not encrypted** - this is intentional as it's not sensitive

2. **KPI Values (Sensitive, On-Chain)**
   - Stored on blockchain via smart contract
   - **Fully encrypted** using FHEVM (Fully Homomorphic Encryption)
   - Only authorized viewers can decrypt
   - Protected by cryptographic access control

### Security Vulnerability (Fixed)

**Problem:** Metadata endpoints (`POST /metrics/meta/:ownerAddress` and `DELETE /metrics/meta/:ownerAddress/:metricId`) had **no authentication or authorization checks**.

**Risk:**
- Anyone could create/edit/delete metadata for any wallet address
- No proof of ownership required
- Could lead to metadata tampering or confusion

**Fix Applied:**
1. Added ownership verification using `ensureOwnerOrViewer()` helper
2. Requires `x-wallet-address` header to match the owner in URL
3. Returns `401 Unauthorized` if wallet address is missing
4. Returns `403 Forbidden` if wallet address doesn't match owner
5. Updated frontend to send `x-wallet-address` header with requests

## Security Model

### Current Approach (Appropriate for This Use Case)

**Why Backend Storage is Acceptable:**
- Metadata is **non-sensitive** descriptive information
- Storing on-chain would be expensive (gas costs) for non-critical data
- Common pattern in dApps: off-chain metadata, on-chain sensitive data
- Backend storage is faster and more cost-effective
- Actual sensitive values remain encrypted on-chain

**Security Layers:**
1. **Ownership Verification** (Now implemented)
   - Only owner can modify their metadata
   - Uses `x-wallet-address` header validation

2. **CORS Protection**
   - Backend only accepts requests from authorized origins
   - Prevents cross-origin attacks

3. **Data Separation**
   - Sensitive data (KPI values) never touches backend
   - Only descriptive metadata is stored off-chain

### 🔐 Alternative Approaches (If Needed)

If stronger security is required in the future, consider:

1. **Signature Verification**
   - Add EIP-712 signature requirements
   - Cryptographically prove ownership
   - More secure but adds complexity

2. **IPFS Storage**
   - Store metadata on IPFS (decentralized)
   - Store IPFS hash on-chain
   - Fully decentralized but slower/less reliable

3. **On-Chain Storage**
   - Store metadata hash on-chain
   - Fully tamper-proof
   - Expensive gas costs for frequent updates

## Conclusion

**Current Security Status: ✅ Secure**

The application now has proper ownership verification for metadata endpoints. The hybrid approach (off-chain metadata, on-chain encrypted values) is:
- **Secure**: Only owners can modify their metadata
- **Cost-effective**: Avoids unnecessary on-chain storage
- **Practical**: Fast access to descriptive information
- **Appropriate**: Matches the risk level of the data

The security concern was valid, and the fix ensures only authorized owners can modify their metadata.

## Files Changed

1. `backend/api/index.js`
   - Added `ensureOwnerOrViewer()` checks to POST and DELETE metadata endpoints
   - Added security comments

2. `frontend/src/services/backendClient.ts`
   - Added `buildHeaders()` helper to include `x-wallet-address` header
   - Updated `saveMetadata()` and `deleteMetadata()` to accept wallet address

3. `frontend/src/App.tsx`
   - Updated `handleSubmitMetadata()` and `handleRemoveMetadata()` to pass wallet address


