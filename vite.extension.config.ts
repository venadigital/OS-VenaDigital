// Builds the Chrome extension's drawing bar into extension/overlay.js, reusing the OS's drawing
// geometry. The result is committed, so the extension loads as it is: npm run extension:build
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  publicDir: false,
  resolve: { alias: { '@': path.join(here, 'src') } },
  build: {
    outDir: 'extension',
    emptyOutDir: false,
    minify: false,
    target: 'chrome120',
    lib: { entry: path.join(here, 'extension/src/overlay.ts'), formats: ['iife'], name: 'VenaOverlay', fileName: () => 'overlay.js' },
  },
});
