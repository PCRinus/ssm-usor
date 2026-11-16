import type { ImportInvitee } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { useRouteContext } from '@tanstack/react-router';
import { useCallback, useState } from 'react';

import { getListClientParticipantsQueryKey, useListClientParticipants } from '@/api/generated/api';
import { Notice } from '@/components/notice';
import type { Client } from '@/features/clients/client-form-schema';
import { ClientSignatureRequests } from '@/features/signatures/client-signature-requests';

import { BulkInviteDialog } from './bulk-invite-dialog';
import { ClientAdministratorPanel } from './client-administrator-panel';
import { InviteAdministratorDialog } from './invite-administrator-dialog';
import { type InvitedEmployee, InviteEmployeeDialog } from './invite-employee-dialog';
import type { ParticipantMessage } from './participant-actions';
import { PortalGettingStarted } from './portal-getting-started';
import { NoWorkers, PortalRoster } from './portal-roster';
import type { RosterRow } from './portal-roster-columns';
import { usePortalAccessActions } from './use-portal-access-actions';
import { usePortalRoster } from './use-portal-roster';

export function ClientPortalPage({ client, userId }: { client: Client; userId: string }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const list = useListClientParticipants(client.id, {
    request: apiRequest,
    query: { queryKey: [...getListClientParticipantsQueryKey(client.id), userId] },
  });
  const roster = usePortalRoster(client.id, userId);
  const [message, setMessage] = useState<ParticipantMessage>(null);
  const { actions, dialog: accessDialog } = usePortalAccessActions(client.id, setMessage);
  const [invitingAdministrator, setInvitingAdministrator] = useState(false);
  const [inviting, setInviting] = useState<InvitedEmployee | null>(null);
  const [batch, setBatch] = useState<ImportInvitee[] | null>(null);
  const readOnly = client.archivedAt !== null;
  const inviteRow = useCallback(
    (row: RosterRow) =>
      setInviting({ id: row.id, clientId: row.clientId, email: row.email, phone: row.phone }),
    []
  );

  const { employees, withAccess } = roster;
  if (list.isPending || employees.isPending || withAccess.isPending) {
    return (
      <div data-testid="client-portal-page" className="grid gap-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (list.isError) {
    return (
      <div data-testid="client-portal-page" className="grid gap-4">
        <Notice
          variant="destructive"
          action={
            <Button
              variant="outline"
              disabled={list.isFetching}
              onClick={() => void list.refetch()}
            >
              Încearcă din nou
            </Button>
          }
        >
          Nu am putut încărca accesul la portal.
        </Notice>
      </div>
    );
  }

  // A client has one administrator; a client invited before that rule shows its first.
  const administrator = list.data.participants.find((item) => item.kind === 'client_administrator');
  const administratorInvitation = list.data.invitations.find(
    (item) => item.kind === 'client_administrator'
  );
  const noAdministrator = !administrator && !administratorInvitation;
  const noWorkers = employees.isSuccess && employees.data.unfilteredTotal === 0 && !roster.narrowed;
  const gettingStarted =
    !readOnly && noAdministrator && withAccess.isSuccess && withAccess.data.total === 0;

  const dialogs = (
    <>
      <InviteAdministratorDialog
        client={client}
        userId={userId}
        open={invitingAdministrator}
        onClose={() => setInvitingAdministrator(false)}
        onMessage={setMessage}
      />
      {inviting && (
        <InviteEmployeeDialog
          employee={inviting}
          open
          onClose={() => setInviting(null)}
          onMessage={setMessage}
        />
      )}
      {batch && (
        <BulkInviteDialog
          clientId={client.id}
          source={{ chosen: batch }}
          open
          onClose={(sent) => {
            setBatch(null);
            if (sent) roster.clearChoice();
          }}
        />
      )}
      {accessDialog}
    </>
  );

  if (noWorkers && noAdministrator) {
    return (
      <div data-testid="client-portal-page" className="py-10">
        <NoWorkers clientId={client.id} readOnly={readOnly} />
      </div>
    );
  }

  return (
    <div data-testid="client-portal-page" className="grid gap-4">
      {gettingStarted ? (
        <PortalGettingStarted
          choosing={roster.choosing}
          onInviteAdministrator={() => setInvitingAdministrator(true)}
          onInviteWorkers={() => void roster.chooseUninvited()}
        />
      ) : (
        <ClientAdministratorPanel
          clientId={client.id}
          administrator={administrator}
          invitation={administratorInvitation}
          readOnly={readOnly}
          actions={actions}
          onInvite={() => setInvitingAdministrator(true)}
        />
      )}
      <PortalRoster
        clientId={client.id}
        roster={roster}
        readOnly={readOnly}
        gettingStarted={gettingStarted}
        actions={actions}
        message={message}
        onInvite={inviteRow}
        onInviteChosen={() => setBatch([...roster.chosen.values()])}
      />
      <ClientSignatureRequests
        clientId={client.id}
        userId={userId}
        hideWhenEmpty={gettingStarted}
      />
      {dialogs}
    </div>
  );
}
