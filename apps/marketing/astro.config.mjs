import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://ssmusor.ro',
  output: 'static',
  integrations: [
    react(),
    sitemap({
      // Local design concepts under /concepte are previews, not public pages.
      filter: (page) => !page.includes('/concepte'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
