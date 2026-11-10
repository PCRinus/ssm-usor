import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import posthogRollupPlugin from '@posthog/rollup-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

function commitSha() {
  const configuredSha = process.env.GIT_COMMIT_SHA?.trim();
  if (configuredSha) return configuredSha;

  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'local';
  }
}

const commit = commitSha();

// Open tabs compare it with the commit they run to learn of a newer build (ADR 040).
function versionFile(): Plugin {
  return {
    name: 'ssm-usor-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({ commit })}\n`,
      });
    },
  };
}

const posthogApiKey = process.env.POSTHOG_SOURCEMAPS_UPLOAD_KEY;
const posthogProjectId = process.env.POSTHOG_PROJECT_ID;

export default defineConfig({
  build: {
    sourcemap: posthogApiKey && posthogProjectId ? 'hidden' : false,
  },
  define: {
    'import.meta.env.VITE_COMMIT_SHA': JSON.stringify(commit),
    'import.meta.env.VITE_RELEASE_TAG': JSON.stringify(process.env.RELEASE_TAG?.trim() ?? ''),
  },
  plugins: [
    // The router plugin must run before React so file routes are generated first.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    tailwindcss(),
    react({ compiler: true }),
    versionFile(),
    ...(posthogApiKey && posthogProjectId
      ? [
          posthogRollupPlugin({
            personalApiKey: posthogApiKey,
            projectId: posthogProjectId,
            host: 'https://eu.posthog.com',
            sourcemaps: { deleteAfterUpload: true },
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
