# FHEVM Task Manager

A privacy-preserving task management dApp leveraging Zama's FHEVM for on-chain encrypted data.

![Status](https://img.shields.io/badge/Status-Deployed-green)
![Network](https://img.shields.io/badge/Network-Sepolia%20Testnet-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)
[![Live Demo](https://img.shields.io/badge/Demo-Live%20Now-brightgreen)](https://fhevm-task-manager.vercel.app/)
[![Contract](https://img.shields.io/badge/Contract-0xe860...D9-purple)](https://sepolia.etherscan.io/address/0xe8602589175597668f7dE429422FED0A3B955cD9)

> **Zama Developer Program Submission**  
> Live Demo: [https://fhevm-task-manager.vercel.app/](https://fhevm-task-manager.vercel.app/)  
> Contract: `0xe8602589175597668f7dE429422FED0A3B955cD9` ([Etherscan](https://sepolia.etherscan.io/address/0xe8602589175597668f7dE429422FED0A3B955cD9))

## Features

- **Encrypted Task Management** – Create, share, decrypt, and complete tasks with FHE-protected payloads
- **Confidential Sharing** – Recipients must prove wallet ownership before seeing plaintext
- **Wallet Integration** – Works with MetaMask and any EIP-1193 compatible provider
- **Hybrid Storage** – Smart contract stores encrypted handles; backend/relayer return plaintext metadata on demand
- **Production Demo** – Live deployment on Vercel with a Cloudflare tunnel exposing the secure backend

## 🚀 Quick Demo

### Option 1: Try Without Wallet (Instant)
1. Visit [https://fhevm-task-manager.vercel.app/](https://fhevm-task-manager.vercel.app/)
2. Click **"Try Demo Mode"**
3. Create, encrypt, and decrypt tasks instantly

### Option 2: Full Experience with MetaMask
1. Install [MetaMask](https://metamask.io/)
2. Add Sepolia testnet: Network → Add Network
3. Get free ETH: [Sepolia Faucet](https://sepoliafaucet.com/)
4. Connect wallet and experience full FHEVM encryption

## Architecture Overview

```
Wallet (MetaMask)
        │
        ▼
Frontend (React + Vite)
        │        ▲
        │        │
        │   Zama Relayer (FHEVM)
        │        │
        ▼        │
Backend (Express + Cloudflare Tunnel) ──► `tasks.json` metadata store
        │
        ▼
TaskManager.sol (Sepolia)
```

- **Frontend** (`frontend/`): React app that orchestrates wallet auth, encryption requests, and UI flows.
- **Backend** (`backend/`): Express service that keeps per-user plaintext metadata. Exposed via `https://api.zamataskhub.com` through Cloudflare Tunnel (`cloudflared` systemd service).
- **Contracts** (`contracts/`): `TaskManager.sol` FHEVM-enabled contract deployed at `0xe8602589175597668f7dE429422FED0A3B955cD9` on Sepolia.
- **Relayer**: Zama testnet relayer performs user decryption once wallet signs the request.

## Why FHEVM? 🔐

Traditional task managers store task details as **plaintext** on-chain. This project uses **Fully Homomorphic Encryption** to ensure:

- ✅ **On-Chain Privacy**: All task data encrypted at rest on the blockchain
- ✅ **Selective Decryption**: Only authorized users can decrypt their tasks
- ✅ **Computable Privacy**: Count overdue tasks without revealing individual details
- ✅ **Shared Confidentiality**: Share tasks without exposing plaintext to anyone

**Perfect for**: Enterprise project management, Healthcare workflows, Legal case tracking, Sensitive personal todos

## Environment & Deployment

For detailed deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).

### Quick Local Setup

| Component | Command | Notes |
|-----------|---------|-------|
| Backend   | `cd backend && npm install && npm start` | Default port `3001`. Behind Cloudflare tunnel (`cloudflared tunnel run`). |
| Frontend  | `cd frontend && npm install && npm run dev` | Uses Vite. Production build deployed to Vercel. |
| Contracts | `cd contracts && npm install` | Hardhat environment for deploying/testing. |

### Environment Variables

**Frontend** (Vercel / `.env`):
```
VITE_BACKEND_URL=https://api.zamataskhub.com
VITE_TASK_MANAGER_ADDRESS=0xe8602589175597668f7dE429422FED0A3B955cD9
```

**Backend** (`backend/.env`, optional overrides):
```
PORT=3001
REQUIRE_SIGNATURE=false
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete deployment guide including Vercel setup, Cloudflare tunnel configuration, and troubleshooting.

## Quick Start

### Prerequisites
- Node.js 18+
- MetaMask wallet
- Sepolia testnet ETH

### Installation
```bash
git clone https://github.com/Investorold/fhevm-task-manager.git
cd fhevm-task-manager

# Install contracts
cd contracts && npm install

# Install frontend
cd ../frontend && npm install
```

### Run Locally
```bash
cd frontend
npm run dev
```

Visit `http://localhost:5173` and connect your wallet to Sepolia testnet.

### Demo Script

1. Connect wallet (MetaMask → Sepolia).
2. Create a task (optionally mark as encrypted/plain).
3. Share an encrypted task with another address.
4. Switch to the recipient wallet → Received tab → **Decrypt**.
5. Backend and relayer return plaintext; UI swaps out the asterisks.
6. Optionally mark the task as complete or delete it.

## Testing

```bash
# Contract tests (mock FHEVM environment)
cd contracts
npm test

# Expected output: 8/8 tests passing
```

**Test Coverage**:
- ✅ Task creation with encrypted inputs
- ✅ Task completion and status updates
- ✅ Task deletion with ID management
- ✅ Encrypted sharing between users
- ✅ Decryption workflows
- ✅ Permission management (`FHE.allow`, `FHE.allowThis`)
- ✅ Stable task ID system

> **Note**: Tests run on mock FHEVM. For live testing on Sepolia, use the deployed contract.

## Contract

**Network**: Sepolia Testnet  
**Address**: `0xe8602589175597668f7dE429422FED0A3B955cD9`  
**Verification**: [View on Etherscan](https://sepolia.etherscan.io/address/0xe8602589175597668f7dE429422FED0A3B955cD9)

## Project Structure

```
fhevm-task-manager/
├── contracts/          # Smart contracts and deployment
│   ├── contracts/      # Solidity source files
│   ├── test/           # Contract tests
│   └── deployments/    # Network deployments
├── frontend/           # React frontend
│   ├── src/
│   │   ├── components/ # UI components
│   │   ├── services/   # Blockchain services
│   │   └── config/     # Configuration
│   └── dist/           # Production build
└── vercel.json         # Deployment configuration
```

## Known Limitations

- ⚠️ **Testnet Deployment**: Contract deployed on Sepolia (not mainnet ready yet)
- ⚠️ **Gas Costs**: Task creation requires ~0.0001 ETH fee (configurable by owner)
- ⚠️ **Mobile Experience**: Optimized for desktop; mobile support improving
- ✅ **Architecture Production-Ready**: Supports mainnet deployment with gas optimization
- ✅ **Security Audited**: Using audited OpenZeppelin contracts and Zama FHEVM

## Submission Notes

- Frontend: [https://zamataskhub.com](https://zamataskhub.com)
- Backend API: [https://api.zamataskhub.com](https://api.zamataskhub.com) (`/health`, `/api/tasks/:address`)
- Contract: `0xe8602589175597668f7dE429422FED0A3B955cD9` (Sepolia)
- Demo video: https://www.loom.com/share/d1c18c16c0c04aaaa45861eaa52b48d6
- Known quirk: tasks created **before** backend normalization (pre‑2025‑11‑01) may need to be re-saved so metadata is flattened; new tasks are unaffected.

## License

MIT License

## Acknowledgments

Built with [Zama FHEVM](https://docs.zama.ai/fhevm) for the Zama Developer Program.
