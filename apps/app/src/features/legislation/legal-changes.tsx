import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useRouteContext } from '@tanstack/react-router';
import { Scale } from 'lucide-react';

import {
  getListLegalChangesQueryKey,
  type LegalChangeListResponseItemsItem as LegalChange,
  useListLegalChanges,
} from '@/api/generated/api';
import { EmptyState, ListEmpty } from '@/components/empty-state';
import { Notice } from '@/components/notice';
import { formatRoDate } from '@/lib/dates';

import { AmendedUnits, ChangedPassages } from './legal-change-details';
import {
  changeStatus,
  formatDayOf,
  listOf,
  portalPage,
  resolutionLabels,
} from './legislation-labels';

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
          <ListEmpty data-testid="legal-changes-empty">
            <EmptyState icon={Scale}>
              Nicio modificare legislativă de când sunt urmărite actele. O formă consolidată nouă a
              unui act apare aici în ziua în care o găsește verificarea.
            </EmptyState>
          </ListEmpty>
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
                <ChangeView change={change} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ChangeView({ change }: { change: LegalChange }) {
  const amendedBy =
    change.amendingActs.length > 0
      ? listOf(change.amendingActs.map((act) => act.name))
      : change.amendingAct;
  const status = changeStatus(change);
  const documents = change.updatedDocuments.map((document) => document.title);
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Forma consolidată din {formatRoDate(change.consolidatedOn)}
        {amendedBy && `, după ${amendedBy}`}. Găsită pe {formatDayOf(change.seenAt)}.
      </p>
      <AmendedUnits change={change} />
      {status && (
        <p data-testid="legal-change-status" className="text-sm">
          {status}
        </p>
      )}
      {change.resolution !== 'open' && change.resolvedByNote && (
        <p
          data-testid="legal-change-note"
          className="max-w-prose border-l-2 border-primary/50 pl-3 text-sm leading-relaxed"
        >
          {change.resolvedByNote}
        </p>
      )}
      {documents.length > 0 && (
        <p data-testid="legal-change-documents" className="text-sm">
          <span className="text-muted-foreground">
            {documents.length === 1 ? 'Șablon nou pentru' : 'Șabloane noi pentru'}:
          </span>{' '}
          {listOf(documents)}
        </p>
      )}
      <ChangedPassages passages={change.passages} />
    </>
  );
}
