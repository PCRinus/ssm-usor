import { Button } from '@ssm-usor/ui/components/button';
import { createFileRoute } from '@tanstack/react-router';
import { UserPlus } from 'lucide-react';
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Cine lucrează în organizație și cu ce rol.
          {!isOwner && ' Doar administratorii pot invita membri noi.'}
        </p>
        {isOwner && (
          <Button data-testid="invite-open" onClick={() => setInviting(true)}>
            <UserPlus aria-hidden="true" />
            Invită un membru
          </Button>
        )}
      </div>
      <MembersCard userId={user.id} canManage={isOwner} />
      {isOwner && <InvitationsCard userId={user.id} />}
      <InviteMemberDialog open={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}
