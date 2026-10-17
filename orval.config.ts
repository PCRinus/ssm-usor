import { defineConfig } from 'orval';

const override = {
  // Our adapter returns the JSON body, without a { data, status } wrapper.
  fetch: { includeHttpResponseReturnType: false },
  // Keep generation on TanStack Query v5 regardless of workspace detection.
  query: { version: 5 },
} as const;

export default defineConfig({
  api: {
    input: {
      target: './apps/api/openapi.json',
      // Excluding by tag alone keeps only the schemas the remaining operations use and reorders
      // them all; naming the portal's schemas instead (their ids start with `Portal`) leaves the
      // rest of the file in the API's order.
      filters: { mode: 'exclude', tags: ['portal'], schemas: [/^Portal/] },
    },
    output: {
      target: './apps/app/src/api/generated/api.ts',
      client: 'react-query',
      formatter: 'prettier',
      override: {
        ...override,
        mutator: { path: './apps/app/src/api/http.ts', name: 'apiFetch' },
      },
    },
  },
  // Only what a participant may call (ADR 022): the API tags those operations `portal`.
  portal: {
    input: { target: './apps/api/openapi.json', filters: { tags: ['portal'] } },
    output: {
      target: './apps/portal/src/api/generated/api.ts',
      client: 'react-query',
      formatter: 'prettier',
      override: {
        ...override,
        mutator: { path: './apps/portal/src/api/http.ts', name: 'apiFetch' },
      },
    },
  },
});
