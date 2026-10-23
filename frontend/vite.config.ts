/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vitest resolves React through `process.env.NODE_ENV`; a host shell that
// exports `NODE_ENV=production` would pull in the production React build,
// where `act()` is unsupported and every component test fails. Pin the test
// environment before Vite resolves dependencies so `npm test` is repeatable.
if (process.env.VITEST && process.env.NODE_ENV === 'production') {
  process.env.NODE_ENV = 'test';
}

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
