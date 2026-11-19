import { Button } from '@ssm-usor/ui/components/button';
import { useIsMobile } from '@ssm-usor/ui/hooks/use-mobile';
import { toast } from '@ssm-usor/ui/lib/toast';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { BriefcaseBusiness, Plus, SearchX } from 'lucide-react';
import { forwardRef, useMemo, useRef, useState } from 'react';

import {
  getListJobPositionsQueryKey,
  getListRiskEvaluationsQueryKey,
  useListJobPositions,
  useListRiskEvaluations,
  useRemoveJobPosition,
} from '@/api/generated/api';
import { apiErrorReason, ApiHttpError } from '@/api/http';
import { useApi } from '@/api/use-api';
import { keepOpener, openedHere } from '@/app/opener';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState, ListEmpty } from '@/components/empty-state';
import { ListCardHeader, ListCount } from '@/components/list-card-header';
import { AppliedFilters } from '@/components/list-filters/applied-filters';
import { ListFilters } from '@/components/list-filters/list-filters';
import type { ListFilterValues } from '@/components/list-filters/types';
import { listFilterSearch } from '@/components/list-filters/url';
import { Notice } from '@/components/notice';
import { useFocusRequest } from '@/features/missing-data/focus';
import { commonFailure } from '@/lib/api-errors';

import { jobPositionColumns } from './job-position-columns';
import { JobPositionDialog, type JobPositionEditing } from './job-position-dialog';
import {
  defaultJobPositionSort,
  isUndecided,
  jobPositionFacets,
  type JobPositionFilterKey,
  jobPositionFilterKeys,
  type JobPositionListSearch,
  type JobPositionRow,
  type JobPositionSortKey,
  positionNoun,
  shownJobPositions,
} from './job-position-list';
import { employeeCountLabel, type JobPosition } from './job-position-schema';

const route = getRouteApi('/_authenticated/clienti/$clientId/posturi/');

const rowKey = (row: JobPositionRow) => row.position.id;

// The posts a client employs people in (ADR 006). `readOnly` is an archived client.
export function JobPositionsCard({
  clientId,
  readOnly,
  focus,
}: {
  clientId: string;
  readOnly: boolean;
  focus?: 'add-position';
}) {
  const { request, queryClient, key } = useApi();
  const search = route.useSearch();
  const navigate = useNavigate();
  const routeNavigate = route.useNavigate();
  const phone = useIsMobile();
  const positions = useListJobPositions(clientId, {
    request,
    query: { queryKey: key(getListJobPositionsQueryKey(clientId)) },
  });
  const evaluations = useListRiskEvaluations(clientId, {
    request,
    query: { queryKey: key(getListRiskEvaluationsQueryKey(clientId)) },
  });
  const remove = useRemoveJobPosition({ request });
  const [editing, setEditing] = useState<JobPositionEditing>(null);
  const [removing, setRemoving] = useState<JobPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  useFocusRequest(focus === 'add-position', {
    ready: positions.isSuccess,
    anchor: () => addRef.current,
    open: readOnly ? undefined : () => setEditing('new'),
  });

  const rows = useMemo<JobPositionRow[]>(() => {
    const evaluationOf = new Map(
      (evaluations.data?.items ?? []).flatMap((evaluation) =>
        evaluation.jobPosition ? [[evaluation.jobPosition.id, evaluation] as const] : []
      )
    );
    return (positions.data?.items ?? []).map((position) => ({
      position,
      evaluation: evaluations.data ? (evaluationOf.get(position.id) ?? null) : undefined,
    }));
  }, [positions.data, evaluations.data]);
  const listFilters = listFilterSearch({
    keys: jobPositionFilterKeys,
    facets: jobPositionFacets,
    search,
  });
  const filtered = listFilters.applied;
  const shown = shownJobPositions(rows, search);
  const all = rows.length;
  const undecided =
    readOnly || !evaluations.isSuccess ? 0 : rows.filter((row) => isUndecided(row)).length;

  const changeSearch = (next: Partial<typeof search>) =>
    void routeNavigate({
      state: keepOpener,
      replace: true,
      resetScroll: false,
      search: (prev) => ({ ...prev, ...next }),
    });
  const changeFilters = (values: ListFilterValues<JobPositionFilterKey>) =>
    changeSearch(listFilters.searchOf(values) as Partial<typeof search>);
  const columns = useMemo(
    () =>
      jobPositionColumns({
        clientId,
        readOnly,
        onEdit: setEditing,
        onRemove: setRemoving,
      }),
    [clientId, readOnly]
  );

  async function removePosition(position: JobPosition) {
    setError(null);
    try {
      await remove.mutateAsync({ clientId, jobPositionId: position.id });
      toast.success(`Postul „${position.name}” a fost șters.`);
    } catch (cause) {
      setError(
        commonFailure(cause) ??
          (apiErrorReason(cause) === 'job_position_held'
            ? `Pe postul „${position.name}” mai sunt lucrători. Mută-i pe alt post înainte să îl ștergi.`
            : cause instanceof ApiHttpError && cause.status === 404
              ? `Postul „${position.name}” nu mai există la acest client.`
              : 'Nu am putut șterge postul de lucru. Verifică conexiunea și încearcă din nou.')
      );
    }
    setRemoving(null);
    // Also after a failure: the list on screen may be out of date.
    await queryClient.invalidateQueries({ queryKey: getListJobPositionsQueryKey(clientId) });
  }

  const empty = positions.isSuccess && all === 0;

  return (
    <div
      data-testid="job-positions-card"
      data-sheet-panel
      className="scroll-mt-32 overflow-hidden rounded-lg border bg-card"
    >
      {empty ? (
        <ListEmpty>
          <EmptyState
            icon={BriefcaseBusiness}
            title="Niciun post de lucru încă"
            data-testid="job-positions-empty"
            actions={!readOnly && <AddButton ref={addRef} onClick={() => setEditing('new')} />}
          >
            {readOnly
              ? 'Clientul nu are posturi de lucru și, fiind arhivat, nu i se mai adaugă.'
              : 'Adaugă posturile clientului sau începe cu lucrătorii: fiecare funcție nouă devine un post. Din documentația clientului le poți completa pe toate odată.'}
          </EmptyState>
        </ListEmpty>
      ) : (
        <>
          {positions.isSuccess && (
            <>
              <ListCardHeader>
                <ListFilters
                  facets={jobPositionFacets}
                  values={listFilters.values}
                  onChange={changeFilters}
                  total={shown.length}
                  applyLabel={(pending) =>
                    `Arată ${positionNoun(
                      shownJobPositions(rows, {
                        staffCategory: listFilters.searchOf(pending)
                          .staffCategory as JobPositionListSearch['staffCategory'],
                      }).length
                    )}`
                  }
                  countLabel={positionNoun}
                  testId="job-positions-filters"
                  align="start"
                />
                <div className="order-last flex w-full flex-wrap items-center gap-x-4 gap-y-1 sm:order-none sm:w-auto">
                  <ListCount testId="job-positions-count" className="ml-0">
                    {filtered ? (
                      <>
                        <b className="font-semibold text-foreground">{shown.length}</b> din{' '}
                        {phone ? all : positionNoun(all)}
                      </>
                    ) : (
                      positionNoun(all)
                    )}
                  </ListCount>
                  {undecided > 0 && (
                    <span
                      className="text-sm whitespace-nowrap"
                      data-testid="job-positions-undecided"
                    >
                      <span className="text-muted-foreground">De stabilit: </span>
                      <span className="font-medium text-warning-foreground">
                        {positionNoun(undecided)}
                      </span>
                    </span>
                  )}
                </div>
                {!readOnly && (
                  <AddButton ref={addRef} className="ml-auto" onClick={() => setEditing('new')} />
                )}
              </ListCardHeader>
              <AppliedFilters
                facets={jobPositionFacets}
                values={listFilters.values}
                onChange={changeFilters}
                testId="job-positions-applied-filters"
              />
            </>
          )}
          {error && (
            <div className="border-b px-5 py-3">
              <Notice variant="destructive" data-testid="job-positions-error">
                {error}
              </Notice>
            </div>
          )}
          <DataTable
            testId="job-positions-table"
            rowTestId="job-position-row"
            label="Posturile de lucru ale clientului"
            columns={columns}
            data={positions.isSuccess ? shown : undefined}
            rowKey={rowKey}
            onRowClick={(row) =>
              void navigate({
                to: '/clienti/$clientId/posturi/$jobPositionId',
                state: openedHere,
                params: { clientId, jobPositionId: row.position.id },
              })
            }
            status={positions.status}
            sort={{
              sort: search.sort ?? defaultJobPositionSort.sort,
              order: search.order ?? defaultJobPositionSort.order,
            }}
            onSortChange={(next) =>
              changeSearch({
                sort:
                  next.sort === defaultJobPositionSort.sort
                    ? undefined
                    : (next.sort as JobPositionSortKey),
                order: next.order === defaultJobPositionSort.order ? undefined : next.order,
              })
            }
            error={
              <Notice
                variant="destructive"
                action={
                  <Button
                    variant="outline"
                    disabled={positions.isFetching}
                    onClick={() => void positions.refetch()}
                  >
                    Încearcă din nou
                  </Button>
                }
              >
                Nu am putut încărca posturile de lucru.
              </Notice>
            }
            empty={
              <EmptyState
                icon={SearchX}
                title="Niciun post nu se potrivește"
                data-testid="job-positions-empty-filtered"
                actions={
                  <Button
                    variant="outline"
                    data-testid="job-positions-empty-filtered-clear"
                    onClick={() => changeFilters({})}
                  >
                    Șterge filtrele
                  </Button>
                }
              >
                Clientul nu are posturi din categoria aleasă. Scoate filtrul de mai sus sau pornește
                din nou de la toate posturile.
              </EmptyState>
            }
          />
        </>
      )}
      <JobPositionDialog clientId={clientId} editing={editing} onClose={() => setEditing(null)} />
      {removing && (
        <ConfirmDialog
          open
          busy={remove.isPending}
          confirmDisabled={removing.employeeCount > 0}
          testId="job-position-remove"
          title="Ștergi postul de lucru?"
          confirmLabel="Șterge"
          pendingLabel="Se șterge…"
          onConfirm={() => void removePosition(removing)}
          onClose={() => setRemoving(null)}
        >
          <span className="font-medium text-foreground">{removing.name}</span>
          {removing.employeeCount > 0
            ? ` este ocupat acum: ${employeeCountLabel(removing.employeeCount).toLowerCase()}. Un post se poate șterge doar după ce oamenii de pe el trec pe alt post sau pleacă.`
            : ' nu va mai apărea în listă și nu va mai putea fi ales pentru un lucrător. Dacă l-au ocupat oameni care au plecat, istoricul lor îl păstrează.'}
        </ConfirmDialog>
      )}
    </div>
  );
}

const AddButton = forwardRef<HTMLButtonElement, { className?: string; onClick: () => void }>(
  function AddButton({ className, onClick }, ref) {
    return (
      <Button ref={ref} className={className} data-testid="job-position-add" onClick={onClick}>
        <Plus aria-hidden="true" />
        Adaugă un post
      </Button>
    );
  }
);
