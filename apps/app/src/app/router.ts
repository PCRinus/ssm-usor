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
  interface HistoryState {
    // The history index of the page that opened this one (`app/opener.ts`).
    opener?: number;
    // The path of the record that opened this page, when the page finishes by returning to it.
    openerRecord?: string;
    // A code that failed on another page, as when changing the password, shown on the code page.
    codeFailure?: Exclude<VerifyResult, 'verified'>;
  }
  // `title` names the browser tab; a route whose title depends on data returns `crumb` from its
  // loader instead. A route under a client sets fullPage to render without the client summary
  // and tabs.
  interface StaticDataRouteOption {
    title?: string;
    fullPage?: boolean;
    editorPage?: boolean;
  }
}
