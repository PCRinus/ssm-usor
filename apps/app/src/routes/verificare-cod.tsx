import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';

import { continueToSchema } from '@/features/auth/second-factor';
import { SecondFactorPage } from '@/features/auth/second-factor-page';

export const Route = createFileRoute('/verificare-cod')({
  staticData: { title: 'Cod de verificare' },
  validateSearch: z.object({ redirect: continueToSchema }),
  beforeLoad: async ({ context: { auth }, search }) => {
    await auth.ready;
    if (!auth.getSnapshot().session) throw redirect({ to: '/autentificare', replace: true });
    if (!(await auth.needsSecondFactor())) {
      throw redirect({ href: search.redirect ?? '/dashboard', replace: true });
    }
  },
  component: SecondFactorRoute,
});

function SecondFactorRoute() {
  const { redirect: continueTo } = Route.useSearch();
  return <SecondFactorPage continueTo={continueTo ?? '/dashboard'} />;
}
