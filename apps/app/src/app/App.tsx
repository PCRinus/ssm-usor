import { Toaster } from '@ssm-usor/ui/components/sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { AuthContext } from '@/features/auth/auth-context';
import { ReloadPrompts } from '@/features/reload-prompts/reload-prompts';
import { useToasterOffset } from '@/features/setup-guide/toast-offset';

import type { AppRuntime } from './app-runtime';
import { PublicFrame, PublicFrameAction } from './public-frame';

export default function App({ runtime }: { runtime: AppRuntime }) {
  const { auth, queryClient, router } = runtime;
  const { status } = useSyncExternalStore(auth.subscribe, auth.getSnapshot);
  const toasterOffset = useToasterOffset();
  const reloadPage = useMemo(
    () => ({
      page: () => `${router.state.location.pathname}${router.state.location.searchStr}`,
      subscribeToPage: (listener: () => void) => router.subscribe('onResolved', listener),
    }),
    [router]
  );

  useEffect(() => {
    if (status === 'unconfigured' || status === 'error') {
      document.title = 'Autentificarea nu este disponibilă — SSM Ușor';
    }
  }, [status]);

  if (status === 'loading') {
    return (
      // Plain on purpose: it shows for a moment before every page, the dashboard included.
      <main data-testid="auth-loading" className="grid min-h-svh place-items-center p-5">
        <p role="status">Se încarcă…</p>
      </main>
    );
  }
  if (status === 'unconfigured' || status === 'error') {
    return (
      <PublicFrame
        testId="auth-unavailable"
        title="Autentificarea nu este disponibilă"
        description={
          <span role="alert">
            {status === 'unconfigured'
              ? 'Accesul la aplicație nu este încă configurat. Revino puțin mai târziu.'
              : 'Nu am putut restabili sesiunea. Verifică conexiunea și încearcă din nou.'}
          </span>
        }
      >
        <PublicFrameAction onClick={() => window.location.reload()}>
          Încearcă din nou
        </PublicFrameAction>
      </PublicFrame>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <RouterProvider router={router} />
        {/* Confirms actions that leave the user on the same page; errors stay inline. */}
        <Toaster position="bottom-right" closeButton {...toasterOffset} />
        <ReloadPrompts {...reloadPage} />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
