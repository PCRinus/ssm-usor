import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { useRouteContext } from '@tanstack/react-router';
import { Send } from 'lucide-react';
import { useState } from 'react';

import { getListClientParticipantsQueryKey, useListClientParticipants } from '@/api/generated/api';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';
import type { Client } from '@/features/clients/client-form-schema';

import { InviteAdministratorDialog } from './invite-administrator-dialog';
import {
  InvitationStatus,
  type ParticipantMessage,
  ParticipantStatus,
} from './participant-actions';

function employeesWithAccess(count: number) {
  if (count === 1) return '1 angajat are acces la portal.';
  const tail = count % 100;
  return tail === 0 || tail >= 20
    ? `${count} de angajați au acces la portal.`
    : `${count} angajați au acces la portal.`;
}

export function ClientAdministratorCard({ client, userId }: { client: Client; userId: string }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const list = useListClientParticipants(client.id, {
    request: apiRequest,
    query: { queryKey: [...getListClientParticipantsQueryKey(client.id), userId] },
  });
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState<ParticipantMessage>(null);
  const readOnly = client.archivedAt !== null;
  const administrators =
    list.data?.participants.filter((item) => item.kind === 'client_administrator') ?? [];
  const invitations =
    list.data?.invitations.filter((item) => item.kind === 'client_administrator') ?? [];
  const employeeCount =
    list.data?.participants.filter((item) => item.kind === 'employee').length ?? 0;
  const noAdministrator = administrators.length === 0 && invitations.length === 0;

  return (
    <SectionCard
      data-testid="client-administrator-card"
      title="Administratorul clientului în portal"
      description="Persoana care ține evidența SSM la client vede în portal angajații, stadiul instruirilor și fișele lor."
      action={
        !readOnly && (
          <Button
            variant="tonal"
            size="sm"
            data-testid="administrator-invite"
            onClick={() => setInviting(true)}
          >
            <Send aria-hidden="true" />
            Invită administratorul
          </Button>
        )
      }
    >
      {message && (
        <Notice variant={message.variant} data-testid="client-administrator-message">
          {message.text}
        </Notice>
      )}
      {list.isPending ? (
        <Skeleton className="h-12 w-full" />
      ) : list.isError ? (
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
      ) : (
        <>
          {(noAdministrator || employeeCount === 0) && (
            <Notice variant="info" title="Fără acces încă" data-testid="client-portal-missing">
              <ul className="grid list-disc gap-1 pl-4">
                {noAdministrator && (
                  <li data-testid="client-administrator-empty">
                    Administratorul clientului nu a fost invitat în portal.
                  </li>
                )}
                {employeeCount === 0 && (
                  <li data-testid="client-employees-with-access">
                    Niciun angajat nu are încă acces la portal. Îi inviți din pagina fiecărui
                    angajat.
                  </li>
                )}
              </ul>
            </Notice>
          )}
          {!noAdministrator && (
            <ul className="grid divide-y">
              {administrators.map((participant) => (
                <li
                  key={participant.id}
                  data-testid="client-administrator-row"
                  className="grid gap-2 py-4 first:pt-0 last:pb-0"
                >
                  <h3 className="text-sm font-semibold">{participant.fullName}</h3>
                  <ParticipantStatus
                    participant={participant}
                    kindShown={false}
                    onMessage={setMessage}
                  />
                </li>
              ))}
              {invitations.map((invitation) => (
                <li
                  key={invitation.id}
                  data-testid="client-administrator-row"
                  className="grid gap-2 py-4 first:pt-0 last:pb-0"
                >
                  <h3 className="text-sm font-semibold">{invitation.fullName}</h3>
                  <InvitationStatus
                    invitation={invitation}
                    readOnly={readOnly}
                    kindShown={false}
                    onMessage={setMessage}
                  />
                </li>
              ))}
            </ul>
          )}
          {employeeCount > 0 && (
            <p data-testid="client-employees-with-access" className="text-sm text-muted-foreground">
              {employeesWithAccess(employeeCount)}
            </p>
          )}
        </>
      )}
      <InviteAdministratorDialog
        client={client}
        userId={userId}
        open={inviting}
        onClose={() => setInviting(false)}
        onMessage={setMessage}
      />
    </SectionCard>
  );
}
