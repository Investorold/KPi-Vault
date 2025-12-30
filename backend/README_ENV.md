# KPI Vault Backend - Environment Setup

## Quick Start

### Development Mode (For Making Changes)
```bash
cd /root/Zama/backend
npm run dev:bg        # Start in background
npm run restart:dev   # Restart in dev mode
npm run status        # Check current mode
```

### Production Mode (For Live Users)
```bash
cd /root/Zama/backend
npm run prod:bg       # Start in background
npm run restart:prod  # Restart in prod mode
npm run status        # Check current mode
```

### Stop Server
```bash
npm run stop
```

## What Each Mode Does

**Development (`npm run dev`):**
- Uses `metrics.dev.json` for data
- Safe for testing
- Logs to: `/tmp/kpi-backend-dev.log`

**Production (`npm run prod`):**
- Uses `metrics.json` for data
- Real user data - be careful!
- Logs to: `/tmp/kpi-backend-prod.log`

## Check Current Status

```bash
npm run status
# OR
./check-mode.sh
```

This shows:
- Which mode is running
- Which data file is being used
- What data exists in each file

## Workflow

1. **Make Changes:** Use `npm run dev:bg`
2. **Test Everything:** Create test data, verify it works
3. **When Ready:** Switch to `npm run prod:bg`
4. **Verify:** Check `npm run status` to confirm production mode

## Important

- Development and Production use **separate data files**
- Data in dev won't appear in prod (and vice versa)
- Always test in dev mode first!
- Both files are gitignored (never committed)








