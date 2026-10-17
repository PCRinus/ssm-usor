import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { lingui } from '@lingui/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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
  define: {
    'import.meta.env.VITE_COMMIT_SHA': JSON.stringify(commitSha()),
  },
  plugins: [
    // The router plugin must run before React so file routes are generated first.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    // The macro transform is a `pre` plugin, so macros are expanded before the React Compiler.
    lingui({ macroTransform: true }),
    tailwindcss(),
    react({ compiler: true }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
