import { defineConfig } from 'vite';

// GitHub Pages project-path deployment is intentionally not guessed. Set
// VITE_BASE_PATH only after the owner/repository name is frozen.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
});
