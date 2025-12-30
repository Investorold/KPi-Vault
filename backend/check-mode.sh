#!/bin/bash
# Quick script to check KPI Vault backend mode

echo "=== KPI Vault Backend Status ==="
echo ""

# Check running process
echo "1. Running Process:"
PROCESS=$(ps aux | grep "node.*server.js" | grep -v grep | head -1)
if [ -z "$PROCESS" ]; then
    echo "   ❌ Backend is NOT running"
else
    PID=$(echo $PROCESS | awk '{print $2}')
    echo "   ✅ Backend is running (PID: $PID)"
    
    # Try to get NODE_ENV from process
    ENV_VAR=$(cat /proc/$PID/environ 2>/dev/null | tr '\0' '\n' | grep NODE_ENV || echo "NODE_ENV=not-set")
    echo "   Environment: $ENV_VAR"
fi

echo ""
echo "2. Data Files:"
if [ -f "metrics.json" ]; then
    SIZE=$(wc -c < metrics.json)
    LINES=$(wc -l < metrics.json)
    echo "   📄 metrics.json (production): $SIZE bytes, $LINES lines"
    if [ $SIZE -gt 200 ]; then
        echo "      → Has data"
    else
        echo "      → Empty (default structure only)"
    fi
else
    echo "   ❌ metrics.json not found"
fi

if [ -f "metrics.dev.json" ]; then
    SIZE=$(wc -c < metrics.dev.json)
    LINES=$(wc -l < metrics.dev.json)
    echo "   📄 metrics.dev.json (development): $SIZE bytes, $LINES lines"
    if [ $SIZE -gt 200 ]; then
        echo "      → Has data"
    else
        echo "      → Empty (default structure only)"
    fi
else
    echo "   ❌ metrics.dev.json not found"
fi

echo ""
echo "3. .env Configuration:"
if [ -f ".env" ]; then
    NODE_ENV_FROM_FILE=$(grep "^NODE_ENV=" .env 2>/dev/null | cut -d'=' -f2 || echo "not-set")
    echo "   NODE_ENV in .env: $NODE_ENV_FROM_FILE"
else
    echo "   ⚠️  .env file not found"
fi

echo ""
echo "4. Current Mode (what backend is using):"
# Check server logs or make a test request
RESPONSE=$(curl -s http://localhost:3101/health 2>/dev/null)
if [ ! -z "$RESPONSE" ]; then
    echo "   ✅ Backend is responding"
    echo "   Check server console output for: 'Environment: X' and 'Data file: X'"
else
    echo "   ❌ Backend not responding"
fi

echo ""
echo "=== Quick Commands ==="
echo "  Development: npm run dev"
echo "  Production:  npm run prod"
echo "  Check logs:  tail -f /tmp/kpi-backend-prod.log"

