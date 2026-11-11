import type { AdminActiveImpersonation, AdminImpersonation } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { ExternalLink, TriangleAlert, UserRound } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

import { isRefusedByApi } from '@/api/http';
import { formatTime } from '@/lib/format';

import {
  activeImpersonationKey,
  endImpersonation,
  refreshImpersonations,
  targetName,
  useActiveImpersonation,
} from './api';
import { memberAppUrl } from './member-app';

const minute = 60_000;

export function ImpersonationStrip({ width }: { width: string }) {
  const active = useActiveImpersonation();
  if (active.data) {
    return <ActiveStrip key={active.data.id} impersonation={active.data} width={width} />;
  }
  // Without an answer an active impersonation would look like none.
  if (active.isError && active.data === undefined && !isRefusedByApi(active.error)) {
    return (
      <Strip width={width} testId="impersonation-unknown" label="Impersonation unknown">
        <p className="flex min-w-0 flex-1 basis-64 items-start gap-2">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          Could not check whether you are acting as a member.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="bg-background"
          data-testid="impersonation-retry"
          disabled={active.isFetching}
          onClick={() => void active.refetch()}
        >
          Try again
        </Button>
      </Strip>
    );
  }
  return null;
}

function Strip({
  width,
  testId,
  label,
  children,
}: {
  width: string;
  testId: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      data-testid={testId}
      className="border-warning-border bg-warning text-warning-foreground border-b"
    >
      <div
        className={cn(
          'mx-auto flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm sm:px-6',
          width
        )}
      >
        {children}
      </div>
    </div>
  );
}

// The End button leaves the page with the strip; without this, focus would fall to the body.
function focusMainHeading() {
  const target =
    document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('main');
  if (!target) return;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus();
}

function useNowUntil(expiresAt: string) {
  const [now, setNow] = useState(() => Date.now());
  const queryClient = useQueryClient();

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 15_000);
    const expiry = window.setTimeout(
      () => {
        setNow(Date.now());
        void refreshImpersonations(queryClient);
      },
      Math.max(0, Date.parse(expiresAt) - Date.now())
    );
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(expiry);
    };
  }, [expiresAt, queryClient]);

  return now;
}

function ActiveStrip({
  impersonation,
  width,
}: {
  impersonation: AdminImpersonation;
  width: string;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryClient = useQueryClient();
  const now = useNowUntil(impersonation.expiresAt);
  const ending = useMutation({
    mutationFn: () => endImpersonation(apiRequest),
    onSuccess: () => {
      focusMainHeading();
      queryClient.setQueryData<AdminActiveImpersonation>(activeImpersonationKey, {
        impersonation: null,
      });
    },
    onSettled: () => refreshImpersonations(queryClient),
  });

  const left = Date.parse(impersonation.expiresAt) - now;

  const { target } = impersonation;
  return (
    <Strip width={width} testId="impersonation-strip" label="Active impersonation">
      <p className="flex min-w-0 flex-1 basis-64 items-start gap-2">
        <UserRound aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span data-testid="impersonation-summary" className="min-w-0">
          Acting as <span className="font-medium break-all">{targetName(target)}</span>
          {target.organization && ` · ${target.organization.name}`} · ends{' '}
          {left > 0 ? (
            <span className="tabular-nums">
              {formatTime(impersonation.expiresAt)} ({Math.ceil(left / minute)} min left)
            </span>
          ) : (
            'now'
          )}
        </span>
      </p>
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm" className="bg-background">
          <a
            href={memberAppUrl()}
            target="_blank"
            rel="noopener"
            data-testid="impersonation-open-app"
          >
            Open the member app
            <ExternalLink aria-hidden="true" />
          </a>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="bg-background"
          data-testid="impersonation-end"
          disabled={ending.isPending}
          onClick={() => ending.mutate()}
        >
          End
        </Button>
      </div>
      {ending.isError && (
        <p role="alert" className="basis-full font-medium">
          The impersonation could not be ended. Try again.
        </p>
      )}
    </Strip>
  );
}
