import { fileURLToPath } from 'node:url';

import posthogRollupPlugin from '@posthog/rollup-plugin';
import { commitSha, versionFile } from '@ssm-usor/spa-runtime/vite';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const commit = commitSha();

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
    versionFile(commit),
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
