import { createFileRoute } from '@tanstack/react-router';

import { requireStep } from '@/features/auth/require-step';
import { membersSearchOf } from '@/features/members/api';
import { MembersPage } from '@/features/members/members-page';

export const Route = createFileRoute('/members')({
  validateSearch: membersSearchOf,
  beforeLoad: ({ context: { auth } }) => requireStep(auth, 'admin'),
  component: MembersRoute,
});

function MembersRoute() {
  return <MembersPage search={Route.useSearch()} />;
}
