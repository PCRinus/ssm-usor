import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Turbo starts every package's run at once; a cache shared at the root is cleared by one run
    // while another writes to it (ENOTEMPTY) whenever the lockfile changes.
    fsModuleCachePath: 'node_modules/.vitest-cache',
    name: '@ssm-usor/sms',
  },
});
