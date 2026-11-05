import { createRouter, type RouterHistory } from '@tanstack/react-router';

import type { RouterContext } from '@/routes/__root';
import { routeTree } from '@/routeTree.gen';

export function createAdminRouter(context: RouterContext, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context,
    history,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAdminRouter>;
  }
}
