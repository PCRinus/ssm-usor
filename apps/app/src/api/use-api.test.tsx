import { QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useMe } from '@/features/account/use-me';
import { AuthContext } from '@/features/auth/auth-context';
import type { AuthStore } from '@/features/auth/auth-store';
import { useEmployee } from '@/features/employees/use-employee';
import { useEveryClient } from '@/features/employees/worker-filters';
import { useCurrentEmployees } from '@/features/trainings/training-queries';
import { createQueryClient } from '@/lib/query-client';
import type { RouterContext } from '@/routes/__root';
import { installFetchMock, mockApi } from '@/test/api';
import { makeSession } from '@/test/auth-fixture';
import { clientId, employeeId, employeeRecord, meRecord, pageOf } from '@/test/records';

import { useApi, withUserId } from './use-api';

const userId = 'user-one';

function Harness() {
  useMe();
  useEmployee(clientId, employeeId);
  useEveryClient();
  useCurrentEmployees(clientId);
  const { key, ready } = useApi();
  return <p>{JSON.stringify({ key: key(['/somewhere', { page: 2 }]), ready })}</p>;
}

function mount() {
  const queryClient = createQueryClient();
  const snapshot = { status: 'ready', session: makeSession(userId) };
  const auth = {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
  } as unknown as AuthStore;
  const router = createRouter({
    routeTree: createRootRouteWithContext<RouterContext>()({ component: Harness }),
    context: {
      auth,
      queryClient,
      apiRequest: { baseUrl: 'http://localhost:8787', getAccessToken: () => 'token' },
    },
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(
    <AuthContext.Provider value={auth}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AuthContext.Provider>
  );
  return queryClient;
}

installFetchMock();

describe('useApi', () => {
  it('keys private queries by the signed-in user, last, as they were keyed by hand', async () => {
    mockApi(
      (_init, url) => {
        if (url.pathname === `/clients/${clientId}/employees/${employeeId}`)
          return Response.json({ employee: employeeRecord() });
        if (url.pathname === '/clients') return Response.json(pageOf([]));
        if (url.pathname === `/clients/${clientId}/employees`) return Response.json(pageOf([]));
      },
      { me: meRecord() }
    );
    const queryClient = mount();

    await screen.findByText('{"key":["/somewhere",{"page":2},"user-one"],"ready":true}');
    await waitFor(() => {
      const keys = queryClient
        .getQueryCache()
        .getAll()
        .map(({ queryKey }) => queryKey);
      expect(keys).toEqual(
        expect.arrayContaining([
          ['/me', 'user-one'],
          [`/clients/${clientId}/employees/${employeeId}`, 'user-one'],
          ['/clients', 'every-active', 'user-one'],
          [`/clients/${clientId}/employees`, 'every-current', 'user-one'],
        ])
      );
      expect(keys).toHaveLength(4);
    });
  });

  it('appends the id it was given, undefined for no one signed in', () => {
    expect(withUserId('user-two')(['/me'])).toEqual(['/me', 'user-two']);
    expect(withUserId(undefined)(['/clients', { page: 1 }])).toEqual([
      '/clients',
      { page: 1 },
      undefined,
    ]);
  });
});
