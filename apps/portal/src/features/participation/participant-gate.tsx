import { Button } from '@ssm-usor/ui/components/button';
import { Outlet } from '@tanstack/react-router';
import { useState } from 'react';

import { useGetPortalMe } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { useApiRequest } from '@/lib/request';

import { readChosenParticipant, rememberChosenParticipant } from './chosen-participant';
import { ParticipationContext } from './participation-context';
import { SignOutButton } from './sign-out-button';

export function ParticipantGate({ userId }: { userId: string }) {
  const apiRequest = useApiRequest();
  const me = useGetPortalMe({ request: apiRequest });
  const [chosenId, setChosenId] = useState(() => readChosenParticipant(userId));

  if (me.isPending) {
    return (
      <main data-testid="portal-loading" className="grid min-h-svh place-items-center">
        <p role="status" className="text-muted-foreground">
          Se încarcă…
        </p>
      </main>
    );
  }
  if (me.isError) {
    return me.error instanceof ApiHttpError && me.error.status === 403 ? (
      <NoAccess />
    ) : (
      <main data-testid="portal-load-error" className="grid gap-5 py-16">
        <h1 className="text-2xl font-semibold">Portalul nu s-a putut încărca</h1>
        <p role="alert" className="text-muted-foreground">
          Verifică conexiunea la internet și încearcă din nou.
        </p>
        <Button className="h-12" onClick={() => void me.refetch()}>
          Încearcă din nou
        </Button>
      </main>
    );
  }

  const { participations } = me.data;
  const participation =
    participations.length === 1
      ? participations[0]!
      : (participations.find((item) => item.participantId === chosenId) ?? null);

  return (
    <ParticipationContext.Provider
      value={{
        participations,
        participation,
        choose(participantId) {
          rememberChosenParticipant(userId, participantId);
          setChosenId(participantId);
        },
      }}
    >
      <Outlet />
    </ParticipationContext.Provider>
  );
}

function NoAccess() {
  return (
    <main data-testid="portal-no-access" className="grid gap-5 py-16">
      <h1 className="text-2xl font-semibold">Contul acesta nu are acces la portal</h1>
      <p className="leading-relaxed text-muted-foreground">
        Portalul se deschide cu adresa de email sau numărul de telefon la care ai primit invitația.
        Dacă nu ai primit una, cere-i specialistului în securitate și sănătate în muncă al
        angajatorului tău să te invite.
      </p>
      <SignOutButton />
    </main>
  );
}
