import { defaultPageSize, type EmployeeSortKey } from '@ssm-usor/contracts';
import { useIsMobile } from '@ssm-usor/ui/hooks/use-mobile';
import { cn } from '@ssm-usor/ui/lib/utils';
import { keepPreviousData } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  getListEmployeesQueryKey,
  getListEmployeesQueryOptions,
  getListJobPositionsQueryKey,
  getListWorkplacesQueryKey,
  type ListEmployeesParams,
  useListEmployees,
  useListJobPositions,
  useListWorkplaces,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { keepOpener, openedFromRecord, openedHere } from '@/app/opener';
import type { DataTableSort } from '@/components/data-table/columns';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/empty-state';
import {
  FilterTab,
  FilterTabs,
  ListActions,
  ListCardHeader,
  ListCount,
} from '@/components/list-card-header';
import { AppliedFilters } from '@/components/list-filters/applied-filters';
import { ListFilters } from '@/components/list-filters/list-filters';
import { PendingCountLabel } from '@/components/list-filters/pending-count-label';
import type { ListFilterValues } from '@/components/list-filters/types';
import { listFilterSearch } from '@/components/list-filters/url';
import { useListSearch } from '@/components/list-filters/use-list-search';
import { sheetPadding } from '@/components/page-spacing';
import { SearchInput } from '@/components/search-input';
import {
  EmployeeImportButtons,
  EmployeesImportedCard,
  EmployeeStartWays,
  OpenEmployeeImports,
} from '@/features/imports/employees/employee-import-entry';
import { EmployeeUploadDialog } from '@/features/imports/employees/employee-upload-dialog';
import { ImportUploadDialog } from '@/features/imports/import-upload-dialog';
import { EmployeesOverStepNotice } from '@/features/subscription/employees-over-step-notice';
import { isEmptyOrLoading } from '@/lib/list-state';

import { employeeColumns, type EmployeeRow } from './employee-columns';
import { employeeStatusLabels, workerNoun } from './employee-format';
import { type EmployeeStatusChange, EmployeeStatusDialog } from './employee-status-dialog';
import {
  clientWorkerFacets,
  clientWorkerFilterKeys,
  trainingSortKeys,
  workplacePlaces,
} from './worker-filters';
import { WorkersCount, WorkersListError, WorkersNoMatch } from './workers-list';

const employeesRoute = getRouteApi('/_authenticated/clienti/$clientId/angajati/');
const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');

const defaultSort: DataTableSort & { sort: EmployeeSortKey } = { sort: 'name', order: 'asc' };

const tabs = [
  { status: undefined, label: employeeStatusLabels.active, testId: 'employees-filter-current' },
  {
    status: 'terminated',
    label: employeeStatusLabels.terminated,
    testId: 'employees-filter-terminated',
  },
] as const;

type FilterKey = (typeof clientWorkerFilterKeys)[number];
type Filters = Pick<ListEmployeesParams, FilterKey>;

const rowKey = (row: EmployeeRow) => row.id;

export function EmployeesPage() {
  const { clientId } = employeesRoute.useParams();
  const { client } = clientRoute.useLoaderData();
  const readOnly = client.archivedAt !== null;
  const [importing, setImporting] = useState<'found' | 'new' | 'documentation' | null>(null);
  const search = employeesRoute.useSearch();
  const { status, page = 1, order = defaultSort.order, q } = search;
  const former = status === 'terminated';
  // The API refuses the states of an archived client's employees, whom the training rules no
  // longer follow; a leaver has none.
  const withStates = !former && !readOnly && client.stage !== 'lead';
  const sort =
    !search.sort || (!withStates && trainingSortKeys.has(search.sort))
      ? defaultSort.sort
      : search.sort;
  const navigate = employeesRoute.useNavigate();
  const { request, ready, key } = useApi();
  const phone = useIsMobile();
  const positions = useListJobPositions(clientId, {
    request,
    query: {
      queryKey: key(getListJobPositionsQueryKey(clientId)),
      enabled: ready,
    },
  });
  const workplaces = useListWorkplaces(clientId, {
    request,
    query: {
      queryKey: key(getListWorkplacesQueryKey(clientId)),
      enabled: ready,
    },
  });
  const facets = useMemo(
    () =>
      clientWorkerFacets({
        withStates,
        positions: positions.isError ? [] : positions.data?.items,
        ...workplacePlaces(
          { isPending: workplaces.isPending, isError: workplaces.isError, data: workplaces.data },
          Boolean(search.workplace)
        ),
      }),
    [
      withStates,
      positions.data,
      positions.isError,
      workplaces.data,
      workplaces.isError,
      workplaces.isPending,
      search.workplace,
    ]
  );
  const listFilters = listFilterSearch({ keys: clientWorkerFilterKeys, facets, search });
  const filters = listFilters.searchOf(listFilters.values) as Filters;
  const filtered = listFilters.applied;
  const narrowed = filtered || Boolean(q);
  const params: ListEmployeesParams = {
    ...(status ? { status } : {}),
    ...(q ? { q } : {}),
    page,
    pageSize: defaultPageSize,
    sort,
    order,
    ...filters,
  };
  const employees = useListEmployees(clientId, params, {
    request,
    query: {
      queryKey: key(getListEmployeesQueryKey(clientId, params)),
      enabled: ready,
      placeholderData: keepPreviousData,
    },
  });
  const meta = employees.data ?? { page, pageSize: defaultPageSize, total: 0 };
  const unfilteredTotal = employees.data?.unfilteredTotal ?? 0;
  const listStatus = !request.baseUrl ? 'error' : employees.status;
  const startsFromEmpty = !readOnly && !former && !narrowed;
  const [change, setChange] = useState<EmployeeStatusChange | null>(null);
  const columns = useMemo(
    () => employeeColumns({ former, withStates, onStatusChange: readOnly ? undefined : setChange }),
    [former, withStates, readOnly]
  );
  const { changeQuery, changeFilters, onSortChange, onPageChange } = useListSearch({
    search,
    navigate,
    defaultSort,
    searchOf: (values: ListFilterValues<FilterKey>) => listFilters.searchOf(values) as Filters,
    state: keepOpener,
  });
  const pendingQuery = (pending: ListFilterValues<FilterKey>) => {
    const counted: ListEmployeesParams = {
      ...params,
      page: 1,
      pageSize: 1,
      ...(listFilters.searchOf(pending) as Filters),
    };
    return getListEmployeesQueryOptions(clientId, counted, {
      request,
      query: {
        queryKey: key(getListEmployeesQueryKey(clientId, counted)),
        enabled: ready,
      },
    });
  };
  const dropImportParam = () => {
    if (search.import)
      void navigate({
        state: keepOpener,
        replace: true,
        resetScroll: false,
        search: (prev) => ({ ...prev, import: undefined }),
      });
  };
  const closeImport = () => {
    setImporting(null);
    dropImportParam();
  };
  const fromGuide = search.import === true && !readOnly && importing === null;

  return (
    <div data-testid="employees-page">
      <h2 className="sr-only">Lucrători</h2>
      <div className={cn('grid gap-5 border-b empty:hidden', sheetPadding)}>
        {!readOnly && <EmployeesOverStepNotice />}
        <EmployeesImportedCard clientId={clientId} />
        {!readOnly && <OpenEmployeeImports clientId={clientId} />}
      </div>
      <div>
        <ListCardHeader data-testid="employees-toolbar">
          <FilterTabs label="Filtrează lucrătorii">
            {tabs.map((tab) => (
              <FilterTab
                key={tab.label}
                to="/clienti/$clientId/angajati"
                params={{ clientId }}
                state={keepOpener}
                search={{
                  ...(tab.status ? { status: tab.status } : {}),
                  q,
                  jobPosition: filters.jobPosition,
                  workplace: filters.workplace,
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
                onSearch={changeQuery}
                placeholder={phone ? 'Caută lucrători' : 'Caută după nume sau marcă'}
                label="Caută lucrători"
                testId="employees-search"
              />
              <ListFilters
                facets={facets}
                values={filters}
                onChange={changeFilters}
                total={employees.isSuccess && !employees.isPlaceholderData ? meta.total : undefined}
                applyLabel={(pending) => (
                  <PendingCountLabel query={pendingQuery(pending)} noun={workerNoun} />
                )}
                countLabel={workerNoun}
                testId="employees-filters"
              />
            </div>
          )}
          <ListActions
            count={
              employees.isSuccess && (
                <ListCount testId="employees-count">
                  <WorkersCount
                    total={meta.total}
                    unfilteredTotal={unfilteredTotal}
                    narrowed={narrowed}
                    short={phone}
                  />
                </ListCount>
              )
            }
          >
            {!readOnly && !(startsFromEmpty && isEmptyOrLoading(listStatus, unfilteredTotal)) && (
              <EmployeeImportButtons clientId={clientId} onStart={setImporting} />
            )}
          </ListActions>
        </ListCardHeader>
        <AppliedFilters
          facets={facets}
          values={filters}
          onChange={changeFilters}
          testId="employees-applied-filters"
        />
        <DataTable
          testId="employees-table"
          rowTestId="employees-row"
          label="Lista lucrătorilor"
          columns={columns}
          data={employees.data?.items}
          rowKey={rowKey}
          onRowClick={(employee) =>
            void navigate({
              to: '/clienti/$clientId/angajati/$employeeId',
              state: openedHere,
              params: { clientId, employeeId: employee.id },
            })
          }
          meta={meta}
          noun={['lucrător', 'lucrători']}
          status={listStatus}
          isFetching={employees.isFetching}
          isPlaceholderData={employees.isPlaceholderData}
          sort={{ sort, order }}
          onSortChange={onSortChange}
          onPageChange={onPageChange}
          error={
            <WorkersListError
              error={employees.error}
              testId="employees"
              notFound="Clientul nu mai există în organizația ta."
              onRetry={request.baseUrl ? () => void employees.refetch() : undefined}
              retrying={employees.isFetching}
            />
          }
          empty={
            narrowed ? (
              <WorkersNoMatch
                former={former}
                filtered={filtered}
                q={q}
                testId="employees-empty-filtered"
                onClear={() => (filtered ? changeFilters({}) : changeQuery(undefined))}
              />
            ) : (
              <EmptyState
                icon={UserRound}
                title={former ? 'Niciun fost lucrător' : 'Niciun lucrător încă'}
                data-testid="employees-empty"
                actions={
                  startsFromEmpty && (
                    <EmployeeStartWays clientId={clientId} onStart={setImporting} />
                  )
                }
              >
                {former
                  ? 'Lucrătorii care pleacă rămân aici, cu dovezile lor.'
                  : 'Adaugă lucrătorii clientului pentru a le organiza instruirile și documentele.'}
              </EmptyState>
            )
          }
        />
      </div>
      <EmployeeStatusDialog clientId={clientId} change={change} onClose={() => setChange(null)} />
      <EmployeeUploadDialog
        open={importing === 'found' || importing === 'new' || fromGuide}
        withFound={importing === 'found'}
        client={client}
        onClose={closeImport}
        onStarted={(importId) =>
          void navigate({
            to: '/clienti/$clientId/angajati/import/$importId',
            state: openedFromRecord(`/clienti/${clientId}/angajati`),
            params: { clientId, importId },
          })
        }
        onImportDocumentation={() => {
          setImporting('documentation');
          dropImportParam();
        }}
      />
      <ImportUploadDialog
        open={importing === 'documentation'}
        client={client}
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
