# FHE KPI Vault - Deployment Guide

Complete guide for deploying the KPI Vault to production.

## Prerequisites

- Node.js 18+ and npm
- MetaMask or compatible wallet with Sepolia testnet ETH
- Sepolia RPC URL (from Alchemy, Infura, or public node)
- Etherscan API key (optional, for contract verification)

## Contract Deployment (Sepolia)

### 1. Configure Environment

Create `.env` in `contracts/` directory:

```bash
SEPOLIA_RPC_URL=https://ethereum-sepolia.publicnode.com
SEPOLIA_PRIVATE_KEY=0x...your_private_key_here
ETHERSCAN_API_KEY=your_etherscan_api_key
```

**⚠️ Security Note**: Never commit `.env` files. The private key should be from a dedicated deployment wallet with sufficient Sepolia ETH.

### 2. Deploy Contract

```bash
cd contracts
npm install
npx hardhat run scripts/deployKpiManager.ts --network sepolia
```

The deployment script will:
- Check wallet balance
- Deploy `KpiManager.sol` to Sepolia
- Output the contract address

**Save the contract address** - you'll need it for frontend configuration.

### Latest Sepolia Deployment (Nov 14, 2025)

- **Contract**: `0xc86C6B62aee95cD6504458B5622A254666433963`
- **Deployer**: `0x999d9417141FBa7eF7272589C0D26975D2FF4107`
- **Network**: Sepolia (Chain ID 11155111)

Keep this handy for frontend/back-end configuration or when sharing the project link with stakeholders.

### 3. Verify Contract (Optional)

```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

## Backend Deployment

### Option 1: Local/Development Server

```bash
cd backend
npm install
PORT=3101 npm start
```

The backend will:
- Start on `http://localhost:3101`
- Create `metrics.json` for data persistence
- Enable CORS for frontend access

### Option 2: Production Server (PM2)

```bash
# Install PM2
npm install -g pm2

# Start backend
cd backend
npm install
pm2 start server.js --name kpi-backend --env production

# Save PM2 configuration
pm2 save
pm2 startup
```

### Option 3: Docker

Create `backend/Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3101
CMD ["node", "server.js"]
```

Build and run:

```bash
docker build -t kpi-backend ./backend
docker run -p 3101:3101 -e PORT=3101 kpi-backend
```

### Environment Variables

- `PORT`: Server port (default: 3101)
- `REQUIRE_SIGNATURE`: Enable signature verification (default: false)
- `ALERT_WORKER_KEY`: Shared secret for the automated alerts worker when it calls `/alerts/:id/trigger`

### Automated Alerts Worker

1. Configure `backend/.env` (see `docs/AUTOMATED_ALERTS_WORKER.md`) with:
   - `SEPOLIA_RPC_URL`, `RELAYER_URL`, `KPI_CONTRACT_ADDRESS`
   - `ALERT_WORKER_PRIVATE_KEY` (wallet granted viewer access)
   - `BACKEND_URL`, `ALERT_WORKER_KEY`
2. Start the worker:
   ```bash
   cd backend
   npm install
   npm run alerts
   ```
3. Grant the worker wallet access to each metric via the UI.
4. Leave the worker running (PM2/systemd in production) to decrypt entries, evaluate rules, emit `AlertTriggered` events on-chain, and notify subscribers automatically.

## Frontend Deployment

### 1. Configure Environment

Create `frontend/.env`:

```bash
VITE_KPI_CONTRACT_ADDRESS=0x...your_deployed_contract_address
VITE_KPI_BACKEND_URL=https://your-backend-url.com
```

### 2. Build Frontend

```bash
cd frontend
npm install
npm run build
```

This creates the `dist/` folder with production assets.

### 3. Deploy to Static Hosting

#### Option A: Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd frontend
vercel --prod
```

**Important**: Configure headers in `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cross-Origin-Opener-Policy",
          "value": "same-origin"
        },
        {
          "key": "Cross-Origin-Embedder-Policy",
          "value": "require-corp"
        }
      ]
    },
    {
      "source": "/(.*\\.wasm)",
      "headers": [
        {
          "key": "Content-Type",
          "value": "application/wasm"
        }
      ]
    }
  ]
}
```

#### Option B: Netlify

Create `frontend/netlify.toml`:

```toml
[build]
  publish = "dist"
  command = "npm run build"

[[headers]]
  for = "/*"
  [headers.values]
    Cross-Origin-Opener-Policy = "same-origin"
    Cross-Origin-Embedder-Policy = "require-corp"

[[headers]]
  for = "/*.wasm"
  [headers.values]
    Content-Type = "application/wasm"
```

Deploy via Netlify dashboard or CLI.

#### Option C: Custom Server

Use the included static server script:

```bash
cd frontend
npm run build
npm run preview:static
```

Or use any static file server with COOP/COEP headers configured.

### 4. Verify Deployment

1. Open the deployed frontend URL
2. Connect MetaMask (switch to Sepolia network)
3. Check browser console for FHEVM initialization
4. Test creating a metric and submitting encrypted values

## Post-Deployment Checklist

- [ ] Contract deployed and verified on Sepolia
- [ ] Contract address configured in frontend `.env`
- [ ] Backend running and accessible
- [ ] Frontend deployed with COOP/COEP headers
- [ ] WASM files served with correct MIME type
- [ ] MetaMask connection working
- [ ] FHEVM SDK loading successfully
- [ ] Encrypted metric submission working
- [ ] Decryption working for authorized viewers
- [ ] Access management (grant/revoke) working
- [ ] Analytics charts displaying correctly

## Troubleshooting

### FHEVM Initialization Errors

**Error**: "Browser session is not cross-origin isolated"

**Solution**: Ensure your hosting provider sets:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

### WASM Files Not Loading

**Error**: 404 or incorrect MIME type for `.wasm` files

**Solution**: Configure server to serve `.wasm` files with `Content-Type: application/wasm`

### Contract Not Found

**Error**: "KPI contract address is not configured"

**Solution**: Set `VITE_KPI_CONTRACT_ADDRESS` in frontend `.env` file

### Backend CORS Issues

**Error**: CORS policy blocking requests

**Solution**: Backend already includes CORS middleware. If issues persist, check backend URL in frontend config.

## Production Considerations

1. **Security**:
   - Use HTTPS for all services
   - Enable signature verification on backend (`REQUIRE_SIGNATURE=true`)
   - Use environment variables for secrets
   - Never commit private keys or `.env` files

2. **Performance**:
   - Enable CDN for static assets
   - Use compression (gzip/brotli)
   - Cache WASM files appropriately

3. **Monitoring**:
   - Monitor backend logs
   - Track contract events
   - Set up error tracking (Sentry, etc.)

4. **Backup**:
   - Regularly backup `backend/metrics.json`
   - Contract data is on-chain (immutable)

## Support

For issues or questions:
- Check browser console for errors
- Review contract events on Etherscan
- Verify all environment variables are set correctly

