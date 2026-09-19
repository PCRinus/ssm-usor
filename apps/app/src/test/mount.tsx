import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';

import App from '../App';
import { type AppRuntime, createAppRuntime } from '../app-runtime';
import type { AuthClient } from '../auth/auth-store';
import { createQueryClient } from '../lib/query-client';

const runtimes: AppRuntime[] = [];

export function mountApp(client: AuthClient | null, path = '/dashboard') {
  const runtime = createAppRuntime(
    client,
    createQueryClient(),
    createMemoryHistory({ initialEntries: [path] }),
    'http://localhost:8787'
  );
  runtimes.push(runtime);
  render(<App runtime={runtime} />);
  return runtime;
}

export function disposeRuntimes() {
  runtimes.splice(0).forEach((runtime) => runtime.dispose());
}
