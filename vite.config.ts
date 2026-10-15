import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Only read PORT and BASE_PATH here. Nothing from .env reaches the browser bundle
  // unless it has the VITE_ prefix, and no secret may use that prefix.
  const env = loadEnv(mode, process.cwd(), '')
  const apiPort = env.PORT || '3001'
  // The path where the app lives: "/" locally, "/sift/" behind the me-momo.co.in router.
  const base = `/${(env.BASE_PATH || '/').replace(/^\/+|\/+$/g, '')}/`.replace('//', '/')

  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
        '@shared': path.resolve(import.meta.dirname, './shared'),
      },
    },
    server: {
      proxy: {
        // The server itself always uses /api (the router removes the base path).
        [`${base}api`]: {
          target: `http://127.0.0.1:${apiPort}`,
          rewrite: (p) => p.slice(base.length - 1),
        },
      },
    },
  }
})
