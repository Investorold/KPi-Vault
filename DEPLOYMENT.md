# Deployment Guide

Complete guide for deploying the FHEVM Task Manager to production.

## Quick Deploy to Vercel

### Step 1: Import Project

1. Visit [vercel.com/new](https://vercel.com/new)
2. Click **"Import Git Repository"**
3. Select: **`Investorold/fhevm-task-manager`**
4. Click **"Import"**

### Step 2: Configure Project

⚠️ **CRITICAL SETTINGS** - Set these exactly:

#### Root Directory
```
Root Directory: frontend
```
- Click **"Edit"** next to Root Directory
- Type: `frontend`
- Path should show: `fhevm-task-manager/frontend`

#### Build Settings
```
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

**Note**: The `vercel.json` file in the root automatically configures these, but verify in Vercel dashboard.

#### Environment Variables

Set in Vercel Dashboard → Settings → Environment Variables:

```
VITE_BACKEND_URL=https://api.zamataskhub.com
VITE_TASK_MANAGER_ADDRESS=0xe8602589175597668f7dE429422FED0A3B955cD9
```

### Step 3: Deploy

Click **"Deploy"** and wait 2-3 minutes for the build to complete.

### Step 4: Verify Deployment

#### A) Check Cross-Origin Headers (REQUIRED for FHEVM)

The `vercel.json` file configures required COOP/COEP headers for FHEVM:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" },
        { "key": "Cross-Origin-Resource-Policy", "value": "same-site" }
      ]
    }
  ]
}
```

Test in browser console:
```javascript
console.log(self.crossOriginIsolated) // should return true
```

**Expected**: `true`  
**If false/undefined**: The `vercel.json` headers may need a fresh deploy:
- Go to Vercel → Deployments
- Click "..." → Redeploy
- **UNCHECK** "Use existing Build Cache"
- Redeploy

#### B) Test Core Functionality

1. **Connect Wallet** → Switch to Sepolia testnet
2. **Create Task** → Check "Encrypt Task Data" → Create
3. **Refresh Browser** (F5) → Task should still be there
4. **Share Task** → Enter another address → Share
5. **Decrypt Task** → Click 🔓 Decrypt
6. **Complete Task** → Click checkbox

## Local Production Build

Test the production build locally before deploying:

```bash
cd frontend
npm install
npm run build
npm run preview
```

Visit `http://localhost:4173` and verify everything works.

## Backend Deployment

The backend API is deployed separately on a VPS with Cloudflare Tunnel.

### Cloudflare Tunnel Setup

The production backend is exposed using Cloudflare Tunnel:

```bash
# Authenticate once (already done on the server)
cloudflared tunnel login

# Run tunnel
cloudflared tunnel --config /etc/cloudflared/config.yml run
```

The tunnel is configured as a systemd service (`/etc/systemd/system/cloudflared.service`) to keep it alive on reboot.

### Backend Configuration

Backend runs on port `3001` (default) and is accessible via:
- Production: `https://api.zamataskhub.com`
- Local: `http://localhost:3001`

## Troubleshooting

### Build fails: "cd frontend: No such file or directory"
- **Fix**: Set Root Directory to `frontend` in Vercel Settings → General

### Build fails: "tsc: command not found"
- **Fix**: Ensure `npm install` runs successfully. Check `package.json` has TypeScript as a dependency.

### Headers not working (crossOriginIsolated = false)
- **Fix**: 
  1. Verify `vercel.json` is in the root directory
  2. Redeploy without build cache
  3. Check browser console for CORS errors

### Backend unavailable errors
- **Fix**: Verify backend is running and Cloudflare tunnel is active
- Frontend will gracefully degrade to localStorage if backend is unavailable

### FHEVM not initializing
- **Fix**: 
  1. Check `crossOriginIsolated` returns `true`
  2. Verify Zama CDN is accessible: `https://cdn.zama.org/relayer-sdk-js/0.2.0/relayer-sdk-js.umd.cjs`
  3. Check browser console for SDK loading errors

## Environment Variables Reference

### Frontend (Vercel / `.env`)

```bash
VITE_BACKEND_URL=https://api.zamataskhub.com
VITE_TASK_MANAGER_ADDRESS=0xe8602589175597668f7dE429422FED0A3B955cD9
```

### Backend (`backend/.env`)

```bash
PORT=3001
REQUIRE_SIGNATURE=false
```

## Production URLs

- **Frontend**: https://fhevm-task-manager.vercel.app/
- **Backend API**: https://api.zamataskhub.com
- **Contract**: `0xe8602589175597668f7dE429422FED0A3B955cD9` ([Etherscan](https://sepolia.etherscan.io/address/0xe8602589175597668f7dE429422FED0A3B955cD9))

