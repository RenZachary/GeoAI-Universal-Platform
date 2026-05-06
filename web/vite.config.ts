import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: process.env.VITE_BASE_URL || '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    host: true, // Listen on all addresses
    strictPort: false,
    hmr: {
      overlay: true // Show errors in browser overlay
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        ws: true // Enable WebSocket for SSE
      }
    }
  }
})
