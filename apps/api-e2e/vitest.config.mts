import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/api-e2e',
  test: {
    name: 'api-e2e',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    globalSetup: ['src/support/global-setup.ts'],
    setupFiles: ['src/support/test-setup.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/api-e2e',
      provider: 'v8',
    },
  },
});
