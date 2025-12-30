# KPI Vault - Development vs Production Workflow

## Understanding Dev/Prod Separation

### Why We Have Two Modes

**Development Mode:**
- Uses `metrics.dev.json` for data storage
- Safe for testing - won't affect production data
- Use when making changes, debugging, or testing

**Production Mode:**
- Uses `metrics.json` for data storage
- Real user data - be careful!
- Use only when everything is tested and working

### How to Check Current Mode

**Check Backend Console:**
When the backend starts, it shows:
```
KPI Vault backend running on http://localhost:3101
   → Environment: production (or development)
   → Data file: metrics.json (or metrics.dev.json)
```

**Check Running Process:**
```bash
cd /root/Zama/backend
ps aux | grep "node.*server.js" | grep -v grep
# Check the environment variables
```

**Check Data Files:**
```bash
cd /root/Zama/backend
ls -lh metrics*.json
# metrics.json = production data
# metrics.dev.json = development data
```

## How to Switch Modes

### Development Mode (For Making Changes)

```bash
cd /root/Zama/backend
npm run dev
# OR
NODE_ENV=development node server.js
```

**What happens:**
- Uses `metrics.dev.json`
- Safe to test and break things
- Won't affect production data

### Production Mode (For Live Users)

```bash
cd /root/Zama/backend
npm run prod
# OR
NODE_ENV=production node server.js
```

**What happens:**
- Uses `metrics.json`
- Real user data
- Only use when everything is tested!

## Recommended Workflow

### Step 1: Work in Development Mode
```bash
cd /root/Zama/backend
npm run dev
```

### Step 2: Test Your Changes
- Create test metadata
- Test all features
- Make sure everything works

### Step 3: When Everything Works
```bash
# Stop dev server
pkill -f "node.*server.js"

# Start production server
npm run prod
```

### Step 4: Verify Production
- Check console shows "Environment: production"
- Check it's using `metrics.json`
- Test with real data

## Important Notes

⚠️ **NEVER mix dev and prod data:**
- Development changes should NOT affect production
- Always test in dev mode first
- Only switch to production when ready

⚠️ **Data Safety:**
- Both files are gitignored (not in git)
- Backend saves automatically when you create/update data
- Data persists to disk (won't be lost on restart)

⚠️ **Project Separation:**
- KPI Vault: `/root/Zama/backend/`, `/root/Zama/frontend/`
- Tax Manager: `/root/Zama/task-manager-backend/` (separate!)
- Never mix files between projects

## Current Status Check

To see what mode you're in right now:
```bash
cd /root/Zama/backend
# Check which file has data
ls -lh metrics*.json

# Check running process
ps aux | grep "node.*server.js" | grep -v grep
```

## Troubleshooting

**"No metadata showing"**
- Check if you're in the right mode (dev vs prod)
- Check which data file has your data
- Make sure backend is running

**"Data disappeared"**
- Check if you switched modes (dev vs prod use different files)
- Check both `metrics.json` and `metrics.dev.json`
- Data is never deleted, just might be in the other file

