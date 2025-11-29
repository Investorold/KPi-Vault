# Architecture Snapshot

## Components
- **Smart Contract (`KpiManager.sol`)**
  - Store encrypted KPI payloads (metricId, timestamp, ciphertext)
  - Maintain access control list per metric stream
  - Emit events for off-chain indexing

- **Backend Relay**
  - Express API: `/metrics/meta`, `/access/grant`, `/access/revoke`
  - Cache metric labels, units, categories for quick lookup
  - Provide HTTPS-friendly bridge and logging for share actions

- **Frontend (React + Vite)**
  - Wallet connect + FHE encryption helpers
  - KPI submission form (encrypt numeric values, optional notes)
  - Dashboard views: table and chart (decrypt on demand)
  - Session-only demo mode with seeded data

## MVP Scope
1. Create encrypted KPIs (date, metric type, numeric value)
2. Decrypt KPIs for authorized wallets
3. Manage share/unshare permissions
4. Visualize decrypted history in charts
5. Provide demo mode without wallet requirement

## Reuse from Task Manager
- Encryption/decryption service (`realContractService` patterns)
- Backend HTTPS handling + timeout safeguards
- Storage helpers switching between session/local storage

## Open Questions
- Preferred charting library (Recharts vs. Chart.js)
- Granularity of metrics (daily only vs. weekly/monthly)
- Need for aggregated computations (averages) pre-decrypt or client-side only
