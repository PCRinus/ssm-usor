import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { useMe } from '@/features/account/use-me';
import { TeamCard } from '@/features/organization/team-card';
import { teamListSearch } from '@/features/organization/team-list';

export const Route = createFileRoute('/_authenticated/organizatie/echipa')({
  staticData: { title: 'Echipă', flushSheet: true },
  validateSearch: z.object(teamListSearch),
  component: OrganizationTeamPage,
});

function OrganizationTeamPage() {
  const me = useMe();
  // The layout renders this only once the account and its membership are loaded.
  if (!me.data?.membership) return null;

  const { user, membership, impersonation } = me.data;
  const isOwner = membership.role === 'owner';

  return (
    <div data-testid="organization-team-page">
      <TeamCard userId={user.id} manage={isOwner} canAct={isOwner && !impersonation} />
    </div>
  );
}
