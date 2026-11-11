import { Button } from '@ssm-usor/ui/components/button';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { UserRoundKey } from 'lucide-react';
import { useEffect, useState } from 'react';

import { getGetMeQueryKey, type MeResponse, useEndMyImpersonation } from '@/api/generated/api';

import { leaveIdentity } from './identity';

type Impersonation = NonNullable<MeResponse['impersonation']>;

const clockTime = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' });

const tick = 15_000;

function useExpiry(expiresAt: string) {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(Date.now);
  const expires = Date.parse(expiresAt);

  // The API decides when it ended; a clock ahead of its own gets the same answer again, so the
  // tick keeps asking until the change of identity reloads the page.
  useEffect(() => {
    const askAgain = () => void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    const atExpiry = window.setTimeout(askAgain, Math.max(0, expires - Date.now()));
    const interval = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= expires) askAgain();
    }, tick);
    return () => {
      window.clearTimeout(atExpiry);
      window.clearInterval(interval);
    };
  }, [expires, queryClient]);

  return {
    until: clockTime.format(expires),
    minutesLeft: Math.max(0, Math.ceil((expires - now) / 60_000)),
  };
}

export function ImpersonationBanner({
  impersonation,
  organizationName,
}: {
  impersonation: Impersonation;
  organizationName: string | undefined;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const { until, minutesLeft } = useExpiry(impersonation.expiresAt);
  const end = useEndMyImpersonation({
    request: apiRequest,
    mutation: {
      onSuccess: () => leaveIdentity({ ended: true }),
      onError: () => toast.error('Nu am putut încheia. Verifică conexiunea și încearcă din nou.'),
    },
  });
  const target = [impersonation.targetName ?? 'un membru', organizationName]
    .filter(Boolean)
    .join(' · ');

  return (
    <section
      aria-label="Acționezi ca membru"
      data-testid="impersonation-banner"
      className="flex shrink-0 items-start gap-3 border-b border-warning-border bg-warning px-4 py-2 text-sm text-warning-foreground sm:px-8 md:items-center lg:px-10"
    >
      <UserRoundKey aria-hidden="true" className="mt-0.5 size-4 shrink-0 md:mt-0" />
      <p className="min-w-0 flex-1">
        <span data-testid="impersonation-target" className="font-semibold">
          Acționezi ca {target}
        </span>{' '}
        <span data-testid="impersonation-until" className="block md:inline">
          până la {until} {minutesLeft > 0 ? `(încă ${minutesLeft} min).` : '(se încheie acum).'}
        </span>{' '}
        <span className="block md:inline">
          Semnarea și trimiterile (invitații, coduri) sunt oprite.
        </span>
      </p>
      <Button
        data-testid="impersonation-end"
        size="sm"
        variant="outline"
        disabled={end.isPending || end.isSuccess}
        onClick={() => end.mutate()}
      >
        Încheie
      </Button>
    </section>
  );
}
