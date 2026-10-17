import { Trans, useLingui } from '@lingui/react/macro';
import { Button } from '@ssm-usor/ui/components/button';
import { Outlet } from '@tanstack/react-router';
import { useState } from 'react';

import { useGetPortalMe } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { PublicFrame } from '@/app/public-frame';
import { deviceLocale, useActiveLocale } from '@/features/language/locale';
import { useApiRequest } from '@/lib/request';

import { readChosenParticipant, rememberChosenParticipant } from './chosen-participant';
import { ParticipationContext } from './participation-context';
import { SignOutButton } from './sign-out-button';

export function ParticipantGate({ userId }: { userId: string }) {
  const { t } = useLingui();
  const apiRequest = useApiRequest();
  const me = useGetPortalMe({ request: apiRequest });
  const [chosenId, setChosenId] = useState(() => readChosenParticipant(userId));
  const participations = me.data?.participations ?? [];
  const participation =
    participations.length === 1
      ? participations[0]!
      : (participations.find((item) => item.participantId === chosenId) ?? null);
  useActiveLocale(participation?.language ?? deviceLocale());

  if (me.isPending) {
    return (
      <main data-testid="portal-loading" className="grid min-h-svh place-items-center">
        <p role="status" className="text-muted-foreground">
          <Trans>Se încarcă…</Trans>
        </p>
      </main>
    );
  }
  if (me.isError) {
    return me.error instanceof ApiHttpError && me.error.status === 403 ? (
      <PublicFrame
        testId="portal-no-access"
        title={t`Contul acesta nu are acces la portal`}
        description={t`Portalul se deschide cu adresa de email sau numărul de telefon la care ai primit invitația. Dacă nu ai primit una, cere-i specialistului în securitate și sănătate în muncă al angajatorului tău să te invite.`}
      >
        <SignOutButton />
      </PublicFrame>
    ) : (
      <PublicFrame
        testId="portal-load-error"
        title={t`Portalul nu s-a putut încărca`}
        description={
          <span role="alert">{t`Verifică conexiunea la internet și încearcă din nou.`}</span>
        }
      >
        <Button className="h-12 w-full" onClick={() => void me.refetch()}>
          <Trans>Încearcă din nou</Trans>
        </Button>
      </PublicFrame>
    );
  }

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
