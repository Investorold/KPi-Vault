# My Journey Building Privacy-Preserving dApps on Zama's FHEVM: Two Months of Challenges, Learnings, and Real Impact

**A personal account of contributing to the Zama Developer Program in October and November 2024**

---

## Why the Developer Program? My Honest Answer

When I first discovered Zama's Developer Program, I faced a choice: creator or developer? Here's the truth - I'm someone with a small account and little to no audience. Even if I tried creating content, it probably wouldn't reach many people or make much of an impact. That's why I chose the **Developer Program**.

I believe the best way to contribute to Zama is by building real, functional applications that demonstrate the power of Fully Homomorphic Encryption (FHE) in practical use cases. But honestly? I'm also doing this because I genuinely love what Zama is building. Privacy on public blockchains isn't just a nice-to-have - it's revolutionary. The fact that Zama rewards contributors with a role and an NFT for each valuable contribution? That's just the cherry on top.

## My Timeline: October and November 2024

I've been actively contributing for the past two months:

- **October 2024**: I submitted my first project - **FHEVM Task Manager**. The top 7 winners have been announced (congrats to all of you!), but the full contributor list is still pending. Fingers crossed!

- **November 2024**: I just submitted my second project - **FHE KPI Vault**. Literally just submitted it as I'm writing this, right before the deadline.

Each month, I've poured countless hours into understanding FHEVM, debugging encryption errors (there were many), and building production-ready applications. It hasn't been easy, but it's been incredibly rewarding.

---

## 🔒 Project 1: FHEVM Task Manager (October Submission)

### The Vision That Started It All

I wanted to build something practical - something people could actually use. Task management seemed perfect. Everyone uses task managers, but what if your tasks were truly private? What if you could share tasks with team members while keeping the details encrypted on-chain?

That vision became the FHEVM Task Manager.

### What I Built

**The Smart Contract (`TaskManager.sol`)**

This wasn't straightforward. I had to learn how to work with encrypted types in Solidity - something I'd never done before. The contract stores:

- Encrypted task titles (as `euint64` - I had to encode text as numbers)
- Encrypted descriptions (also `euint64`)
- Encrypted due dates (Unix timestamps as `euint64`)
- Encrypted priority levels (1-5 as `euint8`)

The tricky part? Everything needs to be encrypted **BEFORE** it goes on-chain. Once it's on-chain, it stays encrypted forever. Only people with the right access can decrypt it.

**Key Features:**

✅ **End-to-end encryption**: All task data encrypted client-side before blockchain storage  
✅ **Task sharing**: Share encrypted tasks with other users while maintaining privacy  
✅ **Due date tracking**: Built encrypted comparisons to identify tasks due soon (this was challenging)  
✅ **Priority management**: Encrypted priority levels so even that stays private  
✅ **Access control**: Granular sharing permissions per task  
✅ **On-chain immutability**: Every task is timestamped and stored on Sepolia  

**Technical Stack:**
- Solidity + FHEVM (Zama)
- React + TypeScript frontend
- Express.js backend for metadata
- Ethereum Sepolia Testnet

### The Challenges That Tested Me

**1. The FHEVM v0.8 → v0.9 Migration**

Oh man, this was tough. I started building when v0.8 was still being used, but then Zama upgraded to v0.9. Everything broke. I mean **EVERYTHING**.

I had to:
- Change from `SepoliaConfig` to `ZamaEthereumConfig` (the old one was deprecated)
- Update all contract addresses (they all changed)
- Completely rethink the decryption pattern (oracle-based to event-driven)
- Learn that `FHE.requestDecryption()` doesn't exist anymore
- Understand `FHE.verifySignatures()` instead of `FHE.checkSignatures()`

I spent days reading documentation, asking questions in Discord, and debugging. But you know what? I learned so much from this experience. Understanding the migration made me a better FHEVM developer.

**2. Encrypted Comparisons Are Harder Than They Look**

Want to know if a due date is "soon"? In normal programming, that's easy. In FHE? That's a whole different story. I had to:
- Encrypt the current timestamp
- Encrypt the due date
- Compare them while both are encrypted
- Build a counter for tasks due soon

The type casting and operations required careful planning. One wrong move and the encryption breaks.

**3. Building Task Sharing Architecture**

This was actually the most interesting problem. How do you share encrypted tasks while maintaining privacy? I ended up building:
- Owner-aware sharing mechanism
- Recipient-based task indexing
- A mapping system to track who has access to what

It works and maintains privacy throughout.

### What I Learned

- **FHEVM Fundamentals**: From knowing nothing about encrypted types to understanding `euint32`, `euint64`, `ebool` and when to use each
- **Privacy-Preserving Design**: How to structure contracts so they're private by default
- **Access Control Patterns**: Implementing permissions with encryption - harder than it sounds
- **Migration Strategies**: How to adapt when the platform you're building on evolves

This project took me the entire month of October. Late nights debugging encryption errors, asking questions in Discord, and finally getting it to work. When I submitted it, I was genuinely proud of what I'd built.

---

## 📊 Project 2: FHE KPI Vault (November Submission)

### The Real-World Problem

After building the Task Manager, I wanted to tackle something with even more real-world impact. I kept thinking about startups and investors. Startups need to share sensitive metrics (revenue, user growth, burn rate) with investors, but current methods are terrible:

- **Spreadsheets**: Easy to manipulate, no audit trail, manual access control
- **Centralized dashboards**: Single point of failure, you're trusting a third party
- **Email reports**: No version control, can't revoke access
- **Public blockchains**: Too transparent - competitors can see everything

There had to be a better way. That's when I thought: what if we combine blockchain immutability with fully homomorphic encryption? You get verifiable data that's also private. That's the FHE KPI Vault.

### What I Built

**1. Smart Contract (`KpiManager.sol`)**

This contract stores encrypted KPI values on-chain using `euint64` types. The cool part? It has per-metric access control lists. That means you can grant an investor access to see revenue but not user growth. Or grant access to one metric now, and add more later. The flexibility is incredible.

**Deployed on Sepolia**: `0xCa82F1d0BBA127F4cC3A8881ea5991275A9E8Db5` (v0.9.1)

**2. Backend Relay (Express.js)**

For metadata that doesn't need encryption (labels, units, descriptions), I built a backend API. It handles:
- Access management endpoints
- Signature verification
- A bridge between frontend and blockchain

**3. Frontend (React + Vite)**

This is where it got interesting. I built:
- Wallet connection with MetaMask
- Real-time encryption feedback
- Client-side decryption for authorized viewers
- An analytics dashboard with actual charts and sparklines
- Access management UI where founders can grant/revoke access

The analytics dashboard was my favorite part. When you decrypt a KPI, you can see:
- Historical trends
- Sparklines showing growth
- Streak tracking
- All visualized beautifully

**4. Automated Alerts Worker**

This was an extra feature I added. It's a background worker that:
- Decrypts new KPI entries
- Evaluates alert rules (like "notify if MRR drops below X")
- Sends notifications

### Technical Achievements

✅ **100% Test Coverage**: 45/45 tests passing (28 contract tests + 17 backend tests)  
✅ **FHEVM v0.9 Migration**: Complete migration to testnet v2 (learned from my Task Manager experience!)  
✅ **Production Deployment**: Live demo at `https://kpi-vault.zamataskhub.com`  
✅ **Cross-Origin Isolation**: Proper COOP/COEP headers for FHEVM SDK  
✅ **Real-time Analytics**: Actual charts and trend analysis  
✅ **Comprehensive Documentation**: User guides, architecture docs, deployment guides - everything  

### The Challenges That Almost Broke Me

**1. The "Incorrect Handle" Error - My Worst Enemy**

This error haunted me for **DAYS**. I kept getting "Incorrect Handle" errors when trying to encrypt data. The error messages weren't helpful. The documentation didn't have the answer. I was completely stuck.

After hours of debugging, I finally figured it out:
- The frontend was loading an old local SDK bundle (v0.2.0) instead of the updated npm package (v0.3.0-6)
- The SDK versions had to match exactly
- Browser caching was causing issues with stale handles

The solution? I rewrote the SDK loading logic to prioritize the remote bundle, implemented storage versioning to clear stale handles, and made sure everything was using the same SDK version. This took me the better part of a week to solve.

**2. Zama Testnet Relayer Downtime - The Submission Deadline Panic**

Right as I was trying to finish my November submission, Zama's Testnet Relayer went down. You can't encrypt or decrypt without it. I panicked. How was I supposed to finish my project if the infrastructure was down?

But then I realized - this is actually a valuable learning opportunity. Infrastructure can fail, and building resilient applications means planning for that.

I built robust error handling:
- Clear error messages when the Relayer is down
- User-friendly messaging about infrastructure dependencies
- The system gracefully handles testnet outages

I also documented this in the README and created guides for users. Sometimes infrastructure fails - building resilient applications means planning for that. This experience taught me that production-ready applications need to handle infrastructure failures gracefully, not just work when everything is perfect.

**3. Access Control Architecture**

Designing per-metric access control was harder than I thought. I needed:
- Founders to grant access to specific metrics (not all-or-nothing)
- Instant revocation when relationships change
- Secure signature verification
- All while maintaining privacy

I went through several iterations before settling on the current design. It's not perfect, but it works well and maintains privacy throughout.

**4. Analytics on Encrypted Data**

Here's the thing about encrypted data: you can't analyze it while it's encrypted. So I had to design a system where:
- Only authorized viewers can decrypt
- Decrypted values are used for analytics
- Everything else stays encrypted
- The analytics feel real-time

This required careful architecture - decryption happens client-side, analytics happen after decryption, and nothing leaks.

### What This Project Taught Me

- **Production-Grade FHEVM Development**: This isn't a toy project - it's a real application
- **SDK Integration**: Deep dive into `@zama-fhe/relayer-sdk` - I understand it inside and out now
- **Error Handling**: Building resilient applications that handle infrastructure failures gracefully
- **Testing Strategies**: How to test encrypted operations (this is harder than it sounds)
- **Documentation**: Writing docs that actually help people (users AND developers)

This project took my entire November. I submitted it just today, actually. The deadline was tight, especially with the Relayer downtime, but I made it. Now I'm waiting to see if I made the contributor list.

---

## 🏗️ Deep Dive: FHEVM v0.9 Migration Lessons

After going through the migration twice (Task Manager and KPI Vault), I've learned a lot. Here's what you need to know:

**Breaking Changes That Caught Me Off Guard:**

1. **Config Changes**: `SepoliaConfig` → `ZamaEthereumConfig`
   - The old config is deprecated
   - New config is more flexible (works for both mainnet and testnet)
   - You have to update imports everywhere

2. **Decryption Pattern Completely Changed**
   - Old: `FHE.requestDecryption()` - synchronous oracle pattern
   - New: Event-driven pattern - frontend listens and handles decryption
   - This is a fundamental architecture shift

3. **Signature Verification API Changed**
   - Old: `FHE.checkSignatures(requestId, ...)`
   - New: `FHE.verifySignatures(handlesList, ...)`
   - Different parameters, different flow

4. **Callback Patterns**
   - Old: Callback received `requestId`, had to map back to session
   - New: Callback receives `sessionId` directly
   - Much cleaner, but requires refactoring

**New Patterns I Had to Learn:**

- Self-relaying decryption (frontend handles everything)
- Event-driven architecture (listen to events, react accordingly)
- `FHE.makePubliclyDecryptable()` for public decryption
- `publicDecrypt()` vs `userDecrypt()` - when to use each

The migration isn't trivial, but once you understand the patterns, it makes sense. The new architecture is actually better - more flexible, more transparent, easier to debug.

---

## 🎓 Key Learnings: What Two Months of Building Taught Me

### 1. FHEVM is Actually Production-Ready

I was skeptical at first. Testnet? Sounds like it might break. But honestly, it's robust. The SDK is well-designed. The documentation (while it could be better in some areas) is sufficient. I've built two real applications that work.

Sure, there are infrastructure dependencies (Relayer, Coprocessor), but that's normal for this stage. The technology itself is solid. When the Relayer goes down, you learn to build resilient applications. When you hit errors, you learn to debug encrypted operations. It's all part of the journey.

### 2. Privacy-by-Design Requires Rethinking Everything

You can't just take a normal app and "add encryption." You have to think differently:
- What actually needs to be encrypted?
- Who needs access?
- How do we enable functionality while maintaining privacy?
- What can leak through metadata?

This mental shift took time. Now I can't unsee privacy concerns in every application I use.

### 3. Testing Encrypted Operations is Critical (And Hard)

Encrypted operations can fail in weird ways. The error messages aren't always helpful. You need comprehensive tests:
- Encryption/decryption flows
- Access control mechanisms
- Edge cases (what if someone tries to decrypt without access?)
- Error handling

I learned this the hard way. My first project had bugs that only showed up in production. My second project had 100% test coverage from the start. Much better.

### 4. Documentation Saves You (And Others)

When I was stuck on the "Incorrect Handle" error, I couldn't find answers anywhere. That's when I decided: I'm going to document everything.

Now both projects have:
- User guides
- Architecture docs
- Deployment guides
- Troubleshooting guides
- Migration guides

This helped me remember how things work, and it'll help other developers too.

### 5. Infrastructure Dependencies Require Resilience

FHEVM applications depend on Zama's infrastructure. When the Relayer goes down, encryption stops working. When I first hit this during my November submission, I panicked. But then I realized - this is normal for new technology.

Building resilient applications means:
- Graceful error handling
- Clear user messaging
- Fallback strategies when possible
- Documenting the dependencies

---

## 💭 Why I'm Really Doing This (The Honest Truth)

Let me be completely honest here. Yes, there are rewards - contributor roles and NFTs for valuable contributions. That's nice. But that's not why I'm doing this.

I'm doing this because:

1. **I believe in privacy**: We need privacy on public blockchains. It's not optional anymore.

2. **I love building**: There's something satisfying about solving real problems with code.

3. **I want to contribute**: I might not have a big audience for content, but I can build things that matter.

4. **I'm learning**: Every bug I fix, every feature I build - I'm becoming a better developer.

5. **I want to be part of this**: The Zama community is building something special. I want to be part of that.

The rewards are great, but the real reward is seeing something you built actually work. Seeing encrypted data flow through the system. Seeing users interact with something that maintains privacy. That's the real payoff.

---

## 🚀 What These Projects Demonstrate

I'm not just building toys. These are real applications that solve real problems:

1. **Real-World Use Cases**: Task management and KPI reporting are things people actually need.

2. **Production Readiness**: 100% test coverage, comprehensive documentation, live deployments - this isn't a proof of concept.

3. **Developer Examples**: Other developers can learn from these projects. They can see patterns, best practices, and common pitfalls.

4. **Ecosystem Growth**: By building and open-sourcing, I'm contributing to the FHEVM ecosystem.

### My Open Source Contributions

Both projects are open source:
- **KPI Vault**: [github.com/Investorold/KPi-Vault](https://github.com/Investorold/KPi-Vault)
- **Task Manager**: Available in the repository

I'm not hoarding code. If it helps someone else learn FHEVM, that's a win.

### Community Engagement

I've been active in the Zama Discord:
- Sharing learnings and solutions
- Documenting migration patterns and common issues
- Providing feedback on SDK and documentation
- Helping other developers when I can

It's not just about my projects - it's about growing the community.

---

## 🔮 What's Next?

### Potential Enhancements

**For Task Manager:**
- Multi-user collaboration features
- Encrypted task search and filtering
- Mobile app support
- Calendar integrations

**For KPI Vault:**
- Multi-chain support (Base, Linea, Scroll)
- Advanced analytics (forecasting, anomaly detection)
- zk-proofs for access verification
- API for third-party integrations
- Multi-signature access control

### New Project Ideas

I have ideas for future projects:
1. **Encrypted Voting System**: Privacy-preserving voting for DAOs
2. **Confidential Survey Platform**: Encrypted survey responses with aggregate statistics
3. **Private Reputation System**: Encrypted reputation scores with selective disclosure
4. **Confidential Supply Chain**: Encrypted supply chain data with access control

The question is: which one should I build next?

---

## 🙏 Acknowledgments

These projects wouldn't have been possible without:

- **The Zama Team**: Building FHEVM and providing documentation (even when it's not perfect, it's helpful)
- **The FHEVM Community**: Answering my questions, providing feedback, being generally supportive
- **Open Source Ecosystem**: All the tools and libraries that make development possible

Thank you for building this technology. Thank you for creating a program that rewards contributors. Thank you for making privacy on public blockchains possible.

---

## 📝 Final Thoughts

I've been contributing for two months now:
- **October**: Submitted FHEVM Task Manager (waiting for contributor list)
- **November**: Just submitted FHE KPI Vault (waiting to see results)

Both projects are fully functional, tested, and deployed. They solve real problems and demonstrate what's possible with FHEVM.

Am I going to win? I don't know. The top 7 winners for October have been announced, but I haven't seen my name there yet. The full contributor list is still pending. Maybe I'll make it, maybe I won't.

But you know what? That's okay. Because I built something I'm proud of. I learned new skills. I contributed to the ecosystem. I'm part of something bigger than myself.

**The journey continues.** As FHEVM evolves, I'll keep building. I'll keep learning. I'll keep contributing. Because that's what I do - I build things that matter.

---

## 🔗 Project Links

### FHE KPI Vault (November Submission)
- **Live Demo**: https://kpi-vault.zamataskhub.com
- **GitHub**: https://github.com/Investorold/KPi-Vault
- **Smart Contract**: `0xCa82F1d0BBA127F4cC3A8881ea5991275A9E8Db5` (Sepolia)
- **Etherscan**: [View on Etherscan](https://sepolia.etherscan.io/address/0xCa82F1d0BBA127F4cC3A8881ea5991275A9E8Db5)
- **Sourcify**: [Verified Contract](https://sourcify.dev/contracts/full_match/11155111/0xCa82F1d0BBA127F4cC3A8881ea5991275A9E8Db5/)

### FHEVM Task Manager (October Submission)
- **GitHub**: Available in repository
- **Status**: Fully functional, FHEVM v0.9 compliant

---

**Built with ❤️ because privacy matters**

*This is my honest reflection on two months of building with Zama's FHEVM. Real experiences, real challenges, real code.*

---

## P.S. About the Program Structure

For anyone reading this who's curious about the Zama Developer Program:

- **Monthly Submissions**: You can submit projects each month
- **Top 7 Winners**: Announced first (congrats to all the winners!)
- **Contributor List**: Released later (includes everyone who made valuable contributions)
- **Rewards**: Contributor role + NFT for each valuable contribution

I'm waiting to see if I made the October contributor list. I just submitted for November. Fingers crossed for both!

If you're thinking about contributing - do it. Build something. Learn something. Contribute to the ecosystem. The rewards are nice, but the experience is invaluable.

See you in the Discord! 🚀
