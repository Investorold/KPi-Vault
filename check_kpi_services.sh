#!/bin/bash
if pgrep -f "fhe-kpi-vault/backend" > /dev/null; then
  echo "Backend running (PID(s):" $(pgrep -f "fhe-kpi-vault/backend" | tr '\n' ' ') ")"
else
  echo "Backend not running"
fi

if pgrep -f "fhe-kpi-vault/frontend" > /dev/null; then
  echo "Frontend running (PID(s):" $(pgrep -f "fhe-kpi-vault/frontend" | tr '\n' ' ') ")"
else
  echo "Frontend not running"
fi
