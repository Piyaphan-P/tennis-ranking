import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ADGE Tennis — ranking leaderboard site (mobile-first).
// Dev proxies /api to the local Express server on :8080.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
});
