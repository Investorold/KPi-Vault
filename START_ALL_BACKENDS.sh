#!/bin/bash
# Start Both Backends Script

echo "🚀 Starting both backend services..."

# Task Manager Backend (Port 3001)
echo ""
echo "📋 Starting Task Manager Backend on port 3001..."
cd /root/Zama/backend

if lsof -i :3001 > /dev/null 2>&1; then
    echo "⚠️  Task Manager Backend already running on port 3001"
else
    nohup node server.js > backend.log 2>&1 &
    sleep 2
    if curl -s http://localhost:3001/health > /dev/null; then
        echo "✅ Task Manager Backend started on port 3001"
    else
        echo "❌ Task Manager Backend failed to start"
    fi
fi

# KPI Vault Backend (Port 3101)
echo ""
echo "📊 Starting KPI Vault Backend on port 3101..."
cd /root/Zama/fhe-kpi-vault/backend

if lsof -i :3101 > /dev/null 2>&1; then
    echo "⚠️  KPI Vault Backend already running on port 3101"
else
    nohup node server.js > kpi-backend.log 2>&1 &
    sleep 2
    if curl -s http://localhost:3101/health > /dev/null; then
        echo "✅ KPI Vault Backend started on port 3101"
    else
        echo "❌ KPI Vault Backend failed to start"
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Backend Status:"
echo "  Task Manager: http://localhost:3001/health"
echo "  KPI Vault:    http://localhost:3101/health"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

