import {
  defaultPageSize,
  type TrainingDomain,
  trainingDomainLabels,
  trainingDomains,
  type TrainingSortKey,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { useIsMobile } from '@ssm-usor/ui/hooks/use-mobile';
import { keepPreviousData } from '@tanstack/react-query';
import { getRouteApi, useRouteContext } from '@tanstack/react-router';
import { ClipboardCheck, Plus, SearchX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import {
  getListTrainingsQueryKey,
  type ListTrainingsParams,
  useListTrainings,
} from '@/api/generated/api';
import { keepOpener } from '@/app/opener';
import type { DataTableSort } from '@/components/data-table/columns';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/empty-state';
import { FilterTab, FilterTabs, ListCardHeader, ListCount } from '@/components/list-card-header';
import { AppliedFilters } from '@/components/list-filters/applied-filters';
import { ListFilters } from '@/components/list-filters/list-filters';
import type { ListFilterValues } from '@/components/list-filters/types';
import { listFilterSearch, periodSearch, periodValue } from '@/components/list-filters/url';
import { SearchInput } from '@/components/search-input';
import { useAuth } from '@/features/auth/auth-context';
import { sheetFlushList } from '@/features/clients/sheet-flush';
import { WorkersListError } from '@/features/employees/workers-list';

import { DeleteTrainingDialog, type TrainingToDelete } from './delete-training-dialog';
import { trainingColumns, trainingLabel, type TrainingRow } from './training-columns';
import { TrainingDetails } from './training-details';
import { TrainingDialog, type TrainingDialogTarget } from './training-dialog';
import {
  clientTrainingFacets,
  type TrainingFilterKey,
  trainingFilterKeys,
  trainingNoun,
} from './training-filters';

const route = getRouteApi('/_authenticated/clienti/$clientId/instruiri-tinute');
const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');

const defaultSort: DataTableSort & { sort: TrainingSortKey } = { sort: 'heldOn', order: 'desc' };

const domainFilters: { domain: TrainingDomain | undefined; label: string }[] = [
  { domain: undefined, label: 'Toate' },
  ...trainingDomains.map((domain) => ({ domain, label: trainingDomainLabels[domain] })),
];

type Filters = Pick<ListTrainingsParams, 'phase' | 'signatures' | 'mode' | 'from' | 'to'>;

const rowKey = (row: TrainingRow) => row.id;

function PendingTrainingsLabel({
  clientId,
  params,
}: {
  clientId: string;
  params: ListTrainingsParams;
}) {
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const total = useListTrainings(clientId, params, {
    request: apiRequest,
    query: {
      queryKey: [...getListTrainingsQueryKey(clientId, params), session?.user.id],
      enabled: Boolean(session && apiRequest.baseUrl),
      placeholderData: keepPreviousData,
    },
  }).data?.total;
  return total === undefined ? 'Arată rezultatele' : `Arată ${trainingNoun(total)}`;
}

export function ClientTrainingsPage() {
  const search = route.useSearch();
  const { domain, page, sort = defaultSort.sort, order = defaultSort.order, q, open } = search;
  const navigate = route.useNavigate();
  const { client } = clientRoute.useLoaderData();
  const clientId = client.id;
  const readOnly = client.archivedAt !== null;
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const phone = useIsMobile();
  const listFilters = listFilterSearch({
    keys: trainingFilterKeys,
    facets: clientTrainingFacets,
    search: { ...search, period: periodValue(search.from, search.to) },
  });
  const toSearch = (values: ListFilterValues<TrainingFilterKey>): Filters => {
    const { period, ...rest } = listFilters.searchOf(values);
    return { ...rest, ...periodSearch(period) } as Filters;
  };
  const filters = toSearch(listFilters.values);
  const filtered = listFilters.applied;
  const narrowed = filtered || Boolean(q);
  const params: ListTrainingsParams = {
    ...(domain ? { domain: [domain] } : {}),
    ...(q ? { q } : {}),
    ...(page ? { page } : open ? { open } : {}),
    pageSize: defaultPageSize,
    sort,
    order,
    ...filters,
  };
  const trainings = useListTrainings(clientId, params, {
    request: apiRequest,
    query: {
      queryKey: [...getListTrainingsQueryKey(clientId, params), userId],
      enabled: Boolean(userId && apiRequest.baseUrl),
      placeholderData: keepPreviousData,
    },
  });
  const meta = trainings.data ?? { page: page ?? 1, pageSize: defaultPageSize, total: 0 };
  const unfilteredTotal = trainings.data?.unfilteredTotal ?? 0;
  const listStatus = !apiRequest.baseUrl ? 'error' : trainings.status;
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set(open ? [open] : []));
  const [target, setTarget] = useState<TrainingDialogTarget | null>(null);
  const [deleting, setDeleting] = useState<TrainingToDelete | null>(null);

  // A link from a worker's tab names the training, not its page: the answer says which page
  // holds it, and the address keeps that page so that paging on goes from there.
  const landedOn = !page && open && !trainings.isPlaceholderData ? trainings.data?.page : undefined;
  useEffect(() => {
    if (landedOn && landedOn > 1) {
      void navigate({
        state: keepOpener,
        replace: true,
        resetScroll: false,
        search: (prev) => ({ ...prev, page: landedOn }),
      });
    }
  }, [landedOn, navigate]);

  const columns = useMemo(
    () =>
      trainingColumns({
        onEdit: readOnly
          ? undefined
          : (training) => setTarget({ kind: 'edit', trainingId: training.id }),
        onDelete: (training) =>
          setDeleting({
            id: training.id,
            phase: training.phase,
            heldOn: training.heldOn,
            attendeeCount: training.attendeeCount,
          }),
      }),
    [readOnly]
  );
  const toggle = (training: TrainingRow) =>
    setOpened((current) => {
      const next = new Set(current);
      if (!next.delete(training.id)) next.add(training.id);
      return next;
    });
  const changeSearch = (next: Partial<typeof search>) =>
    void navigate({
      state: keepOpener,
      replace: true,
      resetScroll: false,
      search: (prev) => ({ ...prev, ...next, page: undefined, open: undefined }),
    });
  const changeFilters = (values: ListFilterValues<TrainingFilterKey>) =>
    changeSearch(toSearch(values));
  const record = () => setTarget({ kind: 'new', domain: domain ?? 'ssm', phase: 'periodic' });
  const recordButton = (
    <Button data-testid="trainings-record" onClick={record}>
      <Plus aria-hidden="true" />
      Înregistrează o instruire
    </Button>
  );
  const empty = trainings.isSuccess && !narrowed && unfilteredTotal === 0;

  return (
    <div data-testid="client-trainings-page" className="space-y-5">
      <h2 className="sr-only">Instruiri ținute</h2>
      <div className={sheetFlushList}>
        <ListCardHeader>
          {!readOnly && trainings.isSuccess && !empty && (
            <div className="grid w-full md:order-last md:ml-auto md:flex md:w-auto">
              {recordButton}
            </div>
          )}
          <FilterTabs label="Filtrează după domeniu">
            {domainFilters.map((filter) => (
              <FilterTab
                key={filter.label}
                to="/clienti/$clientId/instruiri-tinute"
                params={{ clientId }}
                state={keepOpener}
                search={{ ...search, domain: filter.domain, page: undefined, open: undefined }}
                data-testid="trainings-filter-domain"
                data-domain={filter.domain ?? 'all'}
                active={filter.domain === domain}
                replace
                resetScroll={false}
              >
                {filter.label}
              </FilterTab>
            ))}
          </FilterTabs>
          {(unfilteredTotal > 0 || narrowed) && (
            <div className="order-last flex w-full gap-2 md:order-none md:w-auto md:max-w-xl md:grow">
              <SearchInput
                value={q}
                onSearch={(next) => changeSearch({ q: next || undefined })}
                placeholder={phone ? 'Caută un nume' : 'Caută după numele unui participant'}
                label="Caută după participant"
                testId="trainings-search"
              />
              <ListFilters
                facets={clientTrainingFacets}
                values={listFilters.values}
                onChange={changeFilters}
                total={trainings.isSuccess && !trainings.isPlaceholderData ? meta.total : undefined}
                applyLabel={(pending) => (
                  <PendingTrainingsLabel
                    clientId={clientId}
                    params={{
                      ...params,
                      page: 1,
                      open: undefined,
                      pageSize: 1,
                      ...toSearch(pending),
                    }}
                  />
                )}
                countLabel={trainingNoun}
                testId="trainings-filters"
              />
            </div>
          )}
          {trainings.isSuccess && (
            <ListCount testId="trainings-count" className="md:ml-0">
              {narrowed ? (
                <>
                  <b className="font-semibold text-foreground">{meta.total}</b> din{' '}
                  {phone ? unfilteredTotal : trainingNoun(unfilteredTotal)}
                </>
              ) : (
                trainingNoun(meta.total)
              )}
            </ListCount>
          )}
        </ListCardHeader>
        <AppliedFilters
          facets={clientTrainingFacets}
          values={listFilters.values}
          onChange={changeFilters}
          testId="trainings-applied-filters"
        />
        <DataTable
          testId="trainings-table"
          rowTestId="trainings-row"
          label="Instruirile ținute"
          columns={columns}
          data={trainings.data?.items}
          rowKey={rowKey}
          onRowClick={toggle}
          expansion={{
            isOpen: (training) => opened.has(training.id),
            onToggle: toggle,
            label: (training) => `Detaliile instruirii ${trainingLabel(training)}`,
            testId: 'trainings-open',
            render: (training) => (
              <TrainingDetails
                clientId={clientId}
                trainingId={training.id}
                userId={userId}
                scrollIntoView={training.id === open}
              />
            ),
          }}
          meta={meta}
          noun={['instruire', 'instruiri']}
          status={listStatus}
          isFetching={trainings.isFetching}
          isPlaceholderData={trainings.isPlaceholderData}
          sort={{ sort, order }}
          onSortChange={(next) =>
            changeSearch({
              sort: next.sort === defaultSort.sort ? undefined : (next.sort as TrainingSortKey),
              order: next.order === defaultSort.order ? undefined : next.order,
            })
          }
          onPageChange={(next) =>
            void navigate({
              search: (prev) => ({ ...prev, page: next > 1 ? next : undefined, open: undefined }),
              state: keepOpener,
            })
          }
          error={
            <WorkersListError
              error={trainings.error}
              testId="trainings"
              notFound="Clientul nu mai există în organizația ta."
              onRetry={apiRequest.baseUrl ? () => void trainings.refetch() : undefined}
              retrying={trainings.isFetching}
              message="Nu am putut încărca instruirile. Încearcă din nou."
            />
          }
          empty={
            narrowed ? (
              <EmptyState
                icon={SearchX}
                title="Nicio instruire nu se potrivește"
                data-testid="trainings-empty-filtered"
                actions={
                  <Button
                    variant="outline"
                    data-testid="trainings-empty-filtered-clear"
                    onClick={() => (filtered ? changeFilters({}) : changeSearch({ q: undefined }))}
                  >
                    {filtered ? 'Șterge filtrele' : 'Șterge căutarea'}
                  </Button>
                }
              >
                {filtered
                  ? `Nicio instruire${domain ? ` ${trainingDomainLabels[domain]}` : ''} nu se potrivește filtrelor alese${q ? ' și căutării' : ''}. Scoate unul dintre filtrele de mai sus sau pornește din nou de la toate instruirile.`
                  : `Niciun participant nu se potrivește căutării „${q}”. Caută după numele unui participant.`}
              </EmptyState>
            ) : (
              <EmptyState
                icon={ClipboardCheck}
                title={
                  domain
                    ? `Nicio instruire ${trainingDomainLabels[domain]} ținută încă`
                    : 'Nicio instruire ținută încă'
                }
                data-testid="trainings-empty"
                actions={!readOnly && recordButton}
              >
                O instruire se înregistrează o dată, cu toți participanții, și apare în fișa
                fiecăruia. Instruirile de dinainte, de pe fișele pe hârtie, se transcriu din tab-ul
                Lucrători.
              </EmptyState>
            )
          }
        />
      </div>
      <TrainingDialog
        clientId={clientId}
        userId={userId}
        target={target}
        onClose={() => setTarget(null)}
      />
      <DeleteTrainingDialog
        clientId={clientId}
        userId={userId}
        training={deleting}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
