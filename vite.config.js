import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// GitHub Pages only receives the product application. The phase 1 diagnostic
// remains in the repository and can be built locally with an explicit opt-in.
const includeDiagnostic = process.env.VITE_INCLUDE_DIAGNOSTIC === '1';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  build: {
    rollupOptions: {
      input: {
        app: resolve(import.meta.dirname, 'index.html'),
        ...(includeDiagnostic ? { diagnostic: resolve(import.meta.dirname, 'diagnostic.html') } : {}),
      },
    },
  },
});
