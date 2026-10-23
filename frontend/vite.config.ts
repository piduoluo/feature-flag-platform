/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    // Playwright specs live in e2e/ and must not be collected by vitest.
    exclude: ['e2e/**', '**/node_modules/**', '**/dist/**'],
    // Page-level integration tests drive the real router and antd trees; they
    // take 4-10s on an idle machine and several times longer when the suite or
    // the machine is busy. Assertion-level races are covered by
    // asyncUtilTimeout in setupTests.ts; this bounds the whole test.
    testTimeout: 60000,
  },
});
