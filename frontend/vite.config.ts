import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const backendProxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8000'

export default defineConfig({
  base: '/static/frontend/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../backend/static/frontend',
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: backendProxyTarget,
        changeOrigin: true,
      },
      '/healthz': {
        target: backendProxyTarget,
        changeOrigin: true,
      },
    },
  },
})
