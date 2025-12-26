# 🔒 FHE KPI Vault

**Privacy-preserving KPI vault for high-sensitivity startup metrics built on Zama's FHEVM**

Founders can publish progress updates for investors and advisors while keeping raw numbers encrypted end-to-end. Built for the Zama Developer Program.

**[Live Demo](https://kpi-vault.zamataskhub.com)** • **[Demo Video](https://youtu.be/mG6fpch5a1o)** • **[Documentation](./fhe-kpi-vault/docs/)** • **[Etherscan](https://sepolia.etherscan.io/address/0xCa82F1d0BBA127F4cC3A8881ea5991275A9E8Db5)** • **[Sourcify](https://sourcify.dev/contracts/full_match/11155111/0xCa82F1d0BBA127F4cC3A8881ea5991275A9E8Db5/)**

---

## 📖 About

FHE KPI Vault combines **blockchain immutability** with **fully homomorphic encryption** to create a trustless, privacy-preserving KPI reporting system. Built for the Zama Developer Program using FHEVM v0.9.

### Key Features

- ✅ **End-to-end encryption**: Values encrypted before blockchain storage using Zama FHEVM
- ✅ **Selective disclosure**: Grant investors read access to specific metrics
- ✅ **Instant revocation**: Revoke access instantly via on-chain transaction
- ✅ **Verifiable history**: All submissions timestamped on-chain
- ✅ **Real-time analytics**: Trend charts and dashboards for decrypted metrics

---

## 🚀 Quick Start

```bash
# Clone repository
git clone https://github.com/Investorold/KPi-Vault.git
cd KPi-Vault/fhe-kpi-vault

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

---

## 📚 Documentation

For complete documentation, installation instructions, architecture details, and more, see:

👉 **[Full README and Documentation](./fhe-kpi-vault/README.md)**

---

## 📊 Deployed Contracts

**Ethereum Sepolia (chainId: 11155111)**

| Component | Address | Links |
|-----------|---------|-------|
| **KpiManager** | `0xCa82F1d0BBA127F4cC3A8881ea5991275A9E8Db5` | [Etherscan](https://sepolia.etherscan.io/address/0xCa82F1d0BBA127F4cC3A8881ea5991275A9E8Db5) • [Sourcify](https://sourcify.dev/contracts/full_match/11155111/0xCa82F1d0BBA127F4cC3A8881ea5991275A9E8Db5/) |

---

## 🎥 Demo Video

**Watch the complete demo**: [https://youtu.be/mG6fpch5a1o](https://youtu.be/mG6fpch5a1o)

The demo demonstrates the complete workflow from encryption to decryption, including access management and analytics dashboard.

---

## 🛠️ Tech Stack

- **Smart Contract**: Solidity + FHEVM (Zama)
- **Blockchain**: Ethereum Sepolia Testnet
- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express
- **Encryption**: Fully Homomorphic Encryption (FHE) via Zama FHEVM SDK

---

## 📄 License

MIT © FHE KPI Vault Contributors

---

## 🙏 Acknowledgments

Built for the [Zama Developer Program](https://www.zama.ai/) using [FHEVM](https://docs.zama.ai/fhevm) and [Zama's FHEVM SDK](https://github.com/zama-ai/fhevm).

---

**For detailed information, see the [complete README](./fhe-kpi-vault/README.md)**
