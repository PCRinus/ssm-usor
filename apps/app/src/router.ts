import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';

import type { ApiRequestOptions } from './api/http';
import type { AuthStore } from './auth/auth-store';
import { DashboardPage } from './pages/dashboard';
import { LoginPage } from './pages/login';
import { AuthenticatedLayout, NotFoundPage, RouteErrorPage } from './pages/route-states';

interface RouterContext {
  auth: AuthStore;
  apiRequest: ApiRequestOptions;
  queryClient: QueryClient;
}

export function createAppRouter(context: RouterContext, history?: RouterHistory) {
  const root = createRootRouteWithContext<RouterContext>()({
    component: Outlet,
    notFoundComponent: NotFoundPage,
    errorComponent: RouteErrorPage,
  });
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    beforeLoad: () => {
      throw redirect({ to: '/dashboard', replace: true });
    },
  });
  const login = createRoute({
    getParentRoute: () => root,
    path: '/login',
    beforeLoad: async ({ context: { auth } }) => {
      await auth.ready;
      if (auth.getSnapshot().session) throw redirect({ to: '/dashboard', replace: true });
    },
    component: LoginPage,
  });
  const authenticated = createRoute({
    getParentRoute: () => root,
    id: '_authenticated',
    beforeLoad: async ({ context: { auth } }) => {
      await auth.ready;
      if (!auth.getSnapshot().session) throw redirect({ to: '/login', replace: true });
    },
    component: AuthenticatedLayout,
  });
  const dashboard = createRoute({
    getParentRoute: () => authenticated,
    path: '/dashboard',
    component: DashboardPage,
  });

  return createRouter({
    routeTree: root.addChildren([index, login, authenticated.addChildren([dashboard])]),
    context,
    history,
    defaultPreload: 'intent',
    // Query owns data freshness, including future Orval query options in loaders.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
