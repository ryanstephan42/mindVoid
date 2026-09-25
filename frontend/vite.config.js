import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import process from 'node:process'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const allowedHosts = (env.VITE_ALLOWED_HOSTS || 'dump.stephanfamily.com')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean)
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://backend:8000'

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      port: 3003,
      host: '0.0.0.0',
      allowedHosts,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    },
  }
})
