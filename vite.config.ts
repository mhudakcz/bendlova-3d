import { defineConfig } from 'vite';

// Na GitHub Pages běží aplikace pod /<repo>/
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: { chunkSizeWarningLimit: 1000 },
});
