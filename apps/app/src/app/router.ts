import { createRouter, type RouterHistory } from '@tanstack/react-router';

import { PageNotFound, RouteError } from '@/app/route-states';
import type { VerifyResult } from '@/features/auth/auth-store';
import type { RouterContext } from '@/routes/__root';
import { routeTree } from '@/routeTree.gen';

export function createAppRouter(context: RouterContext, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context,
    history,
    defaultPreload: 'intent',
    // Query owns data freshness, including generated Orval query options in loaders.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    // Each route catches its own failure inside its parent's outlet, so a failing page keeps
    // the shell around it (ADR 040).
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: PageNotFound,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
  // Routes declare their breadcrumb title; the shell reads it from the matched routes.
  // A route under a client sets fullPage to render without the client summary and tabs.
  // Set by a link from a list to its editor, whose back link then goes back instead.
  interface HistoryState {
    openedFromList?: boolean;
    // A code that failed on another page, as when changing the password, shown on the code page.
    codeFailure?: Exclude<VerifyResult, 'verified'>;
  }
  interface StaticDataRouteOption {
    title?: string;
    fullPage?: boolean;
    editorPage?: boolean;
  }
}
