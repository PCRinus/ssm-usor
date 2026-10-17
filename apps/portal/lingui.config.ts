import { defineConfig } from '@lingui/cli';
import { formatter } from '@lingui/format-po';

export default defineConfig({
  sourceLocale: 'ro',
  locales: ['ro'],
  catalogs: [
    {
      path: '<rootDir>/src/locales/{locale}/messages',
      include: ['src'],
      exclude: ['**/*.test.*', 'src/test/**', 'src/api/generated/**'],
    },
  ],
  // Line numbers would rewrite the catalog on every unrelated edit and fail check:generated.
  format: formatter({ lineNumbers: false }),
});
