import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

import type { ApiRequestOptions } from '@/api/http';
import { PageTitle } from '@/app/page-title';
import { NotFoundPage, RouteErrorPage } from '@/app/route-states';
import type { AuthStore } from '@/features/auth/auth-store';

export interface RouterContext {
  auth: AuthStore;
  apiRequest: ApiRequestOptions;
  queryClient: QueryClient;
}

// Devtools ship only in the development server: the mode check is a build-time constant,
// so production builds and tests drop the import entirely.
const Devtools =
  import.meta.env.MODE === 'development' ? lazy(() => import('@/app/devtools')) : null;

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
  errorComponent: RouteErrorPage,
});

export function RootLayout() {
  return (
    <>
      <PageTitle />
      <Outlet />
      {Devtools && (
        <Suspense fallback={null}>
          <Devtools />
        </Suspense>
      )}
    </>
  );
}
