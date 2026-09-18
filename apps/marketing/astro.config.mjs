import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://ssmusor.ro',
  output: 'static',
  // Pages reached only from an emailed link stay out of the sitemap.
  integrations: [sitemap({ filter: (page) => !page.includes('/abonare/') })],
});
