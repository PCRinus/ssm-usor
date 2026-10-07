import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { useRouteContext } from '@tanstack/react-router';
import { CircleCheck, LoaderCircle } from 'lucide-react';
import { useState } from 'react';

import {
  getGetLatestLegalCheckRunQueryKey,
  type LatestLegalCheckRunResponseRun,
  useGetLatestLegalCheckRun,
} from '@/api/generated/api';
import { Notice } from '@/components/notice';

import { countOf, formatMoment } from './legislation-labels';

const staleAfterMs = 2 * 24 * 60 * 60 * 1000;

function summary(run: NonNullable<LatestLegalCheckRunResponseRun>) {
  const parts = [countOf(run.actsChecked, 'act citit', 'acte citite')];
  parts.push(
    run.changesFound === 0
      ? 'nicio modificare nouă'
      : countOf(run.changesFound, 'modificare nouă', 'modificări noi')
  );
  if (run.actsSkipped > 0) {
    parts.push(countOf(run.actsSkipped, 'act sărit', 'acte sărite'));
  }
  return parts.join(', ');
}

export function LastCheck({
  userId,
  actNames,
}: {
  userId: string;
  actNames: ReadonlyMap<string, string>;
}) {
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
      <Notice variant="warning" data-testid="last-check-never" title="Verificarea nu a rulat încă">
        Actele urmărite nu au fost citite niciodată pe Portalul Legislativ, așa că pagina nu poate
        spune încă dacă legislația s-a schimbat.
      </Notice>
    );
  }

  if (run.status === 'failed') {
    return (
      <Notice
        variant="warning"
        data-testid="last-check-failed"
        title="Ultima verificare nu a reușit"
      >
        <p>
          Verificarea pornită pe {formatMoment(run.startedAt)} nu a putut citi toate actele pe
          Portalul Legislativ. Până la o verificare reușită, modificările acestor acte nu apar aici.
        </p>
        {run.errors && run.errors.length > 0 && (
          <ul className="mt-2 grid gap-1">
            {run.errors.map((error, index) => (
              <li key={error.act ?? `run-${index}`} data-testid="last-check-failed-act">
                {error.act && (
                  <>
                    <span className="font-medium">{actNames.get(error.act) ?? error.act}</span>
                    :{' '}
                  </>
                )}
                {error.message}
              </li>
            ))}
          </ul>
        )}
      </Notice>
    );
  }

  const at = run.finishedAt ?? run.startedAt;
  if (openedAt - new Date(at).getTime() > staleAfterMs) {
    return (
      <Notice
        variant="warning"
        data-testid="last-check-stale"
        title="Verificarea nu a mai rulat de peste două zile"
      >
        Actele au fost citite ultima dată pe Portalul Legislativ pe {formatMoment(at)}. Verificarea
        zilnică pare oprită: modificările apărute de atunci nu sunt încă pe această pagină.
      </Notice>
    );
  }

  if (run.status === 'running') {
    return (
      <p
        data-testid="last-check-running"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" />
        Actele se citesc acum pe Portalul Legislativ, de la {formatMoment(run.startedAt)}.
      </p>
    );
  }

  return (
    <p data-testid="last-check-ok" className="flex items-start gap-2 text-sm text-muted-foreground">
      <CircleCheck className="mt-0.5 size-4 shrink-0 text-success-foreground" aria-hidden="true" />
      <span>
        Ultima verificare pe Portalul Legislativ: {formatMoment(at)}, {summary(run)}.
      </span>
    </p>
  );
}
