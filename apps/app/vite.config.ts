import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    // The router plugin must run before React so file routes are generated first.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    tailwindcss(),
    // React Compiler memoizes components and hooks automatically; lint enforces its rules.
    react({ compiler: true }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
