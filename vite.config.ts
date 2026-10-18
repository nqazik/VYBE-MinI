
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/VYBE-MinI/',

  plugins: [
    react(),
    tailwindcss(),

    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],

      manifest: {
        name: 'VYBE Mini',
        short_name: 'VYBE',
        description: 'Watch YouTube together with your friends, in sync.',
        theme_color: '#0a0914',
        background_color: '#0a0914',
        display: 'standalone',
        start_url: '/VYBE-MinI/',
        scope: '/VYBE-MinI/',
        icons: [
          {
            src: '/VYBE-MinI/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/VYBE-MinI/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/VYBE-MinI/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: '/VYBE-MinI/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],

  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 700,
  },
})
