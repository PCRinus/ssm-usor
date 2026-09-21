import { Button } from '@ssm-usor/ui/components/button';
import { Toaster } from '@ssm-usor/ui/components/sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useEffect, useSyncExternalStore } from 'react';

import type { AppRuntime } from './app-runtime';
import { AuthContext } from './auth/auth-context';

export default function App({ runtime }: { runtime: AppRuntime }) {
  const { auth, queryClient, router } = runtime;
  const { status } = useSyncExternalStore(auth.subscribe, auth.getSnapshot);

  useEffect(() => {
    if (status === 'unconfigured' || status === 'error') {
      document.title = 'Autentificarea nu este disponibilă — SSM Ușor';
    }
  }, [status]);

  if (status === 'loading') {
    return (
      <main data-testid="auth-loading" className="grid min-h-svh place-items-center p-5">
        <p role="status">Se încarcă…</p>
      </main>
    );
  }
  if (status === 'unconfigured' || status === 'error') {
    return (
      <main data-testid="auth-unavailable" className="mx-auto grid max-w-lg gap-5 px-5 py-20">
        <h1 className="text-2xl font-semibold">Autentificarea nu este disponibilă</h1>
        <p role="alert" className="text-muted-foreground">
          {status === 'unconfigured'
            ? 'Accesul la aplicație nu este încă configurat. Revino puțin mai târziu.'
            : 'Nu am putut restabili sesiunea. Verifică conexiunea și încearcă din nou.'}
        </p>
        <Button onClick={() => window.location.reload()}>Încearcă din nou</Button>
      </main>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <RouterProvider router={router} />
        {/* Confirms actions that leave the user on the same page; errors stay inline. */}
        <Toaster position="bottom-right" closeButton />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
