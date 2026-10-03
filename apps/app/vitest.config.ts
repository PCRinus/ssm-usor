import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const include = ['src/**/*.test.{ts,tsx}'];

// Without isolation a worker evaluates each module once for all the files it runs, which
// halves the run. A `vi.mock` cannot replace a module an earlier file already loaded, so
// the files that mock run isolated.
const mocking = globSync(include, { cwd: import.meta.dirname }).filter((file) =>
  /\bvi\.(do)?[mM]ock\(/.test(readFileSync(new URL(file, import.meta.url), 'utf8'))
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    environmentOptions: { jsdom: { url: 'http://localhost:5173/' } },
    // A test that mounts the whole app takes about 3 seconds on CI, close to the default 5.
    testTimeout: 15_000,
    projects: [
      {
        extends: true,
        test: { name: '@ssm-usor/app', include, exclude: mocking, isolate: false },
      },
      {
        extends: true,
        test: { name: '@ssm-usor/app (isolated)', include: mocking },
      },
    ],
  },
});
