/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const API_TARGET = process.env.CRUMB_API_URL ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Crumb — your easy health journal',
        short_name: 'Crumb',
        description:
          'Log meals by photo, voice or text. See calories, protein and activity at a glance.',
        theme_color: '#FFF8F1',
        background_color: '#FFF8F1',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['health', 'food', 'lifestyle'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Log a meal',
            short_name: 'Log',
            url: '/log',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Snap a meal',
            short_name: 'Snap',
            url: '/log?mode=photo',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // Never serve the app shell for API calls or Firebase's auth helper pages.
        navigateFallbackDenylist: [/^\/api\//, /^\/__\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': API_TARGET },
  },
  preview: {
    port: 4173,
    proxy: { '/api': API_TARGET },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // Firebase (with offline persistence) is the bulk of the first load; it is cached by the
    // service worker, so repeat visits start instantly even offline.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            {
              name: 'firebase',
              test: /node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(@firebase|firebase|re2js)[\\/]/,
            },
            {
              name: 'react',
              test: /node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(react|react-dom|scheduler|react-router)[\\/]/,
            },
            { name: 'vendor', test: /node_modules[\\/](?!(?:\.pnpm[\\/])?fuse)/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});
