import { useLingui } from '@lingui/react/macro';
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';

import type { ApiRequestOptions } from '@/api/http';
import { PublicFrame } from '@/app/public-frame';
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
  const { t } = useLingui();
  return (
    <PublicFrame
      testId="not-found-page"
      title={t`Pagina nu a fost găsită`}
      description={t`Adresa nu duce nicăieri în portal.`}
    >
      <Link to="/" className="text-center font-medium underline underline-offset-4">
        {t`Mergi la pagina principală`}
      </Link>
    </PublicFrame>
  );
}

function RouteError() {
  const { t } = useLingui();
  return (
    <PublicFrame
      testId="route-error"
      title={t`Pagina nu a putut fi încărcată`}
      description={t`Reîncarcă pagina și încearcă din nou.`}
    />
  );
}
