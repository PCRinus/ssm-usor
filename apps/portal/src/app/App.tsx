import { Button } from '@ssm-usor/ui/components/button';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';

import { AuthContext } from '@/features/auth/auth-context';

import type { PortalRuntime } from './portal-runtime';

export default function App({ runtime }: { runtime: PortalRuntime }) {
  const { auth, queryClient, router } = runtime;
  const { status } = useSyncExternalStore(auth.subscribe, auth.getSnapshot);

  if (status === 'loading') {
    return (
      <main data-testid="auth-loading" className="grid min-h-svh place-items-center px-4">
        <p role="status">Se încarcă…</p>
      </main>
    );
  }
  if (status === 'unconfigured' || status === 'error') {
    return (
      <main
        data-testid="auth-unavailable"
        className="mx-auto grid w-full max-w-[30rem] gap-5 px-4 py-16"
      >
        <h1 className="text-2xl font-semibold">Portalul nu este disponibil</h1>
        <p role="alert" className="text-muted-foreground">
          {status === 'unconfigured'
            ? 'Accesul la portal nu este încă configurat. Revino puțin mai târziu.'
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
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
