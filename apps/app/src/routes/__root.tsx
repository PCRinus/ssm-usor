import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

import type { ApiRequestOptions } from '../api/http';
import type { AuthStore } from '../auth/auth-store';
import { NotFoundPage, RouteErrorPage } from '../components/route-states';

export interface RouterContext {
  auth: AuthStore;
  apiRequest: ApiRequestOptions;
  queryClient: QueryClient;
}

// Devtools ship only in the development server: the mode check is a build-time constant,
// so production builds and tests drop the import entirely.
const Devtools = import.meta.env.MODE === 'development' ? lazy(() => import('../devtools')) : null;

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
  errorComponent: RouteErrorPage,
});

export function RootLayout() {
  return (
    <>
      <Outlet />
      {Devtools && (
        <Suspense fallback={null}>
          <Devtools />
        </Suspense>
      )}
    </>
  );
}
