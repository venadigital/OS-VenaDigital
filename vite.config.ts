/// <reference types="vitest/config" />
import { createReadStream, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * PDF.js asks for fonts, character maps and image decoders by file name inside a folder,
 * so they are served at /pdfjs/<folder>/<file> with their own names (dev) and copied
 * into the build as they are.
 */
function pdfjsAssets(): Plugin {
  const root = fileURLToPath(new URL('./node_modules/pdfjs-dist/', import.meta.url));
  const folders = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];
  return {
    name: 'pdfjs-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs/', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
        if (!folders.includes(rel.split('/')[0]) || rel.includes('..')) return next();
        const file = root + rel;
        try {
          if (!statSync(file).isFile()) return next();
        } catch {
          return next();
        }
        if (file.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
        createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const folder of folders)
        for (const name of readdirSync(root + folder))
          this.emitFile({ type: 'asset', fileName: `pdfjs/${folder}/${name}`, source: readFileSync(`${root}${folder}/${name}`) });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    pdfjsAssets(),
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
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/pdfjs/'),
            handler: 'CacheFirst',
            options: { cacheName: 'vena-pdfjs', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 90 } },
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
