import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useRouteContext } from '@tanstack/react-router';
import { Scale } from 'lucide-react';

import { getListLegalChangesQueryKey, useListLegalChanges } from '@/api/generated/api';
import { EmptyState } from '@/components/empty-state';
import { Notice } from '@/components/notice';
import { formatRoDate } from '@/lib/dates';

import { formatDayOf, portalPage, resolutionLabels } from './legislation-labels';

export function LegalChanges({ userId }: { userId: string }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const changes = useListLegalChanges({
    request: apiRequest,
    query: { queryKey: [...getListLegalChangesQueryKey(), userId] },
  });
  const items = changes.data?.items ?? [];
  return (
    <section aria-label="Modificări legislative" className="grid gap-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Formele consolidate noi ale actelor urmărite, cele mai recente primele.
      </p>
      <div className="overflow-hidden rounded-lg border bg-card">
        {changes.isPending ? (
          <div className="p-5">
            <Skeleton className="h-16 w-full" />
          </div>
        ) : changes.isError ? (
          <div className="p-5">
            <Notice
              variant="destructive"
              action={
                <Button
                  variant="outline"
                  disabled={changes.isFetching}
                  onClick={() => void changes.refetch()}
                >
                  Încearcă din nou
                </Button>
              }
            >
              Nu am putut încărca modificările legislative.
            </Notice>
          </div>
        ) : items.length === 0 ? (
          <div className="px-5 py-12" data-testid="legal-changes-empty">
            <EmptyState icon={Scale}>
              Nicio modificare legislativă de când sunt urmărite actele. O formă consolidată nouă a
              unui act apare aici în ziua în care o găsește verificarea.
            </EmptyState>
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((change) => (
              <li key={change.id} data-testid="legal-change" className="grid gap-1.5 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <span className="font-medium">
                    {change.act.portalId ? (
                      <a
                        href={portalPage(change.act.portalId)}
                        target="_blank"
                        rel="noreferrer"
                        className="underline-offset-4 hover:underline"
                      >
                        {change.act.name}
                      </a>
                    ) : (
                      change.act.name
                    )}
                  </span>
                  <Badge
                    data-testid="legal-change-resolution"
                    variant={change.resolution === 'open' ? 'secondary' : 'outline'}
                    className={cn(
                      change.resolution === 'open' &&
                        'border-warning-border bg-warning text-warning-foreground'
                    )}
                  >
                    {resolutionLabels[change.resolution]}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Forma consolidată din {formatRoDate(change.consolidatedOn)}
                  {change.amendingAct && `, după ${change.amendingAct}`}. Găsită pe{' '}
                  {formatDayOf(change.seenAt)}.
                </p>
                {change.resolution !== 'open' && change.resolvedByNote && (
                  <p
                    data-testid="legal-change-note"
                    className="max-w-prose border-l-2 border-primary/50 pl-3 text-sm leading-relaxed"
                  >
                    {change.resolvedByNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
