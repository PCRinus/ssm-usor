import { createRouter, type RouterHistory } from '@tanstack/react-router';

import type { RouterContext } from './routes/__root';
import { routeTree } from './routeTree.gen';

export function createAppRouter(context: RouterContext, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context,
    history,
    defaultPreload: 'intent',
    // Query owns data freshness, including generated Orval query options in loaders.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
  // Routes declare their breadcrumb title; the shell reads it from the matched routes.
  // A route under a client sets fullPage to render without the client summary and tabs.
  interface StaticDataRouteOption {
    title?: string;
    fullPage?: boolean;
  }
}
