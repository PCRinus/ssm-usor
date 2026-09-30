import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { AcceptInvitationPage } from '@/features/auth/accept-invitation-page';

// Public: the link in an invitation email lands here, signed in or not. Opening it
// changes nothing; only submitting a form accepts.
export const Route = createFileRoute('/accept-invitation')({
  staticData: { title: 'Acceptă invitația' },
  validateSearch: z.object({ token: z.string().optional() }),
  component: AcceptInvitationPage,
});
