import { createFileRoute, redirect } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';
import { ParticipantGate } from '@/features/participation/participant-gate';

export const Route = createFileRoute('/_participant')({
  beforeLoad: async ({ context: { auth } }) => {
    await auth.ready;
    if (!auth.getSnapshot().session) throw redirect({ to: '/sign-in', replace: true });
  },
  component: ParticipantLayout,
});

function ParticipantLayout() {
  const { session } = useAuth();
  // Hide the pages at once while the router rechecks a changed session.
  return session ? <ParticipantGate key={session.user.id} userId={session.user.id} /> : null;
}
