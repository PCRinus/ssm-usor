import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link, useRouteContext } from '@tanstack/react-router';
import { Check, ChevronDown, CircleAlert, CircleX, Clock, LoaderCircle } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';

import { getGetLatestLegalCheckRunQueryKey, useGetLatestLegalCheckRun } from '@/api/generated/api';
import { Notice } from '@/components/notice';

import { countOf, formatDayThisYear, formatTimeOf } from './legislation-labels';
import { groupFailures, groupHeading } from './run-failures';
import { useLegalActs } from './use-legal-acts';

const dayMs = 24 * 60 * 60 * 1000;
const staleAfterMs = 2 * dayMs;

const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0);

function daysAgo(isoTimestamp: string, now: number) {
  return Math.round((startOfDay(now) - startOfDay(new Date(isoTimestamp).getTime())) / dayMs);
}

function dayWord(isoTimestamp: string, now: number) {
  const ago = daysAgo(isoTimestamp, now);
  if (ago === 0) return 'azi';
  if (ago === 1) return 'ieri';
  return `pe ${formatDayThisYear(isoTimestamp, now)}`;
}

const factLink =
  'font-medium underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{children}</span>
    </span>
  );
}

function Status({
  icon: Icon,
  tone,
  testId,
  children,
}: {
  icon: typeof Check;
  tone: 'ok' | 'running' | 'failed' | 'warning';
  testId: string;
  children: ReactNode;
}) {
  return (
    <span
      data-testid={testId}
      className={cn(
        'inline-flex items-center gap-1.5 font-medium',
        tone === 'failed' && 'text-destructive-foreground',
        tone === 'warning' && 'text-warning-foreground'
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          'size-4 shrink-0',
          tone === 'ok' && 'text-success-foreground',
          tone === 'running' && 'animate-spin'
        )}
      />
      {children}
    </span>
  );
}

export function LastCheck({ userId }: { userId: string }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const latest = useGetLatestLegalCheckRun({
    request: apiRequest,
    query: { queryKey: [...getGetLatestLegalCheckRunQueryKey(), userId] },
  });
  const acts = useLegalActs(userId);
  const [openedAt] = useState(() => Date.now());
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();

  if (latest.isPending) return <Skeleton className="h-5 w-96 max-w-full" />;
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
  const actItems = acts.data?.items;
  const total = actItems?.length;
  const inAnalysis = actItems?.filter((act) => act.openChange !== null).length ?? 0;
  const analysis = inAnalysis > 0 && (
    <Fact label="În analiză">
      <Link to="/legislatie/modificari" data-testid="last-check-in-analysis" className={factLink}>
        {countOf(inAnalysis, 'modificare', 'modificări')}
      </Link>
    </Fact>
  );
  const read = (checked: number, partial: boolean) => (
    <Fact label="Acte citite">
      <span data-testid="last-check-acts">
        {partial && total !== undefined && checked < total ? `${checked} din ${total}` : checked}
      </span>
    </Fact>
  );

  let facts: ReactNode;
  let details: ReactNode = null;
  if (!run) {
    facts = (
      <>
        <Status icon={CircleAlert} tone="warning" testId="last-check-never">
          Verificarea nu a rulat încă
        </Status>
        <Fact label="Acte citite">niciunul</Fact>
      </>
    );
  } else if (run.status === 'failed') {
    const groups = groupFailures(
      run.errors ?? [],
      new Map((actItems ?? []).map((act) => [act.id, act.name]))
    );
    facts = (
      <>
        <Status icon={CircleX} tone="failed" testId="last-check-failed">
          Verificarea{' '}
          {dayWord(run.startedAt, openedAt) === 'azi'
            ? 'de azi'
            : `din ${formatDayThisYear(run.startedAt, openedAt)}`}{' '}
          nu a reușit
        </Status>
        {read(run.actsChecked, true)}
        {analysis}
        {groups.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            data-testid="last-check-details"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            className="-my-1 h-7 px-2 font-medium"
            onClick={() => setDetailsOpen((current) => !current)}
          >
            Detalii
            <ChevronDown
              aria-hidden="true"
              className={cn('transition-transform', detailsOpen && 'rotate-180')}
            />
          </Button>
        )}
      </>
    );
    details = (
      <div
        id={detailsId}
        hidden={!detailsOpen}
        className="mt-1 grid gap-3 rounded-lg border border-destructive-border bg-destructive-soft px-4 py-3 text-sm text-destructive-foreground"
      >
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
    );
  } else if (openedAt - new Date(run.finishedAt ?? run.startedAt).getTime() > staleAfterMs) {
    // Before the running state: a run cut off keeps running without an end, for good.
    const at = run.finishedAt ?? run.startedAt;
    facts = (
      <>
        <Status icon={Clock} tone="warning" testId="last-check-stale">
          Ultima verificare: {formatDayThisYear(at, openedAt)}, acum{' '}
          {countOf(daysAgo(at, openedAt), 'zi', 'zile')}
        </Status>
        {read(run.actsChecked, false)}
        {analysis}
      </>
    );
  } else if (run.status === 'running') {
    facts = (
      <>
        <Status icon={LoaderCircle} tone="running" testId="last-check-running">
          Verificarea rulează din {formatTimeOf(run.startedAt)}
        </Status>
        {read(run.actsChecked, true)}
        {analysis}
      </>
    );
  } else {
    const at = run.finishedAt ?? run.startedAt;
    facts = (
      <>
        <Status icon={Check} tone="ok" testId="last-check-ok">
          Verificat {dayWord(at, openedAt)} la {formatTimeOf(at)}
        </Status>
        {read(run.actsChecked, false)}
        <Fact label="Modificări noi">
          {run.changesFound > 0 ? (
            <Link
              to="/legislatie/modificari"
              data-testid="last-check-new-changes"
              className={factLink}
            >
              {run.changesFound}
            </Link>
          ) : (
            <span data-testid="last-check-new-changes">niciuna</span>
          )}
        </Fact>
        {analysis}
      </>
    );
  }

  return (
    <div className="grid gap-2">
      <p data-testid="last-check" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {facts}
      </p>
      {details}
    </div>
  );
}
