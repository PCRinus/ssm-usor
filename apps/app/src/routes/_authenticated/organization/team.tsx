import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import { useMe } from '../../../account/use-me';
import { InvitationsCard } from '../../../organization/invitations-card';
import { InviteMemberDialog } from '../../../organization/invite-member-dialog';
import { MembersCard } from '../../../organization/members-card';

export const Route = createFileRoute('/_authenticated/organization/team')({
  staticData: { title: 'Echipă' },
  component: OrganizationTeamPage,
});

export function OrganizationTeamPage() {
  const me = useMe();
  const [inviting, setInviting] = useState(false);
  // The layout renders this only once the account and its membership are loaded.
  if (!me.data?.membership) return null;

  const { user, membership } = me.data;
  // Hiding the owner's tools is a courtesy; the API and the database enforce the rule.
  const isOwner = membership.role === 'owner';

  return (
    <div data-testid="organization-team-page" className="grid gap-6">
      <MembersCard
        userId={user.id}
        canManage={isOwner}
        onInvite={isOwner ? () => setInviting(true) : undefined}
      />
      {isOwner && <InvitationsCard userId={user.id} />}
      <InviteMemberDialog open={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}
