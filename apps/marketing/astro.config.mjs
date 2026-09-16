import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://ssmusor.ro',
  output: 'static',
  integrations: [sitemap()],
});
