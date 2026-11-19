import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';

import App from '@/app/App';
import { createAppRuntime } from '@/app/app-runtime';
import type { AuthClient } from '@/features/auth/auth-store';
import { createQueryClient } from '@/lib/query-client';

import { runtimes } from './runtimes';

export { disposeRuntimes } from './runtimes';

// Not `retry: false`: a test of a failed read still goes through the app's retries.
export function createTestQueryClient() {
  const queryClient = createQueryClient();
  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retryDelay: 0 } });
  return queryClient;
}

export function mountApp(client: AuthClient | null, path = '/dashboard') {
  const runtime = createAppRuntime(
    client,
    createTestQueryClient(),
    createMemoryHistory({ initialEntries: [path] }),
    'http://localhost:8787'
  );
  runtimes.push(runtime);
  render(<App runtime={runtime} />);
  return runtime;
}
