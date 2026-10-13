import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  base: './',
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Native clients keep databases locked; only project source needs HMR.
    watch: { ignored: ['**/.tmp/**', '**/.runtime/**', '**/.recovery/**', '**/.package-secrets/**', '**/.package-staging/**', '**/.toolchains/**', '**/reference-sources/**', '**/signal-source/**'] }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
