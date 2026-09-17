import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';

import type { ApiRequestOptions } from '../api/http';
import type { AuthStore } from '../auth/auth-store';
import { NotFoundPage, RouteErrorPage } from '../components/route-states';

export interface RouterContext {
  auth: AuthStore;
  apiRequest: ApiRequestOptions;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFoundPage,
  errorComponent: RouteErrorPage,
});
