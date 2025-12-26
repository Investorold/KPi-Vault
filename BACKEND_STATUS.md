# Backend Services Status

## Running Backends

### 1. Task Manager Backend ✅
- **Port**: 3001
- **Status**: Running
- **Health**: http://localhost:3001/health
- **Production**: https://api.zamataskhub.com
- **CORS**: ✅ Fixed (allows zamataskhub.com)
- **Process**: `node server.js` in `/root/Zama/backend/`

### 2. KPI Vault Backend ✅
- **Port**: 3101
- **Status**: Running
- **Health**: http://localhost:3101/health
- **CORS**: ✅ Fixed (allows zamataskhub.com)
- **Process**: `node server.js` in `/root/Zama/fhe-kpi-vault/backend/`

## Quick Commands

### Check Status
```bash
# Task Manager Backend
curl http://localhost:3001/health

# KPI Vault Backend
curl http://localhost:3101/health
```

### Start Backends
```bash
# Task Manager Backend
cd /root/Zama/backend
nohup node server.js > backend.log 2>&1 &

# KPI Vault Backend
cd /root/Zama/fhe-kpi-vault/backend
nohup node server.js > kpi-backend.log 2>&1 &
```

### Stop Backends
```bash
# Task Manager Backend
pkill -f "backend/server.js"

# KPI Vault Backend
pkill -f "fhe-kpi-vault.*server.js"
```

### Check Ports
```bash
lsof -i :3001  # Task Manager
lsof -i :3101  # KPI Vault
```

## PM2 Setup (Recommended)

To keep both backends running persistently:

```bash
# Task Manager Backend
cd /root/Zama/backend
pm2 start server.js --name task-manager-backend --cwd /root/Zama/backend
pm2 save

# KPI Vault Backend
cd /root/Zama/fhe-kpi-vault/backend
pm2 start server.js --name kpi-vault-backend --cwd /root/Zama/fhe-kpi-vault/backend
pm2 save

# Enable auto-start on reboot
pm2 startup
```

## CORS Configuration

Both backends now have explicit CORS configuration allowing:
- `https://zamataskhub.com` (production)
- Local development origins

## Logs

- Task Manager: `/root/Zama/backend/backend.log`
- KPI Vault: `/root/Zama/fhe-kpi-vault/backend/kpi-backend.log`

