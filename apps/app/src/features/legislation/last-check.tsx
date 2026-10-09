import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { useRouteContext } from '@tanstack/react-router';
import { ChevronDown, LoaderCircle } from 'lucide-react';
import { useId, useState } from 'react';

import {
  getGetLatestLegalCheckRunQueryKey,
  type LatestLegalCheckRunResponseRun,
  useGetLatestLegalCheckRun,
} from '@/api/generated/api';
import { Notice } from '@/components/notice';

import { countOf, formatDayThisYear, formatTimeOf, momentOf } from './legislation-labels';
import { groupFailures, groupHeading } from './run-failures';
import { useLegalActs } from './use-legal-acts';

const staleAfterMs = 2 * 24 * 60 * 60 * 1000;

type Run = NonNullable<LatestLegalCheckRunResponseRun>;

function found(run: Run) {
  const parts = [countOf(run.actsChecked, 'act citit', 'acte citite')];
  if (run.changesFound > 0) {
    parts.push(countOf(run.changesFound, 'modificare nouă', 'modificări noi'));
  }
  return parts.join(' · ');
}

function failedSummary(run: Run, openedAt: number) {
  const at = `${formatDayThisYear(run.startedAt, openedAt)}, ${formatTimeOf(run.startedAt)}`;
  const errors = run.errors ?? [];
  const acts = errors.filter((error) => error.act !== null).length;
  const what =
    acts === 1
      ? '1 act nu a putut fi citit'
      : acts > 1
        ? `${countOf(acts, 'act', 'acte')} nu au putut fi citite`
        : errors.length > 0
          ? 'verificarea s-a oprit înainte de final'
          : null;
  return `Ultima verificare nu a reușit (${at})${what ? `: ${what}` : ''}.`;
}

export function LastCheck({ userId }: { userId: string }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const latest = useGetLatestLegalCheckRun({
    request: apiRequest,
    query: { queryKey: [...getGetLatestLegalCheckRunQueryKey(), userId] },
  });
  const [openedAt] = useState(() => Date.now());

  if (latest.isPending) return <Skeleton className="h-5 w-80 max-w-full" />;
  if (latest.isError) {
    return (
      <Notice
        variant="destructive"
        data-testid="last-check-error"
        action={
          <Button
            variant="outline"
            size="sm"
            disabled={latest.isFetching}
            onClick={() => void latest.refetch()}
          >
            Încearcă din nou
          </Button>
        }
      >
        Nu am putut afla când a rulat ultima verificare.
      </Notice>
    );
  }

  const { run } = latest.data;
  if (!run) {
    return (
      <Notice variant="warning" data-testid="last-check-never">
        Verificarea nu a rulat încă: actele urmărite nu au fost citite pe Portalul Legislativ.
      </Notice>
    );
  }

  if (run.status === 'failed') {
    return <FailedCheck run={run} userId={userId} summary={failedSummary(run, openedAt)} />;
  }

  const at = run.finishedAt ?? run.startedAt;
  if (openedAt - new Date(at).getTime() > staleAfterMs) {
    return (
      <Notice variant="warning" data-testid="last-check-stale">
        Verificarea nu a mai rulat de peste două zile. Ultima dată: {momentOf(at)}.
      </Notice>
    );
  }

  if (run.status === 'running') {
    return (
      <Notice
        variant="info"
        data-testid="last-check-running"
        icon={<LoaderCircle className="animate-spin" aria-hidden="true" />}
      >
        Verificarea rulează din {momentOf(run.startedAt)}.
      </Notice>
    );
  }

  return (
    <Notice variant="success" data-testid="last-check-ok">
      Verificat pe {momentOf(at)} · {found(run)}
    </Notice>
  );
}

function FailedCheck({ run, userId, summary }: { run: Run; userId: string; summary: string }) {
  const acts = useLegalActs(userId);
  const actNames = new Map((acts.data?.items ?? []).map((act) => [act.id, act.name]));
  const groups = groupFailures(run.errors ?? [], actNames);
  const [open, setOpen] = useState(false);
  const detailsId = useId();

  return (
    <Notice
      variant="warning"
      data-testid="last-check-failed"
      className="sm:[&>svg]:translate-y-1 sm:[&>svg]:self-start"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p>{summary}</p>
        {groups.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            data-testid="last-check-details"
            aria-expanded={open}
            aria-controls={detailsId}
            className="-mx-2 -my-1 px-2 text-inherit hover:bg-warning-border/40 hover:text-inherit"
            onClick={() => setOpen((current) => !current)}
          >
            Detalii
            <ChevronDown
              aria-hidden="true"
              className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
            />
          </Button>
        )}
      </div>
      <div id={detailsId} hidden={!open} className="mt-3 grid gap-3">
        <p>Modificările acestor acte apar pe pagină după o verificare reușită.</p>
        <ul className="grid gap-2.5">
          {groups.map((group) => (
            <li key={group.key} data-testid="last-check-failure-group">
              <p className="font-medium">{groupHeading(group)}</p>
              {group.acts.length > 0 && (
                <p data-testid="last-check-failure-acts" className="leading-relaxed">
                  {group.acts.join(', ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Notice>
  );
}
