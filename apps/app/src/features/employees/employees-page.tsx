import { defaultPageSize, type EmployeeSortKey } from '@ssm-usor/contracts';
import { useIsMobile } from '@ssm-usor/ui/hooks/use-mobile';
import { keepPreviousData } from '@tanstack/react-query';
import { getRouteApi, useRouteContext } from '@tanstack/react-router';
import { UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  getListEmployeesQueryKey,
  getListJobPositionsQueryKey,
  getListWorkplacesQueryKey,
  type ListEmployeesParams,
  useListEmployees,
  useListJobPositions,
  useListWorkplaces,
} from '@/api/generated/api';
import { keepOpener, openedFromRecord, openedHere } from '@/app/opener';
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
import { sheetFlushList } from '@/features/clients/sheet-flush';
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
import { employeeStatusLabels, pendingWorkersLabel, workerNoun } from './employee-format';
import { type EmployeeStatusChange, EmployeeStatusDialog } from './employee-status-dialog';
import { clientWorkerFacets, clientWorkerFilterKeys, trainingSortKeys } from './worker-filters';
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

function PendingEmployeesLabel({
  clientId,
  params,
}: {
  clientId: string;
  params: ListEmployeesParams;
}) {
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const total = useListEmployees(clientId, params, {
    request: apiRequest,
    query: {
      queryKey: [...getListEmployeesQueryKey(clientId, params), session?.user.id],
      enabled: Boolean(session && apiRequest.baseUrl),
      placeholderData: keepPreviousData,
    },
  }).data?.total;
  return pendingWorkersLabel(total);
}

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
  const { session } = useAuth();
  const userId = session?.user.id;
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const phone = useIsMobile();
  const positions = useListJobPositions(clientId, {
    request: apiRequest,
    query: {
      queryKey: [...getListJobPositionsQueryKey(clientId), userId],
      enabled: Boolean(userId && apiRequest.baseUrl),
    },
  });
  const workplaces = useListWorkplaces(clientId, {
    request: apiRequest,
    query: {
      queryKey: [...getListWorkplacesQueryKey(clientId), userId],
      enabled: Boolean(userId && apiRequest.baseUrl),
    },
  });
  const workplaceCount = workplaces.data?.items.length ?? 0;
  const facets = useMemo(
    () =>
      clientWorkerFacets({
        withStates,
        positions: positions.isError ? [] : positions.data?.items,
        workplaces: workplaces.isError ? [] : workplaces.data?.items,
        // One workplace filters nothing; while they load, a chosen one is still read.
        withWorkplaces: workplaceCount > 1 || (workplaces.isPending && Boolean(search.workplace)),
      }),
    [
      withStates,
      positions.data,
      positions.isError,
      workplaces.data,
      workplaces.isError,
      workplaceCount,
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
    request: apiRequest,
    query: {
      queryKey: [...getListEmployeesQueryKey(clientId, params), userId],
      enabled: Boolean(session && apiRequest.baseUrl),
      placeholderData: keepPreviousData,
    },
  });
  const meta = employees.data ?? { page, pageSize: defaultPageSize, total: 0 };
  const unfilteredTotal = employees.data?.unfilteredTotal ?? 0;
  const listStatus = !apiRequest.baseUrl ? 'error' : employees.status;
  const startsFromEmpty = !readOnly && !former && !narrowed;
  const [change, setChange] = useState<EmployeeStatusChange | null>(null);
  const columns = useMemo(
    () => employeeColumns({ former, withStates, onStatusChange: readOnly ? undefined : setChange }),
    [former, withStates, readOnly]
  );
  const changeSearch = (next: Partial<typeof search>) =>
    void navigate({
      state: keepOpener,
      replace: true,
      resetScroll: false,
      search: (prev) => ({ ...prev, ...next, page: undefined }),
    });
  const changeFilters = (values: ListFilterValues<FilterKey>) =>
    changeSearch(listFilters.searchOf(values) as Filters);

  return (
    <div data-testid="employees-page" className="space-y-5">
      <h2 className="sr-only">Lucrători</h2>
      {!readOnly && <EmployeesOverStepNotice />}
      <EmployeesImportedCard clientId={clientId} />
      {!readOnly && <OpenEmployeeImports clientId={clientId} />}
      <div className={sheetFlushList}>
        <ListCardHeader>
          {!readOnly && !(startsFromEmpty && isEmptyOrLoading(listStatus, unfilteredTotal)) && (
            <div className="w-full md:order-last md:ml-auto md:w-auto">
              <EmployeeImportButtons clientId={clientId} onStart={setImporting} />
            </div>
          )}
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
                onSearch={(next) => changeSearch({ q: next || undefined })}
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
                  <PendingEmployeesLabel
                    clientId={clientId}
                    params={{
                      ...params,
                      page: 1,
                      pageSize: 1,
                      ...(listFilters.searchOf(pending) as Filters),
                    }}
                  />
                )}
                countLabel={workerNoun}
                testId="employees-filters"
              />
            </div>
          )}
          {employees.isSuccess && (
            <ListCount testId="employees-count" className="md:ml-0">
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
          onSortChange={(next) =>
            // Filter and sort changes replace the entry: back returns to the previous page.
            changeSearch({
              sort: next.sort === defaultSort.sort ? undefined : (next.sort as EmployeeSortKey),
              order: next.order === defaultSort.order ? undefined : next.order,
            })
          }
          onPageChange={(next) =>
            void navigate({
              search: (prev) => ({ ...prev, page: next > 1 ? next : undefined }),
              state: keepOpener,
            })
          }
          error={
            <WorkersListError
              error={employees.error}
              testId="employees"
              notFound="Clientul nu mai există în organizația ta."
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
                testId="employees-empty-filtered"
                onClear={() => (filtered ? changeFilters({}) : changeSearch({ q: undefined }))}
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
        open={importing === 'found' || importing === 'new'}
        withFound={importing === 'found'}
        client={client}
        onClose={() => setImporting(null)}
        onStarted={(importId) =>
          void navigate({
            to: '/clienti/$clientId/angajati/import/$importId',
            state: openedFromRecord(`/clienti/${clientId}/angajati`),
            params: { clientId, importId },
          })
        }
        onImportDocumentation={() => setImporting('documentation')}
      />
      <ImportUploadDialog
        open={importing === 'documentation'}
        client={client}
        onClose={() => setImporting(null)}
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
