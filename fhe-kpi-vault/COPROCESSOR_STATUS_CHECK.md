# ✅ Coprocessor Status Check Feature

## What Was Added

Added automatic coprocessor status checking when relayer rejections occur. This helps users understand if the issue is truly a coprocessor outage or something else.

## How It Works

When a relayer rejection occurs (after all retry attempts fail), the app now:

1. **Automatically checks coprocessor status** by making a lightweight request to the relayer
2. **Logs the status** to the console with clear messaging
3. **Provides actionable feedback** based on the status

## Status Types

- **`operational`** ✅ - Coprocessor is working, encryption should succeed
- **`down`** 🔴 - Coprocessor is down, encryption unavailable
- **`degraded`** ⚠️ - Coprocessor is degraded, encryption may fail
- **`unknown`** ❓ - Unable to determine status

## Console Output

When a relayer rejection occurs, you'll now see:

```
[KPI Contract] 🔍 Coprocessor Status Check: {
  isOperational: false,
  status: 'down',
  message: 'Relayer did not respond within 5 seconds - Coprocessor may be down',
  error: 'Timeout'
}
[KPI Contract] 🔴 Coprocessor is down - encryption unavailable. Check https://status.zama.org
```

## Why This Helps

1. **Confirms the issue** - Verifies if coprocessor is actually down
2. **Reduces confusion** - Users know it's not their code/config
3. **Actionable feedback** - Clear next steps based on status
4. **Automatic** - No manual checking needed

## Manual Status Check

You can also manually check status in the browser console:

```javascript
// Import the utility (if available globally)
import { checkCoprocessorStatus, logCoprocessorStatus } from './utils/coprocessorStatus';

// Check status
const status = await checkCoprocessorStatus();
console.log(status);

// Or log with helpful message
await logCoprocessorStatus();
```

## Technical Details

- **Endpoint checked**: `https://relayer.testnet.zama.org/v1/status`
- **Method**: HEAD request (lightweight, no data transfer)
- **Timeout**: 5 seconds
- **Cache**: Disabled (`no-store`)

## Next Steps

When coprocessor is down:
1. ✅ Check https://status.zama.org for official status
2. ⏳ Wait 5-10 minutes for recovery
3. 🔄 Retry encryption when status shows "Operational"

The app will automatically detect when coprocessor is back online.


