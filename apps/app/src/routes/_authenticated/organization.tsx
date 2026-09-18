import { Button } from '@ssm-usor/ui/components/button';
import { createFileRoute } from '@tanstack/react-router';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';

import { useMe } from '../../account/use-me';
import { InvitationsCard } from '../../organization/invitations-card';
import { InviteMemberDialog } from '../../organization/invite-member-dialog';
import { roleLabels } from '../../organization/labels';
import { MembersCard } from '../../organization/members-card';

export const Route = createFileRoute('/_authenticated/organization')({
  staticData: { title: 'Organizație' },
  component: OrganizationPage,
});

export function OrganizationPage() {
  const me = useMe();
  const [inviting, setInviting] = useState(false);

  if (me.isPending) {
    return (
      <p role="status" data-testid="organization-loading">
        Se încarcă organizația…
      </p>
    );
  }
  if (me.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
        <p>Nu am putut încărca organizația.</p>
        <Button variant="outline" disabled={me.isFetching} onClick={() => void me.refetch()}>
          Încearcă din nou
        </Button>
      </div>
    );
  }

  const { user, membership } = me.data;
  // The shell sends an account without an organization to onboarding before this renders.
  if (!membership) return null;

  // Hiding the owner's tools is a courtesy; the API and the database enforce the rule.
  const isOwner = membership.role === 'owner';

  return (
    <div data-testid="organization-page" className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {membership.organization.name}
          </h1>
          <p className="mt-3 text-muted-foreground">
            Rolul tău: {roleLabels[membership.role].toLowerCase()}.
            {!isOwner && ' Doar administratorii pot invita membri noi.'}
          </p>
        </div>
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
