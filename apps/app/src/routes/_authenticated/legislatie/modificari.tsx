import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';

import { useAuth } from '@/features/auth/auth-context';
import { LegalChanges } from '@/features/legislation/legal-changes';

const anchoredChange = /^modificare-([0-9a-f-]{36})$/;

export const Route = createFileRoute('/_authenticated/legislatie/modificari')({
  staticData: { title: 'Modificări' },
  validateSearch: z.object({ page: z.number().int().min(1).optional().catch(undefined) }),
  // Links from before each change had its own page pointed at its row here.
  beforeLoad: ({ location }) => {
    const changeId = anchoredChange.exec(location.hash)?.[1];
    if (changeId) {
      throw redirect({
        to: '/legislatie/modificari/$changeId',
        params: { changeId },
        replace: true,
      });
    }
  },
  component: LegalChangesRoute,
});

function LegalChangesRoute() {
  const { session } = useAuth();
  return <LegalChanges userId={session?.user.id ?? ''} />;
}
