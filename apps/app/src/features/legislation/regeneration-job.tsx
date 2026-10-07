import { Progress } from '@ssm-usor/ui/components/progress';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { useRouteContext } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import {
  getGetRegenerationJobQueryKey,
  type RegenerationJobResponseJob,
  useGetRegenerationJob,
} from '@/api/generated/api';
import { Notice } from '@/components/notice';

import { countOf } from './legislation-labels';

export const pollIntervalMs = 2000;

function counts(job: RegenerationJobResponseJob) {
  return [
    countOf(job.done, 'regenerat', 'regenerate'),
    countOf(job.skipped, 'sărit', 'sărite'),
    countOf(job.failed, 'eșuat', 'eșuate'),
  ].join(', ');
}

export function RegenerationJob({
  jobId,
  userId,
  onFinished,
}: {
  jobId: string;
  userId: string;
  onFinished: (job: RegenerationJobResponseJob) => void;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const job = useGetRegenerationJob(jobId, {
    request: apiRequest,
    query: {
      queryKey: [...getGetRegenerationJobQueryKey(jobId), userId],
      refetchInterval: (query) => (query.state.data?.job.finishedAt ? false : pollIntervalMs),
    },
  });
  const finished = job.data?.job.finishedAt ? job.data.job : null;
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (!finished || reported.current === finished.id) return;
    reported.current = finished.id;
    onFinished(finished);
  }, [finished, onFinished]);

  if (!job.data) {
    if (!job.isError) return <Skeleton className="h-12 w-full" />;
    return (
      <Notice variant="destructive" data-testid="regeneration-job-error">
        Nu am putut afla cum merge regenerarea. Pagina încearcă din nou în câteva secunde.
      </Notice>
    );
  }

  const current = job.data.job;
  const handled = current.done + current.skipped + current.failed;
  if (!current.finishedAt) {
    return (
      <div data-testid="regeneration-progress" className="grid gap-2" role="status">
        <p className="text-sm font-medium">
          Se regenerează: {handled} din {countOf(current.total, 'client', 'clienți')}
        </p>
        <Progress
          value={(handled / current.total) * 100}
          aria-label="Clienți regenerați"
          aria-valuetext={`${handled} din ${current.total}`}
        />
        <p className="text-sm text-muted-foreground">{counts(current)}</p>
      </div>
    );
  }

  const leftOut = current.items.filter(
    (item) => item.status === 'skipped' || item.status === 'failed'
  );
  return (
    <Notice
      variant={leftOut.length > 0 ? 'warning' : 'success'}
      data-testid="regeneration-result"
      title="Regenerarea s-a încheiat"
    >
      <p data-testid="regeneration-result-counts">
        Din {countOf(current.total, 'client', 'clienți')}: {counts(current)}.
        {current.done > 0 && ' Ciornele noi se emit de pe pagina fiecărui client.'}
      </p>
      {leftOut.length > 0 && (
        <ul className="mt-2 grid gap-1">
          {leftOut.map((item) => (
            <li key={item.clientId} data-testid="regeneration-left-out">
              <span className="font-medium">{item.clientName}</span>
              {item.status === 'skipped' ? ' (sărit)' : ' (eșuat)'}
              {item.detail && `: ${item.detail}`}
            </li>
          ))}
        </ul>
      )}
    </Notice>
  );
}
