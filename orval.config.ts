import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    input: './apps/api/openapi.json',
    output: {
      target: './apps/app/src/api/generated/api.ts',
      client: 'react-query',
      formatter: 'prettier',
      override: {
        mutator: { path: './apps/app/src/api/http.ts', name: 'apiFetch' },
        // Our adapter returns the JSON body, without a { data, status } wrapper.
        fetch: { includeHttpResponseReturnType: false },
        // Keep generation on TanStack Query v5 regardless of workspace detection.
        query: { version: 5 },
      },
    },
  },
});
