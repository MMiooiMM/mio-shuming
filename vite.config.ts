import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base keeps the build deployable at any GitHub Pages path
  // (user page `/` or project page `/<repo>/`) without rebuilding.
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
