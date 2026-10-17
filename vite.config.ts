import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  base: './',
  plugins: [vue()],
  // Scan the application entry, rather than archived Signal sources and releases.
  optimizeDeps: { entries: ['index.html'] },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Native clients keep databases locked; only project source needs HMR.
    watch: { ignored: ['**/.tmp/**', '**/.runtime/**', '**/.recovery/**', '**/.package-secrets/**', '**/.package-staging/**', '**/.toolchains/**', '**/.pnpm-store*/**', '**/release/**', '**/dist/**', '**/dist-electron/**', '**/reference-sources/**', '**/signal-source/**'] }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
