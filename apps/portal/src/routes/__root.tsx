import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';

import type { ApiRequestOptions } from '@/api/http';
import type { AuthStore } from '@/features/auth/auth-store';

export interface RouterContext {
  auth: AuthStore;
  apiRequest: ApiRequestOptions;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
});

function RootLayout() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[30rem] flex-col px-4">
      <Outlet />
    </div>
  );
}

function NotFound() {
  return (
    <main data-testid="not-found-page" className="grid gap-3 py-16">
      <h1 className="text-2xl font-semibold">Pagina nu a fost găsită</h1>
    </main>
  );
}

function RouteError() {
  return (
    <main className="grid gap-3 py-16">
      <h1 className="text-2xl font-semibold">Pagina nu a putut fi încărcată</h1>
      <p className="text-muted-foreground">Reîncarcă pagina și încearcă din nou.</p>
    </main>
  );
}
