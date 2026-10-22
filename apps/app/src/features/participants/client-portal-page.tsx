import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { useRouteContext } from '@tanstack/react-router';

import { getListClientParticipantsQueryKey, useListClientParticipants } from '@/api/generated/api';
import { Notice } from '@/components/notice';
import type { Client } from '@/features/clients/client-form-schema';
import { ClientSignatureRequests } from '@/features/signatures/client-signature-requests';

import { ClientAdministratorCard } from './client-administrator-card';
import { PortalEmployeesCard } from './portal-employees-card';

export function ClientPortalPage({ client, userId }: { client: Client; userId: string }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const list = useListClientParticipants(client.id, {
    request: apiRequest,
    query: { queryKey: [...getListClientParticipantsQueryKey(client.id), userId] },
  });

  if (list.isPending) {
    return (
      <div data-testid="client-portal-page" className="grid gap-6">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (list.isError) {
    return (
      <div data-testid="client-portal-page" className="grid gap-6">
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

  const administrators = list.data.participants.filter(
    (item) => item.kind === 'client_administrator'
  );
  const administratorInvitations = list.data.invitations.filter(
    (item) => item.kind === 'client_administrator'
  );
  const employees = list.data.participants.filter((item) => item.kind === 'employee');
  const employeeInvitations = list.data.invitations.filter((item) => item.kind === 'employee');
  const noAdministrator = administrators.length === 0 && administratorInvitations.length === 0;
  const noEmployee = employees.length === 0;

  return (
    <div data-testid="client-portal-page" className="grid gap-6">
      {(noAdministrator || noEmployee) && (
        <Notice variant="info" title="Fără acces încă" data-testid="client-portal-missing">
          <ul className="grid list-disc gap-1 pl-4">
            {noAdministrator && <li>Administratorul clientului nu a fost invitat în portal.</li>}
            {noEmployee && (
              <li data-testid="client-employees-with-access">
                {employeeInvitations.length === 0
                  ? 'Niciun angajat nu are încă acces la portal. Îi inviți de aici sau din pagina fiecărui angajat.'
                  : 'Niciun angajat nu a intrat încă în portal; invitațiile trimise așteaptă primul cod.'}
              </li>
            )}
          </ul>
        </Notice>
      )}
      <ClientAdministratorCard
        client={client}
        userId={userId}
        administrators={administrators}
        invitations={administratorInvitations}
      />
      <PortalEmployeesCard
        client={client}
        userId={userId}
        participants={employees}
        invitations={employeeInvitations}
      />
      <ClientSignatureRequests clientId={client.id} userId={userId} />
    </div>
  );
}
