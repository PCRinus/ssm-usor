import {
  defaultPageSize,
  type LeadListFilters,
  type LeadSortKey,
  serviceContractStates,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { useIsMobile } from '@ssm-usor/ui/hooks/use-mobile';
import { keepPreviousData } from '@tanstack/react-query';
import { getRouteApi, Link, useRouteContext } from '@tanstack/react-router';
import { Archive, FileText, Handshake, Plus, SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  getListClientsQueryKey,
  type ListClientsParams,
  useListClients,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { openedHere } from '@/app/opener';
import type { DataTableSort } from '@/components/data-table/columns';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/empty-state';
import { FilterTab, FilterTabs, ListCardHeader, ListCount } from '@/components/list-card-header';
import { AppliedFilters } from '@/components/list-filters/applied-filters';
import { ListFilters } from '@/components/list-filters/list-filters';
import type { ListFilterFacet, ListFilterValues } from '@/components/list-filters/types';
import { listFilterSearch } from '@/components/list-filters/url';
import { SearchInput } from '@/components/search-input';
import { useAuth } from '@/features/auth/auth-context';
import { roCount } from '@/features/employees/employee-format';
import { sessionExpiredMessage } from '@/lib/api-errors';
import { isEmptyOrLoading } from '@/lib/list-state';

import { type ClientArchiveChange, ClientArchiveDialog } from './client-archive-dialog';
import type { ClientRow } from './client-columns';
import { leadColumns } from './lead-columns';
import { contractStateLabels } from './lead-contract-states';
import { useOffersInPlan } from './offers-plan';
import { OffersPlanNotice } from './offers-plan-notice';
import { PromoteLeadDialog } from './promote-lead-dialog';

const leadsRoute = getRouteApi('/_authenticated/oferte/');

const defaultSort: DataTableSort & { sort: LeadSortKey } = { sort: 'legalName', order: 'asc' };

const filterKeys = ['contractState'] as const satisfies readonly (keyof LeadListFilters)[];

type FilterKey = (typeof filterKeys)[number];

const facets: ListFilterFacet<FilterKey>[] = [
  {
    key: 'contractState',
    label: 'Contract',
    icon: FileText,
    column: 'left',
    options: serviceContractStates.map((state) => ({
      value: state,
      label: contractStateLabels[state],
    })),
  },
];

const leadNoun = ['ofertă', 'oferte'] as const;
const leadCount = (count: number) => roCount(count, ...leadNoun);

const tabs = [
  { status: undefined, label: 'Active', testId: 'leads-filter-active' },
  { status: 'archived', label: 'Arhivate', testId: 'leads-filter-archived' },
] as const;

const rowKey = (row: ClientRow) => row.id;

function PendingLeadsLabel({ filters, q }: { filters: LeadListFilters; q: string | undefined }) {
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const params: ListClientsParams = {
    stage: 'lead',
    page: 1,
    pageSize: 1,
    ...(q ? { q } : {}),
    ...filters,
  };
  const total = useListClients(params, {
    request: apiRequest,
    query: {
      queryKey: [...getListClientsQueryKey(params), session?.user.id],
      enabled: Boolean(session && apiRequest.baseUrl),
      placeholderData: keepPreviousData,
    },
  }).data?.total;
  return total === undefined ? 'Arată rezultatele' : `Arată ${leadCount(total)}`;
}

export function LeadsPage() {
  const search = leadsRoute.useSearch();
  const { page = 1, sort = defaultSort.sort, order = defaultSort.order, status, q } = search;
  const archived = status === 'archived';
  const navigate = leadsRoute.useNavigate();
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const shownFacets = archived ? [] : facets;
  const listFilters = listFilterSearch({ keys: filterKeys, facets: shownFacets, search });
  const filters = listFilters.searchOf(listFilters.values) as LeadListFilters;
  const filtered = listFilters.applied;
  const params: ListClientsParams = {
    stage: 'lead',
    ...(archived ? { status } : {}),
    page,
    pageSize: defaultPageSize,
    sort,
    order,
    ...(q ? { q } : {}),
    ...filters,
  };
  const leads = useListClients(params, {
    request: apiRequest,
    query: {
      queryKey: [...getListClientsQueryKey(params), session?.user.id],
      enabled: Boolean(session && apiRequest.baseUrl),
      placeholderData: keepPreviousData,
    },
  });
  const meta = leads.data ?? { page, pageSize: defaultPageSize, total: 0 };
  const unfilteredTotal = leads.data?.unfilteredTotal ?? 0;
  const narrowed = filtered || Boolean(q);
  const listStatus = !apiRequest.baseUrl ? 'error' : leads.status;
  const phone = useIsMobile();
  const [archiveChange, setArchiveChange] = useState<ClientArchiveChange | null>(null);
  const [promoting, setPromoting] = useState<ClientRow | null>(null);
  const offers = useOffersInPlan();
  const columns = useMemo(() => leadColumns(setArchiveChange, setPromoting, offers), [offers]);
  const changeFilters = (values: ListFilterValues<FilterKey>) =>
    void navigate({
      replace: true,
      resetScroll: false,
      search: (prev) => ({
        ...prev,
        ...(listFilters.searchOf(values) as LeadListFilters),
        page: undefined,
      }),
    });
  const clearSearch = () =>
    void navigate({
      replace: true,
      resetScroll: false,
      search: (prev) => ({ ...prev, q: undefined, page: undefined }),
    });

  return (
    <div data-testid="leads-page" className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Oferte</h1>
        {offers && (archived || !isEmptyOrLoading(listStatus, unfilteredTotal)) && (
          <Button asChild>
            <Link to="/oferte/nou" state={openedHere} data-testid="leads-add">
              <Plus aria-hidden="true" />
              Adaugă ofertă
            </Link>
          </Button>
        )}
      </div>
      {!offers && (
        <OffersPlanNotice>
          Pe planul Start poți citi și descărca ofertele de până acum, cu contractele lor, și le
          poți transforma în clienți. Ca să adaugi oferte noi sau să le modifici, ai nevoie de
          planul Profesional.
        </OffersPlanNotice>
      )}
      <div className="overflow-hidden rounded-lg border bg-card">
        <ListCardHeader>
          <FilterTabs label="Filtrează ofertele">
            {tabs.map((tab) => (
              <FilterTab
                key={tab.label}
                to="/oferte"
                search={tab.status ? { status: tab.status } : {}}
                data-testid={tab.testId}
                active={tab.status === status}
                replace
                resetScroll={false}
              >
                {tab.label}
              </FilterTab>
            ))}
          </FilterTabs>
          {(unfilteredTotal > 0 || narrowed) && (
            <div className="order-last flex w-full gap-2 md:order-none md:w-auto md:max-w-2xl md:grow">
              <SearchInput
                value={q}
                onSearch={(next) =>
                  void navigate({
                    replace: true,
                    resetScroll: false,
                    search: (prev) => ({ ...prev, q: next || undefined, page: undefined }),
                  })
                }
                placeholder={phone ? 'Caută oferte' : 'Caută după nume, CUI sau localitate'}
                label="Caută oferte"
                testId="leads-search"
              />
              {!archived && (
                <ListFilters
                  facets={shownFacets}
                  values={filters}
                  onChange={changeFilters}
                  total={leads.isSuccess && !leads.isPlaceholderData ? meta.total : undefined}
                  applyLabel={(pending) => (
                    <PendingLeadsLabel
                      filters={listFilters.searchOf(pending) as LeadListFilters}
                      q={q}
                    />
                  )}
                  countLabel={leadCount}
                  testId="leads-filters"
                />
              )}
            </div>
          )}
          {leads.isSuccess && (
            <ListCount testId="leads-count">
              {narrowed ? (
                <>
                  <b className="font-semibold text-foreground">{meta.total}</b> din{' '}
                  {leadCount(unfilteredTotal)}
                </>
              ) : (
                leadCount(meta.total)
              )}
            </ListCount>
          )}
        </ListCardHeader>
        {!archived && (
          <AppliedFilters
            facets={shownFacets}
            values={filters}
            onChange={changeFilters}
            testId="leads-applied-filters"
          />
        )}
        <DataTable
          testId="leads-table"
          rowTestId="leads-row"
          label="Lista ofertelor"
          columns={columns}
          data={leads.data?.items}
          rowKey={rowKey}
          onRowClick={(lead) =>
            void navigate({ to: '/oferte/$leadId', params: { leadId: lead.id }, state: openedHere })
          }
          meta={meta}
          noun={leadNoun}
          status={listStatus}
          isFetching={leads.isFetching}
          isPlaceholderData={leads.isPlaceholderData}
          sort={{ sort, order }}
          onSortChange={(next) =>
            void navigate({
              replace: true,
              resetScroll: false,
              search: (prev) => ({
                ...prev,
                sort: next.sort === defaultSort.sort ? undefined : (next.sort as LeadSortKey),
                order: next.order === defaultSort.order ? undefined : next.order,
                page: undefined,
              }),
            })
          }
          onPageChange={(next) =>
            void navigate({ search: (prev) => ({ ...prev, page: next > 1 ? next : undefined }) })
          }
          error={
            <>
              <p data-testid="leads-error" role="alert" className="text-sm">
                {leads.error instanceof ApiHttpError && leads.error.status === 401
                  ? sessionExpiredMessage
                  : leads.error instanceof ApiHttpError && leads.error.status === 403
                    ? 'Doar adminii organizației lucrează cu ofertele.'
                    : 'Nu am putut încărca lista ofertelor. Încearcă din nou.'}
              </p>
              {apiRequest.baseUrl &&
                !(leads.error instanceof ApiHttpError && leads.error.status === 403) && (
                  <Button
                    data-testid="leads-retry"
                    variant="outline"
                    className="mt-4"
                    disabled={leads.isFetching}
                    onClick={() => void leads.refetch()}
                  >
                    Încearcă din nou
                  </Button>
                )}
            </>
          }
          empty={
            narrowed ? (
              <EmptyState
                icon={SearchX}
                title="Nicio ofertă nu se potrivește"
                data-testid="leads-empty-filtered"
                actions={
                  <Button
                    variant="outline"
                    data-testid="leads-empty-clear"
                    onClick={filtered ? () => changeFilters({}) : clearSearch}
                  >
                    {filtered ? 'Șterge filtrele' : 'Șterge căutarea'}
                  </Button>
                }
              >
                {filtered
                  ? `Nicio ofertă ${archived ? 'arhivată' : 'activă'} nu se potrivește filtrelor alese${q ? ' și căutării' : ''}. Scoate unul dintre filtrele de mai sus sau șterge-le pe toate.`
                  : `Nicio ofertă ${archived ? 'arhivată' : 'activă'} nu se potrivește căutării „${q}”. Caută după nume, CUI sau localitate.`}
              </EmptyState>
            ) : archived ? (
              <EmptyState icon={Archive} title="Nicio ofertă arhivată" data-testid="leads-empty">
                Ofertele arhivate vor apărea aici. Le poți reactiva oricând.
              </EmptyState>
            ) : !offers ? (
              <EmptyState icon={Handshake} title="Nicio ofertă" data-testid="leads-empty">
                Cu planul Profesional ții aici companiile cu care discuți, le trimiți contractul și
                le transformi în clienți când îl semnează.
              </EmptyState>
            ) : (
              <EmptyState
                icon={Handshake}
                title="Nicio ofertă încă"
                data-testid="leads-empty"
                actions={
                  <Button asChild>
                    <Link to="/oferte/nou" state={openedHere} data-testid="leads-add">
                      <Plus aria-hidden="true" />
                      Adaugă prima ofertă
                    </Link>
                  </Button>
                }
              >
                Adaugă o companie cu care discuți. Când semnați contractul, o poți transforma în
                client împreună cu notițele și datele salvate.
              </EmptyState>
            )
          }
        />
      </div>
      <ClientArchiveDialog change={archiveChange} onClose={() => setArchiveChange(null)} />
      <PromoteLeadDialog
        lead={promoting}
        signed={promoting ? promoting.serviceContractState === 'signed' : undefined}
        onClose={() => setPromoting(null)}
      />
    </div>
  );
}
