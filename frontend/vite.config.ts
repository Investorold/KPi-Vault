import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import crossOriginIsolation from 'vite-plugin-cross-origin-isolation';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    crossOriginIsolation(), // Official plugin that actually works
  ],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
      crypto: 'crypto-browserify',
      stream: 'stream-browserify',
      path: 'path-browserify',
    },
  },
  optimizeDeps: {
    include: ['buffer', 'crypto-browserify', 'stream-browserify', 'path-browserify'],
  },
  server: {
    port: 4173,
    host: '0.0.0.0',
  },
  preview: {
    port: 4173,
    host: '0.0.0.0',
    // Allow the production domain (for reverse proxy/Cloudflare tunnel access)
    allowedHosts: ['kpi-vault.zamataskhub.com', '.zamataskhub.com'],
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
