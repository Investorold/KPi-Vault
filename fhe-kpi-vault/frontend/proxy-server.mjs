import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();
const PORT = 4173;

// Add COOP/COEP headers to ALL responses
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// Proxy all requests to Vite dev server
app.use('/', createProxyMiddleware({
  target: 'http://localhost:5173',
  changeOrigin: true,
  ws: true, // WebSocket support for HMR
  logLevel: 'warn',
}));

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('✅ Proxy server running!');
  console.log(`   → External: http://185.197.251.31:${PORT}`);
  console.log(`   → Proxying to: http://localhost:5173`);
  console.log('   → COOP/COEP headers: ✅ ADDED');
  console.log('');
});
