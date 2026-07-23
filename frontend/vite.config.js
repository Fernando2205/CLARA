import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const resetDevelopmentServiceWorker = {
  name: 'clara-reset-development-service-worker',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url?.split('?')[0] !== '/sw.js') {
        next()
        return
      }

      response.statusCode = 200
      response.setHeader('Content-Type', 'application/javascript; charset=utf-8')
      response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
      response.setHeader('Service-Worker-Allowed', '/')
      response.end(`
        self.addEventListener('install', () => self.skipWaiting())
        self.addEventListener('activate', (event) => {
          event.waitUntil((async () => {
            await self.registration.unregister()
            const windows = await self.clients.matchAll({ type: 'window' })
            windows.forEach((windowClient) => windowClient.navigate(windowClient.url))
          })())
        })
      `)
    })
  },
}

export default defineConfig({
  plugins: [
    react(),
    resetDevelopmentServiceWorker,
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.svg', 'icon-512.svg'],
      devOptions: {
        enabled: false,
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
      },
      manifest: {
        name: 'CLARA · Inventarios por voz',
        short_name: 'CLARA',
        description: 'Cuentas claras, cocina tranquila.',
        theme_color: '#0067B1',
        background_color: '#F4FAFD',
        display: 'standalone',
        start_url: '/',
        lang: 'es-CO',
        icons: [
          {
            src: '/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: '/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
})
