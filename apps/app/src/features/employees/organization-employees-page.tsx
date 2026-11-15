import { defaultPageSize, type OrganizationEmployeeSortKey } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { useIsMobile } from '@ssm-usor/ui/hooks/use-mobile';
import { keepPreviousData } from '@tanstack/react-query';
import { getRouteApi, Link, useRouteContext } from '@tanstack/react-router';
import { UsersRound } from 'lucide-react';
import { useMemo } from 'react';

import {
  getListOrganizationEmployeesQueryKey,
  type ListOrganizationEmployeesParams,
  useListOrganizationEmployees,
} from '@/api/generated/api';
import { openedHere } from '@/app/opener';
import type { DataTableSort } from '@/components/data-table/columns';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/empty-state';
import { FilterTab, FilterTabs, ListCardHeader, ListCount } from '@/components/list-card-header';
import { AppliedFilters } from '@/components/list-filters/applied-filters';
import { ListFilters } from '@/components/list-filters/list-filters';
import type { ListFilterValues } from '@/components/list-filters/types';
import { listFilterSearch } from '@/components/list-filters/url';
import { SearchInput } from '@/components/search-input';
import { useAuth } from '@/features/auth/auth-context';

import { employeeStatusLabels, pendingWorkersLabel, workerNoun } from './employee-format';
import {
  formerOrganizationEmployeeColumns,
  organizationEmployeeColumns,
  type OrganizationEmployeeRow,
} from './organization-employee-columns';
import {
  organizationWorkerFacets,
  organizationWorkerFilterKeys,
  trainingSortKeys,
  useEveryClient,
} from './worker-filters';
import { WorkersCount, WorkersListError, WorkersNoMatch } from './workers-list';

const route = getRouteApi('/_authenticated/angajati/');

const defaultSort: DataTableSort & { sort: OrganizationEmployeeSortKey } = {
  sort: 'name',
  order: 'asc',
};

const tabs = [
  {
    status: undefined,
    label: employeeStatusLabels.active,
    testId: 'organization-employees-filter-current',
  },
  {
    status: 'terminated',
    label: employeeStatusLabels.terminated,
    testId: 'organization-employees-filter-terminated',
  },
] as const;

type FilterKey = (typeof organizationWorkerFilterKeys)[number];
type Filters = Pick<ListOrganizationEmployeesParams, FilterKey>;

const rowKey = (row: OrganizationEmployeeRow) => row.id;

function PendingEmployeesLabel({ params }: { params: ListOrganizationEmployeesParams }) {
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const total = useListOrganizationEmployees(params, {
    request: apiRequest,
    query: {
      queryKey: [...getListOrganizationEmployeesQueryKey(params), session?.user.id],
      enabled: Boolean(session && apiRequest.baseUrl),
      placeholderData: keepPreviousData,
    },
  }).data?.total;
  return pendingWorkersLabel(total);
}

export function OrganizationEmployeesPage() {
  const search = route.useSearch();
  const { status, q, page = 1, order = defaultSort.order } = search;
  const former = status === 'terminated';
  const sort =
    !search.sort || (former && trainingSortKeys.has(search.sort)) ? defaultSort.sort : search.sort;
  const navigate = route.useNavigate();
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const phone = useIsMobile();
  const clients = useEveryClient(session?.user.id);
  const facets = useMemo(
    () =>
      organizationWorkerFacets({
        withStates: !former,
        clients: clients.isError ? [] : clients.data,
      }),
    [former, clients.data, clients.isError]
  );
  const listFilters = listFilterSearch({ keys: organizationWorkerFilterKeys, facets, search });
  const filters = listFilters.searchOf(listFilters.values) as Filters;
  const filtered = listFilters.applied;
  const narrowed = filtered || Boolean(q);
  const params: ListOrganizationEmployeesParams = {
    ...(status ? { status } : {}),
    ...(q ? { q } : {}),
    page,
    pageSize: defaultPageSize,
    sort,
    order,
    ...filters,
  };
  const employees = useListOrganizationEmployees(params, {
    request: apiRequest,
    query: {
      queryKey: [...getListOrganizationEmployeesQueryKey(params), session?.user.id],
      enabled: Boolean(session && apiRequest.baseUrl),
      placeholderData: keepPreviousData,
    },
  });
  const meta = employees.data ?? { page, pageSize: defaultPageSize, total: 0 };
  const unfilteredTotal = employees.data?.unfilteredTotal ?? 0;
  const changeSearch = (next: Partial<typeof search>) =>
    void navigate({
      replace: true,
      resetScroll: false,
      search: (prev) => ({ ...prev, ...next, page: undefined }),
    });
  const changeFilters = (values: ListFilterValues<FilterKey>) =>
    changeSearch(listFilters.searchOf(values) as Filters);

  return (
    <div data-testid="organization-employees-page" className="space-y-7">
      <h1 className="text-3xl font-semibold tracking-tight">Lucrători</h1>
      <div className="overflow-hidden rounded-lg border bg-card">
        <ListCardHeader>
          <FilterTabs label="Filtrează lucrătorii">
            {tabs.map((tab) => (
              <FilterTab
                key={tab.label}
                to="/angajati"
                search={{
                  ...(tab.status ? { status: tab.status } : {}),
                  q,
                  client: filters.client,
                }}
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
                onSearch={(next) => changeSearch({ q: next || undefined })}
                placeholder={phone ? 'Caută lucrători' : 'Caută după nume sau marcă'}
                label="Caută lucrători"
                testId="organization-employees-search"
              />
              <ListFilters
                facets={facets}
                values={filters}
                onChange={changeFilters}
                total={employees.isSuccess && !employees.isPlaceholderData ? meta.total : undefined}
                applyLabel={(pending) => (
                  <PendingEmployeesLabel
                    params={{
                      ...params,
                      page: 1,
                      pageSize: 1,
                      ...(listFilters.searchOf(pending) as Filters),
                    }}
                  />
                )}
                countLabel={workerNoun}
                testId="organization-employees-filters"
              />
            </div>
          )}
          {employees.isSuccess && (
            <ListCount testId="organization-employees-count">
              <WorkersCount
                total={meta.total}
                unfilteredTotal={unfilteredTotal}
                narrowed={narrowed}
                short={phone}
              />
            </ListCount>
          )}
        </ListCardHeader>
        <AppliedFilters
          facets={facets}
          values={filters}
          onChange={changeFilters}
          testId="organization-employees-applied-filters"
        />
        <DataTable
          testId="organization-employees-table"
          rowTestId="organization-employees-row"
          label="Lucrătorii organizației"
          columns={former ? formerOrganizationEmployeeColumns : organizationEmployeeColumns}
          data={employees.data?.items}
          rowKey={rowKey}
          onRowClick={(employee) =>
            void navigate({
              to: '/clienti/$clientId/angajati/$employeeId',
              state: openedHere,
              params: { clientId: employee.client.id, employeeId: employee.id },
            })
          }
          meta={meta}
          noun={['lucrător', 'lucrători']}
          status={!apiRequest.baseUrl ? 'error' : employees.status}
          isFetching={employees.isFetching}
          isPlaceholderData={employees.isPlaceholderData}
          sort={{ sort, order }}
          onSortChange={(next) =>
            changeSearch({
              sort:
                next.sort === defaultSort.sort
                  ? undefined
                  : (next.sort as OrganizationEmployeeSortKey),
              order: next.order === defaultSort.order ? undefined : next.order,
            })
          }
          onPageChange={(next) =>
            void navigate({ search: (prev) => ({ ...prev, page: next > 1 ? next : undefined }) })
          }
          error={
            <WorkersListError
              error={employees.error}
              testId="organization-employees"
              onRetry={apiRequest.baseUrl ? () => void employees.refetch() : undefined}
              retrying={employees.isFetching}
            />
          }
          empty={
            narrowed ? (
              <WorkersNoMatch
                former={former}
                filtered={filtered}
                q={q}
                testId="organization-employees-empty-filtered"
                onClear={() => (filtered ? changeFilters({}) : changeSearch({ q: undefined }))}
              />
            ) : (
              <EmptyState
                icon={UsersRound}
                title={former ? 'Niciun fost lucrător' : 'Niciun lucrător încă'}
                data-testid="organization-employees-empty"
                actions={
                  !former && (
                    <Button asChild variant="outline">
                      <Link to="/clienti">Mergi la clienți</Link>
                    </Button>
                  )
                }
              >
                {former
                  ? 'Lucrătorii care pleacă rămân aici, cu dovezile lor.'
                  : 'Lucrătorii se adaugă din pagina fiecărui client și apar aici, toți împreună.'}
              </EmptyState>
            )
          }
        />
      </div>
    </div>
  );
}
