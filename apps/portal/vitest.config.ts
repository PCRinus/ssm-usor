import { fileURLToPath } from 'node:url';

import { lingui } from '@lingui/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [lingui({ macroTransform: true }), react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Turbo starts every package's run at once; a cache shared at the root is cleared by one run
    // while another writes to it (ENOTEMPTY) whenever the lockfile changes.
    fsModuleCachePath: 'node_modules/.vitest-cache',
    name: '@ssm-usor/portal',
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    environmentOptions: { jsdom: { url: 'http://localhost:5174/' } },
  },
});
