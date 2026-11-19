import { appliedLegalChangePageSize, pageCount } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { keepPreviousData } from '@tanstack/react-query';
import { getRouteApi, Link, useRouteContext } from '@tanstack/react-router';
import { History, Scale } from 'lucide-react';

import {
  type AppliedLegalChangeListResponseItemsItem as AppliedChange,
  getListAppliedLegalChangesQueryKey,
  getListOpenLegalChangesQueryKey,
  type OpenLegalChangeListResponseItemsItem as OpenChange,
  useListAppliedLegalChanges,
  useListOpenLegalChanges,
} from '@/api/generated/api';
import { EmptyState, ListEmpty } from '@/components/empty-state';
import { LoadFailed } from '@/components/load-failed';
import { Pager } from '@/components/pager';

import {
  appliedSentence,
  behindTabOf,
  behindText,
  reachOf,
  underReviewSentence,
} from './legal-change-copy';
import { ChangePanel, ChangeRow, ChangeRows } from './legal-change-row';

const route = getRouteApi('/_authenticated/legislatie/modificari');

export function LegalChanges({ userId }: { userId: string }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const page = route.useSearch({ select: (search) => search.page ?? 1 });
  const navigate = route.useNavigate();
  const params = { page, pageSize: appliedLegalChangePageSize };
  const open = useListOpenLegalChanges({
    request: apiRequest,
    query: { queryKey: [...getListOpenLegalChangesQueryKey(), userId] },
  });
  const applied = useListAppliedLegalChanges(params, {
    request: apiRequest,
    query: {
      queryKey: [...getListAppliedLegalChangesQueryKey(params), userId],
      placeholderData: keepPreviousData,
    },
  });

  if (open.isPending || applied.isPending) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (open.isError || applied.isError) {
    return (
      <LoadFailed
        error={open.error ?? applied.error}
        busy={open.isFetching || applied.isFetching}
        onRetry={() => {
          if (open.isError) void open.refetch();
          if (applied.isError) void applied.refetch();
        }}
      >
        Nu am putut încărca modificările legislative.
      </LoadFailed>
    );
  }

  const openItems = open.data.items;
  const meta = { page, pageSize: applied.data.pageSize, total: applied.data.total };
  if (openItems.length === 0 && meta.total === 0) {
    return (
      <ListEmpty data-testid="legal-changes-empty">
        <EmptyState icon={Scale} title="Nicio modificare legislativă">
          Când verificarea zilnică găsește o formă consolidată nouă a unui act citat în documente,
          modificarea apare aici.
        </EmptyState>
      </ListEmpty>
    );
  }

  const toPage = (next: number) =>
    void navigate({ search: (prev) => ({ ...prev, page: next > 1 ? next : undefined }) });

  return (
    <section aria-label="Modificări legislative" className="grid gap-4 sm:gap-6">
      {openItems.length > 0 && (
        <ChangePanel
          title="În analiză"
          count={openItems.length}
          icon={History}
          help={{ topic: 'legislatie.in-analiza', label: 'Ajutor: modificări în analiză' }}
          testId="legal-changes-open"
        >
          <ChangeRows>
            {openItems.map((change) => (
              <OpenRow key={change.id} change={change} />
            ))}
          </ChangeRows>
        </ChangePanel>
      )}
      {meta.total > 0 && (
        <ChangePanel
          title="Aplicate în documente"
          help={{ topic: 'legislatie.aplicate', label: 'Ajutor: modificări aplicate' }}
          testId="legal-changes-applied"
        >
          {applied.data.items.length === 0 ? (
            <div className="grid justify-items-start gap-3 px-6 py-5 text-sm max-sm:px-4">
              <p>Pagina {page} nu are modificări.</p>
              <Button variant="secondary" size="sm" onClick={() => toPage(pageCount(meta))}>
                Mergi la pagina {pageCount(meta)}
              </Button>
            </div>
          ) : (
            <ChangeRows>
              {applied.data.items.map((change) => (
                <AppliedRow key={change.id} change={change} />
              ))}
            </ChangeRows>
          )}
          {meta.total > meta.pageSize && (
            <Pager
              meta={meta}
              noun={['modificare', 'modificări']}
              disabled={applied.isFetching}
              onPage={toPage}
            />
          )}
        </ChangePanel>
      )}
    </section>
  );
}

function OpenRow({ change }: { change: OpenChange }) {
  const reach = reachOf(change.touched.documents, change.citedBy);
  return (
    <ChangeRow
      changeId={change.id}
      date={change.consolidatedOn}
      act={change.act}
      testId="legal-change-open"
      sentence={underReviewSentence(change.outcome, change.touched.units)}
      line={reach && `${reach.label}: ${reach.text}`}
    />
  );
}

function AppliedRow({ change }: { change: AppliedChange }) {
  const updated = change.updatedDocuments.map((document) => document.title).join(', ');
  return (
    <ChangeRow
      changeId={change.id}
      date={change.consolidatedOn}
      act={change.act}
      testId="legal-change-applied"
      sentence={appliedSentence(change)}
      line={updated && `A actualizat: ${updated}`}
      aside={
        change.behind.documents > 0 && (
          <Link
            to={behindTabOf(change.behind.types)}
            data-testid="legal-change-behind"
            className="relative z-10 text-sm font-medium text-warning-foreground underline decoration-warning-foreground/35 underline-offset-[3px] hover:decoration-warning-foreground"
          >
            {behindText(change.behind.documents)}
          </Link>
        )
      }
    />
  );
}
