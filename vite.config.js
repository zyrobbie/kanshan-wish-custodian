import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// GitHub Pages project-path deployment is intentionally not guessed. Set
// VITE_BASE_PATH only after the owner/repository name is frozen.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  build: {
    rollupOptions: {
      input: {
        app: resolve(import.meta.dirname, 'index.html'),
        diagnostic: resolve(import.meta.dirname, 'diagnostic.html'),
      },
    },
  },
});
