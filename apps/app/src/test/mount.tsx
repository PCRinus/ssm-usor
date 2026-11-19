import { withoutRetryWait } from '@ssm-usor/spa-runtime/testing/query-client';
import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';

import App from '@/app/App';
import { createAppRuntime } from '@/app/app-runtime';
import type { AuthClient } from '@/features/auth/auth-store';
import { createQueryClient } from '@/lib/query-client';

import { runtimes } from './runtimes';

export { disposeRuntimes } from './runtimes';

export const createTestQueryClient = () => withoutRetryWait(createQueryClient());

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
