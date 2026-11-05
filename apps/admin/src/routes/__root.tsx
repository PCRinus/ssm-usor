import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';

import type { ApiRequestOptions } from '@/api/http';
import { Frame } from '@/components/frame';
import type { AuthStore } from '@/features/auth/auth-store';

export interface RouterContext {
  auth: AuthStore;
  apiRequest: ApiRequestOptions;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
});

function NotFound() {
  return (
    <Frame testId="not-found-page" title="Page not found">
      <Link to="/" className="text-center font-medium underline underline-offset-4">
        Go to the home page
      </Link>
    </Frame>
  );
}

function RouteError() {
  return (
    <Frame
      testId="route-error"
      title="This page could not load"
      description="Reload the page and try again."
    />
  );
}
