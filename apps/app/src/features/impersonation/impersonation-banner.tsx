import { Button } from '@ssm-usor/ui/components/button';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { UserRoundKey } from 'lucide-react';
import { useEffect, useState } from 'react';

import { getGetMeQueryKey, type MeResponse, useEndMyImpersonation } from '@/api/generated/api';

import { usePageIdentity } from './page-identity-context';

type Impersonation = NonNullable<MeResponse['impersonation']>;

const clockTime = new Intl.DateTimeFormat('ro-RO', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Bucharest',
});

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

const targetOf = (impersonation: Impersonation, organizationName: string | undefined) =>
  [impersonation.targetName ?? 'un membru', organizationName].filter(Boolean).join(' · ');

export function ImpersonationBanner({
  impersonation,
  organizationName,
}: {
  impersonation: Impersonation;
  organizationName: string | undefined;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const identity = usePageIdentity();
  const { until, minutesLeft } = useExpiry(impersonation.expiresAt);
  const end = useEndMyImpersonation({
    request: apiRequest,
    mutation: {
      onSuccess: () => identity?.leave(true),
      onError: () => toast.error('Nu am putut încheia. Verifică conexiunea și încearcă din nou.'),
    },
  });

  return (
    <section
      aria-label="Acționezi ca membru"
      data-testid="impersonation-banner"
      className="flex shrink-0 items-start gap-3 border-b border-warning-border bg-warning px-4 py-2 text-sm text-warning-foreground sm:px-8 md:items-center lg:px-10"
    >
      <UserRoundKey aria-hidden="true" className="mt-0.5 size-4 shrink-0 md:mt-0" />
      <p className="min-w-0 flex-1">
        <span data-testid="impersonation-target" className="font-semibold">
          Acționezi ca {targetOf(impersonation, organizationName)}
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

// The banner scrolls away with the page; the header stays. On a phone the header has room for the
// icon alone, beside the menu, the logo and the round buttons on the right.
export function ImpersonationMarker({
  impersonation,
  organizationName,
}: {
  impersonation: Impersonation;
  organizationName: string | undefined;
}) {
  const target = targetOf(impersonation, organizationName);
  return (
    <span
      role="img"
      aria-label={`Acționezi ca ${target}, până la ${clockTime.format(Date.parse(impersonation.expiresAt))}.`}
      data-testid="impersonation-marker"
      className="inline-flex h-8 max-w-56 min-w-8 shrink items-center justify-center gap-1.5 rounded-full border border-warning-border bg-warning px-2 text-[13px] font-semibold text-warning-foreground sm:justify-start sm:px-2.5"
    >
      <UserRoundKey aria-hidden="true" className="size-4 shrink-0" />
      <span className="hidden min-w-0 truncate sm:inline">
        {impersonation.targetName ?? 'un membru'}
      </span>
    </span>
  );
}
