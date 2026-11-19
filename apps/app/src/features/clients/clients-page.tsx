import {
  type ClientListFilters,
  type ClientSortKey,
  countOf,
  defaultPageSize,
  romanianCounties,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { useIsMobile } from '@ssm-usor/ui/hooks/use-mobile';
import { keepPreviousData } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import {
  Archive,
  CalendarClock,
  FileText,
  Flame,
  GraduationCap,
  MapPin,
  PenLine,
  SearchX,
  Sparkles,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  getListClientsQueryKey,
  getListClientsQueryOptions,
  type ListClientsParams,
  useListClients,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { useApi } from '@/api/use-api';
import { openedHere } from '@/app/opener';
import type { DataTableSort } from '@/components/data-table/columns';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/empty-state';
import { FilterTab, FilterTabs, ListCardHeader, ListCount } from '@/components/list-card-header';
import { AppliedFilters } from '@/components/list-filters/applied-filters';
import { ListFilters } from '@/components/list-filters/list-filters';
import { PendingCountLabel } from '@/components/list-filters/pending-count-label';
import type { ListFilterFacet, ListFilterValues } from '@/components/list-filters/types';
import { listFilterSearch } from '@/components/list-filters/url';
import { useListSearch } from '@/components/list-filters/use-list-search';
import { LoadFailed } from '@/components/load-failed';
import { SearchInput } from '@/components/search-input';
import { useMe } from '@/features/account/use-me';
import { ImportListCard } from '@/features/imports/import-list-card';
import { ImportUploadDialog } from '@/features/imports/import-upload-dialog';
import { StartWays } from '@/features/imports/start-ways';
import { noOrganizationMessage } from '@/lib/api-errors';
import { isEmptyOrLoading } from '@/lib/list-state';

import { type ClientArchiveChange, ClientArchiveDialog } from './client-archive-dialog';
import { clientColumns, type ClientRow } from './client-columns';
import { ClientDeleteDialog, type ClientToDelete } from './client-delete-dialog';

const clientsRoute = getRouteApi('/_authenticated/clienti/');

const defaultSort: DataTableSort & { sort: ClientSortKey } = { sort: 'legalName', order: 'asc' };

const filterKeys = [
  'documentation',
  'fireSafetyDocumentation',
  'training',
  'attention',
  'county',
  'contract',
] as const satisfies readonly (keyof ClientListFilters)[];

type FilterKey = (typeof filterKeys)[number];

type ClientFilters = Pick<ListClientsParams, FilterKey>;

const documentationOptions = [
  { value: 'none', label: 'Negenerată' },
  { value: 'in_progress', label: 'În lucru' },
  { value: 'issued', label: 'Emisă' },
] as const;

const trainingFacet: ListFilterFacet<FilterKey> = {
  key: 'training',
  label: 'Instruire',
  icon: GraduationCap,
  column: 'right',
  options: [
    { value: 'untrained', label: 'Neinstruiți' },
    { value: 'overdue', label: 'Depășită' },
    { value: 'due', label: 'Scadentă în 30 de zile' },
    { value: 'current', label: 'La zi' },
  ],
};

const countyFacet: ListFilterFacet<FilterKey> = {
  key: 'county',
  label: 'Județ',
  icon: MapPin,
  column: 'right',
  options: romanianCounties.map((county) => ({ value: county.code, label: county.name })),
  search: { placeholder: 'Caută județul', addLabel: 'Adaugă un județ' },
};

const documentationFacets: ListFilterFacet<FilterKey>[] = [
  {
    key: 'documentation',
    label: 'Documentație SSM',
    icon: FileText,
    column: 'left',
    options: documentationOptions,
  },
  {
    key: 'fireSafetyDocumentation',
    label: 'Documentație SU',
    icon: Flame,
    column: 'left',
    options: documentationOptions,
  },
];

const attentionFacet: ListFilterFacet<FilterKey> = {
  key: 'attention',
  label: 'Necesită atenție',
  icon: TriangleAlert,
  column: 'left',
  options: [
    { value: 'documentsBehind', label: 'Documente de actualizat' },
    { value: 'missingBasicData', label: 'Date de bază lipsă' },
    { value: 'signaturesPending', label: 'Semnături în așteptare' },
    { value: 'testsPending', label: 'Teste în așteptare' },
  ],
};

// Only owners read the contracts, and the API refuses the filter to anyone else.
const contractFacet: ListFilterFacet<FilterKey> = {
  key: 'contract',
  label: 'Contract',
  icon: CalendarClock,
  column: 'right',
  options: [{ value: 'endingWithin60Days', label: 'Se încheie în 60 de zile' }],
};

function clientFacets(isOwner: boolean): ListFilterFacet<FilterKey>[] {
  return [
    trainingFacet,
    countyFacet,
    ...documentationFacets,
    attentionFacet,
    ...(isOwner ? [contractFacet] : []),
  ];
}

const clientNoun = ['client', 'clienți'] as const;
const clientCount = (count: number) => countOf(count, ...clientNoun);

const tabs = [
  { status: undefined, label: 'Activi', testId: 'clients-filter-active' },
  { status: 'archived', label: 'Arhivați', testId: 'clients-filter-archived' },
] as const;

const rowKey = (row: ClientRow) => row.id;

export function ClientsPage() {
  const search = clientsRoute.useSearch();
  const { page = 1, sort = defaultSort.sort, order = defaultSort.order, status, q } = search;
  const archived = status === 'archived';
  const navigate = clientsRoute.useNavigate();
  const { request, ready, key } = useApi();
  const me = useMe();
  const isOwner = me.data?.membership?.role === 'owner';
  // Until the role is known an owner's contract filter stays in the URL, and the list waits for
  // the role rather than load without it. An account that fails to load counts as no owner.
  const roleSettled = me.data !== undefined || me.isError;
  const facets = useMemo(
    () => (archived ? [] : clientFacets(isOwner || !roleSettled)),
    [archived, isOwner, roleSettled]
  );
  const listFilters = listFilterSearch({ keys: filterKeys, facets, search });
  const filters = listFilters.searchOf(listFilters.values) as ClientFilters;
  const filtered = listFilters.applied;
  const params: ListClientsParams = {
    ...(archived ? { status } : {}),
    page,
    pageSize: defaultPageSize,
    sort,
    order,
    ...(q ? { q } : {}),
    ...filters,
  };
  const clients = useListClients(params, {
    request,
    query: {
      queryKey: key(getListClientsQueryKey(params)),
      enabled: ready && (roleSettled || !params.contract),
      placeholderData: keepPreviousData,
    },
  });
  const meta = clients.data ?? { page, pageSize: defaultPageSize, total: 0 };
  const unfilteredTotal = clients.data?.unfilteredTotal ?? 0;
  const narrowed = filtered || Boolean(q);
  const listStatus = !request.baseUrl ? 'error' : clients.status;
  const phone = useIsMobile();
  const [archiveChange, setArchiveChange] = useState<ClientArchiveChange | null>(null);
  const [deleting, setDeleting] = useState<ClientToDelete | null>(null);
  const columns = useMemo(
    () =>
      clientColumns({
        onArchiveChange: isOwner ? setArchiveChange : undefined,
        onDelete: setDeleting,
      }),
    [isOwner]
  );
  const [importing, setImporting] = useState(false);
  const closeImport = () => {
    setImporting(false);
    if (search.import)
      void navigate({
        replace: true,
        resetScroll: false,
        search: (prev) => ({ ...prev, import: undefined }),
      });
  };
  const { changeQuery, changeFilters, onSortChange, onPageChange } = useListSearch({
    search,
    navigate,
    defaultSort,
    searchOf: (values: ListFilterValues<FilterKey>) =>
      listFilters.searchOf(values) as ClientFilters,
  });
  const pendingQuery = (pending: ListFilterValues<FilterKey>) => {
    const counted: ListClientsParams = {
      page: 1,
      pageSize: 1,
      ...(q ? { q } : {}),
      ...(listFilters.searchOf(pending) as ClientFilters),
    };
    return getListClientsQueryOptions(counted, {
      request,
      query: {
        queryKey: key(getListClientsQueryKey(counted)),
        enabled: ready,
      },
    });
  };

  return (
    <div data-testid="clients-page" className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Clienți</h1>
        {(archived || !isEmptyOrLoading(listStatus, unfilteredTotal)) && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/clienti/nou" state={openedHere} data-testid="clients-add">
                <PenLine aria-hidden="true" />
                Adaugă manual
              </Link>
            </Button>
            <Button data-testid="clients-import" onClick={() => setImporting(true)}>
              <Sparkles aria-hidden="true" />
              Adaugă cu AI
            </Button>
          </div>
        )}
      </div>
      {!archived && <ImportListCard />}
      <div className="overflow-hidden rounded-lg border bg-card">
        <ListCardHeader>
          <FilterTabs label="Filtrează clienții">
            {tabs.map((filter) => (
              <FilterTab
                key={filter.label}
                to="/clienti"
                search={filter.status ? { status: filter.status } : {}}
                data-testid={filter.testId}
                active={filter.status === status}
                replace
                resetScroll={false}
              >
                {filter.label}
              </FilterTab>
            ))}
          </FilterTabs>
          {(unfilteredTotal > 0 || narrowed) && (
            <div className="order-last flex w-full gap-2 md:order-none md:w-auto md:max-w-2xl md:grow">
              <SearchInput
                value={q}
                onSearch={changeQuery}
                placeholder={phone ? 'Caută clienți' : 'Caută după nume, CUI sau localitate'}
                label="Caută clienți"
                testId="clients-search"
              />
              {!archived && (
                <ListFilters
                  facets={facets}
                  values={filters}
                  onChange={changeFilters}
                  total={clients.isSuccess && !clients.isPlaceholderData ? meta.total : undefined}
                  applyLabel={(pending) => (
                    <PendingCountLabel query={pendingQuery(pending)} noun={clientCount} />
                  )}
                  countLabel={clientCount}
                  testId="clients-filters"
                />
              )}
            </div>
          )}
          {clients.isSuccess && (
            <ListCount testId="clients-count">
              {narrowed ? (
                <>
                  <b className="font-semibold text-foreground">{meta.total}</b> din{' '}
                  {clientCount(unfilteredTotal)}
                </>
              ) : (
                clientCount(meta.total)
              )}
            </ListCount>
          )}
        </ListCardHeader>
        {!archived && (
          <AppliedFilters
            facets={facets}
            values={filters}
            onChange={changeFilters}
            testId="clients-applied-filters"
          />
        )}
        <DataTable
          testId="clients-table"
          rowTestId="clients-row"
          label="Lista clienților"
          columns={columns}
          data={clients.data?.items}
          rowKey={rowKey}
          onRowClick={(client) =>
            void navigate({
              to: '/clienti/$clientId/detalii',
              params: { clientId: client.id },
              state: openedHere,
            })
          }
          meta={meta}
          noun={clientNoun}
          status={listStatus}
          isFetching={clients.isFetching}
          isPlaceholderData={clients.isPlaceholderData}
          sort={{ sort, order }}
          onSortChange={onSortChange}
          onPageChange={onPageChange}
          error={
            <LoadFailed
              error={clients.error}
              testId="clients-error"
              retryTestId="clients-retry"
              busy={clients.isFetching}
              onRetry={request.baseUrl ? () => void clients.refetch() : undefined}
            >
              {clients.error instanceof ApiHttpError && clients.error.status === 403
                ? noOrganizationMessage
                : 'Nu am putut încărca lista clienților. Încearcă din nou.'}
            </LoadFailed>
          }
          empty={
            narrowed ? (
              <EmptyState
                icon={SearchX}
                title="Niciun client nu se potrivește"
                data-testid="clients-empty-filtered"
                actions={
                  <Button
                    variant="outline"
                    data-testid="clients-empty-clear"
                    onClick={() => (filtered ? changeFilters({}) : changeQuery(undefined))}
                  >
                    {filtered ? 'Șterge filtrele' : 'Șterge căutarea'}
                  </Button>
                }
              >
                {filtered
                  ? `Niciun client ${archived ? 'arhivat' : 'activ'} nu se potrivește filtrelor alese${q ? ' și căutării' : ''}. Scoate unul dintre filtrele de mai sus sau șterge-le pe toate.`
                  : `Niciun client ${archived ? 'arhivat' : 'activ'} nu se potrivește căutării „${q}”. Caută după nume, CUI sau localitate.`}
              </EmptyState>
            ) : archived ? (
              <EmptyState icon={Archive} title="Niciun client arhivat" data-testid="clients-empty">
                Clienții arhivați vor apărea aici. Îi poți reactiva oricând.
              </EmptyState>
            ) : (
              <EmptyState
                icon={Users}
                title="Niciun client încă"
                data-testid="clients-empty"
                actions={<StartWays onImport={() => setImporting(true)} />}
              >
                Adaugă prima companie pentru a începe să îi organizezi documentele și termenele.
              </EmptyState>
            )
          }
        />
      </div>
      <ClientArchiveDialog change={archiveChange} onClose={() => setArchiveChange(null)} />
      <ClientDeleteDialog client={deleting} onClose={() => setDeleting(null)} />
      <ImportUploadDialog
        open={importing || search.import === true}
        onClose={closeImport}
        onStarted={(importId) =>
          void navigate({
            to: '/clienti/import/$importId',
            params: { importId },
            state: openedHere,
          })
        }
      />
    </div>
  );
}
