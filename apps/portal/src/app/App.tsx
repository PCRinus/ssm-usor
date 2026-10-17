import { I18nProvider } from '@lingui/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Button } from '@ssm-usor/ui/components/button';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';

import { AuthContext } from '@/features/auth/auth-context';

import { i18n } from './i18n';
import type { PortalRuntime } from './portal-runtime';
import { PublicFrame } from './public-frame';

export default function App({ runtime }: { runtime: PortalRuntime }) {
  return (
    <I18nProvider i18n={i18n}>
      <Portal runtime={runtime} />
    </I18nProvider>
  );
}

function Portal({ runtime }: { runtime: PortalRuntime }) {
  const { auth, queryClient, router } = runtime;
  const { status } = useSyncExternalStore(auth.subscribe, auth.getSnapshot);
  const { t } = useLingui();

  if (status === 'loading') {
    return (
      <main data-testid="auth-loading" className="grid min-h-svh place-items-center px-4">
        <p role="status" className="text-muted-foreground">
          <Trans>Se încarcă…</Trans>
        </p>
      </main>
    );
  }
  if (status === 'unconfigured' || status === 'error') {
    return (
      <PublicFrame
        testId="auth-unavailable"
        title={t`Portalul nu este disponibil`}
        description={
          <span role="alert">
            {status === 'unconfigured'
              ? t`Accesul la portal nu este încă configurat. Revino puțin mai târziu.`
              : t`Nu am putut restabili sesiunea. Verifică conexiunea și încearcă din nou.`}
          </span>
        }
      >
        <Button className="h-12 w-full" onClick={() => window.location.reload()}>
          <Trans>Încearcă din nou</Trans>
        </Button>
      </PublicFrame>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
