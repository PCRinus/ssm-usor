import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import astro from 'eslint-plugin-astro';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const scriptFiles = ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}'];
const reactFiles = ['apps/dashboard/**/*.{js,jsx,ts,tsx}'];

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
    '**/node_modules/**',
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
    files: ['**/*.config.{js,mjs,cjs,ts,mts,cts}', 'eslint.config.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
]);
