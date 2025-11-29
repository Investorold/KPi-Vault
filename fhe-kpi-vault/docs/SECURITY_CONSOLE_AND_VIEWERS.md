# Security Guide: Browser Console & Viewer Mode 🔒

## Your Questions Answered

### 1. Is it safe for values to be exposed in the browser console?

**Short Answer:** Currently, **decrypted values are NOT logged to console**, but there are some security considerations.

---

## What's Currently Logged to Console (Safe)

### ✅ Safe - Not Sensitive:
- **Metric IDs** (e.g., `"revenue"`, `"users"`) - These are just labels
- **Encoded Metric IDs** (e.g., `"103440835631677484504289133413857661716343392137124352829588867199056428014608"`) - These are public
- **Transaction Hashes** (e.g., `0xd5a9f51bf517859a5d69faf508fca40228b6d0f44ea7de93d1a8f42d07a5e16b`) - These are public blockchain data
- **Entry Counts** (e.g., "Found 3 entries") - Not sensitive
- **Wallet Addresses** (e.g., `0x999d9417141FBa7eF7272589C0D26975D2FF4107`) - These are public on blockchain
- **Error Messages** - Debugging info, not sensitive data
- **Loading/Querying Status** - Just process info

### ⚠️ What's NOT Logged (Good!):
- **Decrypted Values** - Your actual numbers (e.g., `1000`, `2500`) are NOT logged
- **Decrypted Notes** - Your notes are NOT logged
- **Encrypted Handles** - The encrypted data itself is NOT logged

---

## Security Concerns & Recommendations

### Current State:
1. **Decrypted values are stored in React state** (browser memory)
   - They're NOT logged to console ✅
   - They're only in memory during your session
   - They disappear when you close the browser

2. **However, if someone has access to your browser console**, they could potentially:
   - Access React DevTools to see component state
   - Run JavaScript to access the state
   - Extract decrypted values from memory

### Is This a Problem?

**For most users: NO** - because:
- Console access requires physical access to your computer OR
- Someone would need to inject malicious code into the page
- This is a standard pattern for web apps (data in memory)

**For high-security scenarios: YES** - you should:
- Remove all console logs in production
- Consider server-side decryption
- Use additional encryption layers

---

## Recommendations

### For Production Deployment:

1. **Remove Debug Console Logs:**
   ```typescript
   // Instead of: console.log('[KPI Vault] Loaded entries:', ...)
   // Use: Only log in development mode
   if (process.env.NODE_ENV === 'development') {
     console.log('[KPI Vault] Loaded entries:', ...);
   }
   ```

2. **Never Log Decrypted Values:**
   - ✅ Current code does NOT log decrypted values
   - ✅ Keep it that way!

3. **Consider Environment-Based Logging:**
   - Development: Full logging for debugging
   - Production: Minimal or no logging

---

## What "Viewers Only" Means

### Viewer Mode Explained:

**"Viewers"** are people you **grant access** to see your encrypted metrics.

### How It Works:

#### Step 1: You (Owner) Grant Access
1. You create encrypted metrics (your business numbers)
2. You go to "Access Control" section
3. You enter a viewer's wallet address (e.g., `0x1234...`)
4. You click "Grant Access"
5. ✅ That person can now decrypt and see your numbers

#### Step 2: Viewer Accesses Your Data
1. Viewer connects their wallet
2. Viewer clicks "Enter Viewer Mode"
3. Viewer enters YOUR wallet address (the owner)
4. Viewer clicks "Load Metrics"
5. Viewer sees your metric metadata
6. Viewer clicks "Decrypt" on entries
7. ✅ Viewer sees your actual numbers (if you granted access)

---

## Viewer Mode Security

### Who Can Be a Viewer?
- **Anyone you grant access to** via their wallet address
- Typically: Investors, partners, advisors, team members

### What Can Viewers See?
- ✅ **Metric Metadata** (labels, units, categories) - This is public anyway
- ✅ **Encrypted Entries** - They see `🔒 Encrypted` until they decrypt
- ✅ **Decrypted Values** - Only if you granted them access AND they click "Decrypt"

### What Can Viewers NOT Do?
- ❌ **Submit new entries** - Only you (owner) can do that
- ❌ **Grant access to others** - Only you (owner) can do that
- ❌ **Revoke access** - Only you (owner) can do that
- ❌ **See entries without access** - They can't decrypt if you didn't grant access

### Access Control:
- **Per-Metric**: You grant access per metric, not all-or-nothing
- **Revocable**: You can revoke access anytime
- **Blockchain-Enforced**: Access is checked on-chain before decryption

---

## Real-World Example

### Scenario: You're a Startup Founder

**You (Owner):**
1. Create metric: "Monthly Revenue" (ID: `revenue`)
2. Submit encrypted values: Week 1 = $10,000, Week 2 = $15,000
3. Grant access to Investor A (wallet: `0xInvestorA...`)
4. Grant access to Investor B (wallet: `0xInvestorB...`)

**Investor A (Viewer):**
1. Connects wallet (`0xInvestorA...`)
2. Enters Viewer Mode
3. Enters your wallet address
4. Loads metrics
5. Sees "Monthly Revenue" metric
6. Clicks "Decrypt" on entries
7. ✅ Sees: $10,000, $15,000 (because you granted access)

**Investor B (Viewer):**
1. Connects wallet (`0xInvestorB...`)
2. Enters Viewer Mode
3. Enters your wallet address
4. Loads metrics
5. Sees "Monthly Revenue" metric
6. Clicks "Decrypt" on entries
7. ✅ Sees: $10,000, $15,000 (because you granted access)

**Random Person (No Access):**
1. Connects wallet (`0xRandom...`)
2. Enters Viewer Mode
3. Enters your wallet address
4. Loads metrics
5. Sees "Monthly Revenue" metric (metadata is public)
6. Clicks "Decrypt" on entries
7. ❌ **ERROR**: "You do not have access to decrypt this metric"
8. Cannot see your numbers!

---

## Security Best Practices

### For Owners:
1. ✅ **Only grant access to trusted people**
   - Verify wallet addresses carefully
   - Double-check before granting access

2. ✅ **Revoke access if needed**
   - If someone leaves or becomes untrusted
   - They can't decrypt NEW entries after revocation
   - (They might have already decrypted old ones)

3. ✅ **Use separate metrics for different viewers**
   - Business 1 metrics → Grant to Investor A only
   - Business 2 metrics → Grant to Investor B only
   - Don't share everything with everyone

4. ✅ **Don't share your wallet private key**
   - Keep your MetaMask seed phrase secret
   - Only you should be able to submit entries

### For Viewers:
1. ✅ **Respect privacy**
   - Don't share decrypted values with others
   - Don't screenshot and share without permission

2. ✅ **Verify you have access**
   - If you can't decrypt, ask the owner to grant access
   - Don't try to hack or bypass access control

---

## Console Access Security

### Can Someone Access Browser Console?

**Yes, but it requires:**
1. **Physical access** to your computer, OR
2. **Remote access** (if you're screen-sharing), OR
3. **Malicious code injection** (if someone hacks the website)

### What Can They See?

**If they have console access:**
- ✅ They can see console logs (but decrypted values aren't logged)
- ⚠️ They can potentially access React state via DevTools
- ⚠️ They can run JavaScript to extract data from memory

### How to Protect Yourself:

1. **Don't leave your computer unlocked**
   - Lock your screen when away
   - Use password protection

2. **Don't share your screen** with untrusted people
   - Be careful on video calls
   - Don't let others see your browser

3. **Use incognito/private mode** for sensitive sessions
   - Data is cleared when you close the window
   - No history or cookies saved

4. **Close the browser** when done
   - Clears memory
   - Decrypted values are gone

5. **For production, remove console logs**
   - Less information exposed
   - Harder for attackers to understand the app

---

## Summary

### Console Logs:
- ✅ **Currently safe** - Decrypted values are NOT logged
- ⚠️ **Recommendation** - Remove debug logs in production
- ⚠️ **Memory** - Decrypted values are in browser memory (standard for web apps)

### Viewer Mode:
- ✅ **Secure** - Access is blockchain-enforced
- ✅ **Controlled** - You decide who can see what
- ✅ **Revocable** - You can revoke access anytime
- ✅ **Per-Metric** - Grant access per metric, not all-or-nothing

### Best Practices:
- ✅ Only grant access to trusted people
- ✅ Lock your computer when away
- ✅ Don't share your screen with untrusted people
- ✅ Close browser when done with sensitive work
- ✅ Remove console logs in production

---

## Quick Answers

**Q: Is it safe for values to be in browser console?**
A: Decrypted values are NOT in console logs. They're only in browser memory, which is standard for web apps. For high security, remove console logs in production.

**Q: Can someone access browser console and extract data?**
A: Only if they have physical/remote access to your computer. Protect yourself by locking your screen and not sharing your browser.

**Q: What does "Viewers only" mean?**
A: Viewers are people you grant access to. They can decrypt and see your encrypted metrics, but only if you granted them access. Access is per-metric and revocable.

---

**Your data is secure! Just follow best practices.** 🔒✅

