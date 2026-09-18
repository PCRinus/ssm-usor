import { execFileSync } from 'node:child_process';

import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

function commitSha() {
  const configuredSha = process.env.GIT_COMMIT_SHA?.trim();
  if (configuredSha) return configuredSha;

  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'local';
  }
}

export default defineConfig({
  site: 'https://ssmusor.ro',
  output: 'static',
  // Pages reached only from an emailed link stay out of the sitemap.
  integrations: [sitemap({ filter: (page) => !page.includes('/abonare/') })],
  vite: {
    define: {
      'import.meta.env.PUBLIC_COMMIT_SHA': JSON.stringify(commitSha()),
    },
  },
});
