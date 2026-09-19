import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import astro from 'eslint-plugin-astro';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const scriptFiles = ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}'];
const reactFiles = ['apps/app/**/*.{js,jsx,ts,tsx}', 'packages/ui/**/*.{js,jsx,ts,tsx}'];

const orderedImports = {
  plugins: {
    'simple-import-sort': simpleImportSort,
  },
  rules: {
    'simple-import-sort/exports': 'error',
    'simple-import-sort/imports': 'error',
  },
};

export default defineConfig([
  globalIgnores([
    '**/.astro/**',
    '**/.turbo/**',
    '**/.wrangler/**',
    '**/dist/**',
    '**/dist-e2e/**',
    'apps/app/src/api/generated/**',
    // The provider's originals, specs, and scratch previews; git ignores them too.
    'packages/document-engine/originals/**',
    'apps/app/src/routeTree.gen.ts',
    '**/node_modules/**',
    '**/playwright-report/**',
    '**/playwright-report-flows/**',
    '**/test-results/**',
    '**/test-results-flows/**',
  ]),
  {
    files: scriptFiles,
    extends: [js.configs.recommended, tseslint.configs.recommended],
    ...orderedImports,
  },
  ...astro.configs.recommended,
  {
    files: ['**/*.astro'],
    ...orderedImports,
  },
  {
    files: reactFiles,
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['packages/ui/**/*.{jsx,tsx}'],
    rules: {
      'react-refresh/only-export-components': [
        'error',
        { allowConstantExport: true, allowExportNames: ['buttonVariants', 'badgeVariants'] },
      ],
    },
  },
  {
    // File-based route modules export the route definition next to their component.
    files: ['apps/app/src/routes/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': [
        'error',
        { allowConstantExport: true, allowExportNames: ['Route'] },
      ],
    },
  },
  {
    files: ['**/*.config.{js,mjs,cjs,ts,mts,cts}', 'eslint.config.mjs', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
]);
