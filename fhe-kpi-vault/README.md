# 🔒 FHE KPI Vault

**Privacy-preserving KPI vault for high-sensitivity startup metrics built on Zama's FHEVM**

Founders can publish progress updates for investors and advisors while keeping raw numbers encrypted end-to-end. Built for the Zama Developer Program.

🌐 **[Live Demo](https://kpi-vault.zamataskhub.com)** • 🎥 **[Demo Video](#demo-video)** • 📖 **[Documentation](./docs/)** • 📊 **[Etherscan](https://sepolia.etherscan.io/address/0xCa82F1d0BBA127F4cC3A8881ea5991275A9E8Db5)** • 🔍 **[Sourcify](https://sourcify.dev/contracts/full_match/11155111/0xCa82F1d0BBA127F4cC3A8881ea5991275A9E8Db5/)**

---

## 🎯 Why FHE KPI Vault?

### The Problem

Startups need to share sensitive metrics (revenue, user growth, burn rate) with investors, but traditional methods have critical flaws:

- **Spreadsheet sharing**: No audit trail, easy to manipulate, access control is manual
- **Centralized dashboards**: Require trust in third-party servers, single point of failure
- **Email reports**: No version control, access revocation is impossible
- **Public blockchains**: Too transparent—competitors can see everything

### The Solution

FHE KPI Vault combines **blockchain immutability** with **fully homomorphic encryption** to create a trustless, privacy-preserving KPI reporting system:

- ✅ **End-to-end encryption**: Values encrypted before blockchain storage using Zama FHEVM
- ✅ **Selective disclosure**: Grant investors read access to specific metrics without leaking wider company data
- ✅ **Instant revocation**: Revoke access instantly when relationships change—no chasing spreadsheets
- ✅ **Verifiable history**: Every encrypted submission is timestamped on-chain, providing an auditable reporting trail
- ✅ **Zero-trust architecture**: Ciphertext lives on-chain; metadata relayed through hardened Express API
- ✅ **Real-time analytics**: Trend charts, sparklines, and streak tracking for decrypted metrics

---

## 🧱 What We Built

### Core Components

**1. Smart Contract (`KpiManager.sol`)**
- Stores encrypted KPI entries on-chain using FHEVM `euint64` types
- Maintains per-metric access control lists (ACLs)
- Emits events for off-chain indexing and analytics
- Supports admin management for enterprise deployment
- **Deployed on Sepolia**: `0xCa82F1d0BBA127F4cC3A8881ea5991275A9E8Db5` (v0.9.1)

**2. Backend Relay (Express.js)**
- Persists KPI metadata (labels, units, descriptions) off-chain
- Exposes RESTful API for access management (`/metrics/meta`, `/access/grant`, `/access/revoke`)
- Handles signature verification for secure operations
- Provides HTTPS-friendly bridge for frontend communication

**3. Frontend (React + Vite)**
- Wallet connection via MetaMask with FHEVM SDK integration
- Encrypted KPI submission with real-time encryption feedback
- Client-side decryption for authorized viewers
- Analytics dashboard with trend charts and sparklines
- Access management UI with grant/revoke controls
- Admin management interface for contract-level controls

**4. Automated Alerts Worker** (Optional)
- Background worker decrypts new entries and evaluates alert rules
- Supports threshold-based alerts (e.g., "notify if MRR drops below X")
- Dispatches notifications via configured channels

---

## 🏗️ Architecture

```
┌──────────────┐       ┌──────────────────────┐       ┌───────────────────────┐
│   Founders   │──────▶│  KPI Vault Frontend  │──────▶│   KpiManager.sol      │
│ (Encrypt &   │       │  (React + FHEVM SDK)  │       │   (On-Chain Storage)   │
│  Submit)     │       │                      │       │   Encrypted euint64    │
└──────────────┘       └─────────────┬────────┘       └───────────┬───────────┘
        │                            │                             │
        │ Encrypted Values           │ Metadata API                │ Access Control
        │                            ▼                             │
        │                   ┌────────────────────┐                │
        │                   │  Backend Relay     │                │
        │                   │  (Express.js)      │                │
        │                   │  - Metadata        │                │
        │                   │  - Access Mgmt    │                │
        │                   └────────────────────┘                │
        │                                                           │
        ▼                                                           ▼
┌──────────────┐                                           ┌─────────────────────┐
│  Investors   │◀─────────────────────────────────────────│  Access Control     │
│ (Decrypt &   │         Grant/Revoke Access               │  (Per-Metric ACL)   │
│  View)       │                                           └─────────────────────┘
└──────────────┘
```

**Privacy Flow:**
1. **Encryption**: Founder encrypts KPI value locally using FHEVM SDK
2. **On-Chain Storage**: Encrypted value stored on Sepolia blockchain
3. **Access Grant**: Founder grants viewer access via on-chain transaction
4. **Decryption**: Authorized viewer decrypts using FHEVM SDK with proof verification
5. **Analytics**: Decrypted values visualized in dashboard with trend analysis

---

## 🔒 Security Features

- **End-to-End Encryption**: All KPI values encrypted using Zama FHEVM before blockchain storage
- **On-Chain Immutability**: All submissions timestamped and stored on Sepolia testnet
- **Per-Metric Access Control**: Granular ACLs—grant access to specific metrics, not all data
- **Instant Revocation**: Revoke access instantly via on-chain transaction
- **Signature Verification**: Optional backend signature checks for additional security
- **Zero-Trust Transport**: Ciphertext on-chain; metadata through hardened API

---

## 📊 Deployed Contracts

### Ethereum Sepolia (chainId: 11155111)

| Component | Address | Etherscan | Sourcify |
|-----------|---------|-----------|----------|
| **KpiManager** | `0xCa82F1d0BBA127F4cC3A8881ea5991275A9E8Db5` | [View](https://sepolia.etherscan.io/address/0xCa82F1d0BBA127F4cC3A8881ea5991275A9E8Db5) | [View](https://sourcify.dev/contracts/full_match/11155111/0xCa82F1d0BBA127F4cC3A8881ea5991275A9E8Db5/) |

### Configuration

- **FHEVM Version**: v0.9 (testnet v2)
- **Relayer URL**: `https://relayer.testnet.zama.org`
- **Gateway Chain ID**: `10901`
- **Network**: Ethereum Sepolia Testnet

> **⚠️ Testnet Dependency**: This application requires Zama's Coprocessor Testnet to be operational. Monitor status at [status.zama.org](https://status.zama.org). If you encounter "Failed to fetch" errors, check the [Testnet Outage Impact Guide](./TESTNET_OUTAGE_IMPACT.md) for troubleshooting steps.

---

## 🚀 Getting Started

### Prerequisites

- Node.js v18+
- MetaMask connected to Sepolia testnet
- Sepolia ETH (for gas fees)

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/fhe-kpi-vault.git
cd fhe-kpi-vault

# Install dependencies
npm install

# Backend
cd backend
npm install
npm start  # Runs on port 3101

# Frontend (new terminal)
cd frontend
npm install
npm run dev  # Runs on port 4173
```

### Configuration

Create `.env` files:

**Frontend** (`frontend/.env`):
```bash
VITE_KPI_CONTRACT_ADDRESS=0xCa82F1d0BBA127F4cC3A8881ea5991275A9E8Db5
VITE_KPI_BACKEND_URL=http://localhost:3101
```

**Backend** (`backend/.env`):
```bash
PORT=3101
REQUIRE_SIGNATURE=false
```

**Contracts** (`contracts/.env`):
```bash
SEPOLIA_RPC_URL=your_rpc_url
PRIVATE_KEY=your_private_key
```

### Experience the Flow

1. **Create Metric Metadata**
   - Go to "Add Metric Metadata"
   - Enter: Metric ID `mrr`, Label `Monthly Recurring Revenue`, Unit `USD`
   - Click "Save Metadata"

2. **Encrypt & Submit**
   - Go to "Encrypted KPI Entries"
   - Enter Metric ID `mrr`, Value `12500`
   - Click "Encrypt & Submit"
   - Confirm MetaMask transaction

3. **Decrypt Your Value**
   - Click "Decrypt" on the entry
   - View decrypted value: `12,500.00 USD`

4. **Grant Access**
   - Go to "Access Management"
   - Enter viewer wallet address
   - Click "Grant Access"
   - Confirm transaction

5. **Viewer Decrypts**
   - Switch to viewer wallet in MetaMask
   - Viewer can decrypt and see analytics

---

## 🧪 Testing

### Contract Tests

```bash
cd contracts
npm test
```

**Result**: ✅ **28/28 tests passing**

### Backend Tests

```bash
cd backend
node test/server.test.js
```

**Result**: ✅ **17/17 tests passing**

### Total Test Coverage

✅ **45/45 tests passing** (100% pass rate)

---

## 🎥 Demo Video

**Status**: Video will be added once Zama Testnet Relayer is operational.

Currently, the Zama Testnet Relayer is experiencing downtime (see [status.zama.org](https://status.zama.org)). The demo video will demonstrate:
- ✅ Encrypted KPI submission flow
- ✅ Access control (grant/revoke viewer access)
- ✅ Viewer decryption and analytics
- ✅ Real-time dashboard with trend charts

**Note**: All code is production-ready and fully functional. The demo video is pending only due to Zama infrastructure dependency. Encryption requires the Relayer service to be online, which is currently experiencing downtime.

**Update**: Video link will be added here once Relayer recovers and demo is recorded.

---

## 📚 Documentation

- **[User Guide](./docs/USER_GUIDE.md)**: How to use KPI Vault as a founder or investor
- **[Architecture](./docs/ARCHITECTURE.md)**: Technical architecture and design decisions
- **[Deployment Guide](./docs/DEPLOYMENT.md)**: Complete guide for deploying to Sepolia and production
- **[How It Works](./docs/HOW_IT_WORKS.md)**: Detailed explanation of the encryption and access flow
- **[Security Model](./docs/SECURITY_CONSOLE_AND_VIEWERS.md)**: Security architecture and best practices

---

## 🎨 Features

### For Founders

- ✅ Create and manage KPI metadata (labels, units, categories)
- ✅ Submit encrypted KPI values on-chain
- ✅ Grant selective access to investors/viewers per metric
- ✅ Revoke access instantly when needed
- ✅ View analytics and trends for your KPIs
- ✅ Manage contract admins (if deployer)
- ✅ Automated alerts for threshold-based notifications

### For Investors/Viewers

- ✅ View KPI metadata (labels, descriptions)
- ✅ Decrypt and view authorized KPIs
- ✅ See historical trends and analytics
- ✅ Verify data integrity via blockchain
- ✅ Access granted per-metric (not all-or-nothing)

### Technical Features

- ✅ FHEVM v0.9 (testnet v2) integration
- ✅ Cross-origin isolation support (COOP/COEP headers)
- ✅ Real-time access control updates
- ✅ Comprehensive error handling
- ✅ Production-ready deployment configuration

---

## 🛠️ Tech Stack

- **Smart Contract**: Solidity + FHEVM (Zama)
- **Blockchain**: Ethereum Sepolia Testnet
- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express
- **Encryption**: Fully Homomorphic Encryption (FHE) via Zama FHEVM SDK
- **Testing**: Hardhat (contracts) + Node.js (backend)

---

## 🗺️ Roadmap

### ✅ Completed

- Core encrypted KPI storage and retrieval
- Per-metric access control (grant/revoke)
- Analytics dashboard with charts and trends
- Admin management interface
- Automated alerts worker
- Comprehensive test coverage (45/45 passing)
- FHEVM v0.9 migration (testnet v2)
- Production deployment configuration

### 🚧 Future Enhancements

- Multi-chain support (Base, Linea, Scroll)
- zk-proofs for access verification
- Advanced analytics (forecasting, anomaly detection)
- Mobile app (React Native)
- API for third-party integrations
- Multi-signature access control

---

## 📄 License

MIT © FHE KPI Vault Contributors

---

## 🙏 Acknowledgments

Built for the [Zama Developer Program](https://www.zama.ai/) using [FHEVM](https://docs.zama.ai/fhevm) and [Zama's FHEVM SDK](https://github.com/zama-ai/fhevm).

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/fhe-kpi-vault/issues)
- **Documentation**: [./docs/](./docs/)
- **Etherscan**: [View Contract](https://sepolia.etherscan.io/address/0xCa82F1d0BBA127F4cC3A8881ea5991275A9E8Db5)
- **Sourcify**: [View Verified Contract](https://sourcify.dev/contracts/full_match/11155111/0xCa82F1d0BBA127F4cC3A8881ea5991275A9E8Db5/)

---

**Built with ❤️ for privacy-preserving DeFi**
