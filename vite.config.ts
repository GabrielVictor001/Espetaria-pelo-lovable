import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_PORT = process.env.PORT || 3000;

export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    // libera o acesso pelo proxy do preview (https://<porta>-<id>.e2b.app)
    allowedHosts: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
});
