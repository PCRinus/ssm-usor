import { execFileSync } from 'node:child_process';

import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';

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
  site: process.env.PUBLIC_SITE_URL || 'https://ssmusor.ro',
  output: 'static',
  // The site's CSS is a few kilobytes per page, cheaper inline than as a request that blocks the
  // first paint on a slow phone connection.
  build: { inlineStylesheets: 'always' },
  // Pages reached only from an emailed link stay out of the sitemap.
  integrations: [sitemap({ filter: (page) => !page.includes('/abonare/') })],
  // Fetched from Google at build time and served from our own domain: no render-blocking
  // third-party stylesheet, and visitors' addresses no longer reach Google. Astro's own fallback
  // metrics come from the first file Google lists, the Latin Extended subset, which sized the
  // fallback 25% too wide; flux.css declares fallbacks measured on the Latin files instead.
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Inter',
      cssVariable: '--font-inter',
      weights: ['400 700'],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext'],
      fallbacks: ['Inter Fallback', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      optimizedFallbacks: false,
    },
    {
      provider: fontProviders.google(),
      name: 'Inter Tight',
      cssVariable: '--font-inter-tight',
      weights: ['600 700'],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext'],
      fallbacks: ['Inter Tight Fallback', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      optimizedFallbacks: false,
    },
  ],
  vite: {
    define: {
      'import.meta.env.PUBLIC_COMMIT_SHA': JSON.stringify(commitSha()),
    },
  },
});
