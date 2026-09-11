/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'vena-isotipo.png'],
      manifest: {
        name: 'Vena OS',
        short_name: 'Vena OS',
        description: 'Tu sistema operativo de trabajo: tiempo, consumo de IA, tableros y notas.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F9F9F7',
        theme_color: '#F9F9F7',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Precache only the app shell; Excalidraw and other lazy chunks are cached on first use.
        globPatterns: ['index.html', 'assets/index-*.{js,css}', '*.{png,ico,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: { cacheName: 'vena-assets', expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 90 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Excalidraw reads process.env.IS_PREACT to choose its build.
  define: { 'process.env.IS_PREACT': JSON.stringify('false') },
  build: { chunkSizeWarningLimit: 4000 },
  test: {
    include: ['src/**/*.test.ts', 'supabase/tests/**/*.test.ts', 'collector/**/*.test.mjs'],
  },
});
