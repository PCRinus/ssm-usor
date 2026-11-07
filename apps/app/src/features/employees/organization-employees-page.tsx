import { defaultPageSize, type OrganizationEmployeeSortKey } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { keepPreviousData } from '@tanstack/react-query';
import { getRouteApi, Link, useRouteContext } from '@tanstack/react-router';
import { UsersRound } from 'lucide-react';

import {
  getListOrganizationEmployeesQueryKey,
  useListOrganizationEmployees,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import type { DataTableSort } from '@/components/data-table/columns';
import { DataTable } from '@/components/data-table/data-table';
import { FilterTab, FilterTabs, ListCardHeader, ListCount } from '@/components/list-card-header';
import { SearchInput } from '@/components/search-input';
import { useAuth } from '@/features/auth/auth-context';
import { TestStateFilter } from '@/features/knowledge-tests/test-state-filter';
import { TrainingStateFilter } from '@/features/trainings/training-state-filter';

import { ClientFilter } from './client-filter';
import { employeeStatusLabels, roCount } from './employee-format';
import { EmployeesNoMatch } from './employees-no-match';
import {
  organizationEmployeeColumns,
  type OrganizationEmployeeRow,
} from './organization-employee-columns';

const route = getRouteApi('/_authenticated/angajati/');

const defaultSort: DataTableSort & { sort: OrganizationEmployeeSortKey } = {
  sort: 'name',
  order: 'asc',
};

const filters = [
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

const rowKey = (row: OrganizationEmployeeRow) => row.id;

export function OrganizationEmployeesPage() {
  const {
    status,
    clientId,
    trainingState,
    testState,
    domain,
    q,
    page = 1,
    sort = defaultSort.sort,
    order = defaultSort.order,
  } = route.useSearch();
  const navigate = route.useNavigate();
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const params = {
    ...(status ? { status } : {}),
    ...(clientId ? { clientId } : {}),
    ...(trainingState ? { trainingState } : {}),
    ...(testState ? { testState } : {}),
    ...(domain ? { domain } : {}),
    ...(q ? { q } : {}),
    page,
    pageSize: defaultPageSize,
    sort,
    order,
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

  return (
    <div data-testid="organization-employees-page" className="space-y-7">
      <h1 className="text-3xl font-semibold tracking-tight">Lucrători</h1>
      <div className="overflow-hidden rounded-lg border bg-card">
        <ListCardHeader>
          <FilterTabs label="Filtrează lucrătorii">
            {filters.map((filter) => (
              <FilterTab
                key={filter.label}
                to="/angajati"
                search={{
                  ...(filter.status ? { status: filter.status } : {}),
                  clientId,
                  q,
                }}
                data-testid={filter.testId}
                active={filter.status === status}
                replace
              >
                {filter.label}
              </FilterTab>
            ))}
          </FilterTabs>
          <div className="w-full sm:w-64">
            <ClientFilter
              userId={session?.user.id}
              value={clientId}
              onChange={(next) =>
                void navigate({
                  replace: true,
                  search: (prev) => ({ ...prev, clientId: next, page: undefined }),
                })
              }
            />
          </div>
          <SearchInput
            value={q}
            onSearch={(next) =>
              void navigate({
                replace: true,
                search: (prev) => ({ ...prev, q: next || undefined, page: undefined }),
              })
            }
            placeholder="Caută după nume, marcă sau client"
            label="Caută lucrători"
            testId="organization-employees-search"
          />
          {status !== 'terminated' && (
            <>
              <TrainingStateFilter
                value={trainingState}
                testId="organization-employees-training-filter"
                onChange={(next) =>
                  void navigate({
                    replace: true,
                    search: (prev) => ({
                      ...prev,
                      trainingState: next,
                      domain: undefined,
                      page: undefined,
                    }),
                  })
                }
              />
              <TestStateFilter
                value={testState}
                testId="organization-employees-test-filter"
                onChange={(next) =>
                  void navigate({
                    replace: true,
                    search: (prev) => ({
                      ...prev,
                      testState: next,
                      domain: undefined,
                      page: undefined,
                    }),
                  })
                }
              />
            </>
          )}
          {employees.isSuccess && (
            <ListCount testId="organization-employees-count">
              {roCount(meta.total, 'lucrător', 'lucrători')}
            </ListCount>
          )}
        </ListCardHeader>
        <DataTable
          testId="organization-employees-table"
          rowTestId="organization-employees-row"
          label="Lucrătorii organizației"
          columns={organizationEmployeeColumns}
          data={employees.data?.items}
          rowKey={rowKey}
          onRowClick={(employee) =>
            void navigate({
              to: '/clienti/$clientId/angajati/$employeeId',
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
            void navigate({
              replace: true,
              search: (prev) => ({
                ...prev,
                sort:
                  next.sort === defaultSort.sort
                    ? undefined
                    : (next.sort as OrganizationEmployeeSortKey),
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
              <p data-testid="organization-employees-error" role="alert" className="text-sm">
                {employees.error instanceof ApiHttpError && employees.error.status === 401
                  ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
                  : employees.error instanceof ApiHttpError && employees.error.status === 403
                    ? 'Contul tău nu face parte dintr-o organizație. Contactează adminul.'
                    : 'Nu am putut încărca lista lucrătorilor. Încearcă din nou.'}
              </p>
              {apiRequest.baseUrl && (
                <Button
                  data-testid="organization-employees-retry"
                  variant="outline"
                  className="mt-4"
                  disabled={employees.isFetching}
                  onClick={() => void employees.refetch()}
                >
                  Încearcă din nou
                </Button>
              )}
            </>
          }
          empty={
            q ? (
              <EmployeesNoMatch
                hint="Verifică ce ai scris sau caută după alt nume, altă marcă ori alt client."
                testId="organization-employees-empty"
                onClear={() =>
                  void navigate({
                    replace: true,
                    search: (prev) => ({ ...prev, q: undefined, page: undefined }),
                  })
                }
              />
            ) : trainingState ? (
              <EmployeesNoMatch
                title="Niciun lucrător în această stare a instruirii"
                hint="Ceilalți lucrători sunt în altă stare. Arată-i pe toți pentru a-i vedea."
                testId="organization-employees-empty"
                clearLabel="Arată toți lucrătorii"
                clearTestId="organization-employees-empty-clear-training-state"
                onClear={() =>
                  void navigate({
                    replace: true,
                    search: (prev) => ({
                      ...prev,
                      trainingState: undefined,
                      domain: undefined,
                      page: undefined,
                    }),
                  })
                }
              />
            ) : testState ? (
              <EmployeesNoMatch
                title="Niciun lucrător în această stare a testării"
                hint="Ceilalți lucrători sunt în altă stare. Arată-i pe toți pentru a-i vedea."
                testId="organization-employees-empty"
                clearLabel="Arată toți lucrătorii"
                clearTestId="organization-employees-empty-clear-test-state"
                onClear={() =>
                  void navigate({
                    replace: true,
                    search: (prev) => ({
                      ...prev,
                      testState: undefined,
                      domain: undefined,
                      page: undefined,
                    }),
                  })
                }
              />
            ) : (
              <>
                <UsersRound
                  className="mx-auto mb-4 size-8 text-muted-foreground"
                  aria-hidden="true"
                />
                <h3 className="text-base font-medium">
                  {status === 'terminated' ? 'Niciun fost lucrător' : 'Niciun lucrător încă'}
                </h3>
                <p
                  data-testid="organization-employees-empty"
                  className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground"
                >
                  {status === 'terminated'
                    ? 'Lucrătorii care pleacă rămân aici, cu dovezile lor.'
                    : 'Lucrătorii se adaugă din pagina fiecărui client și apar aici, toți împreună.'}
                </p>
                {!status && !clientId && (
                  <Button asChild variant="outline" className="mt-5">
                    <Link to="/clienti">Mergi la clienți</Link>
                  </Button>
                )}
              </>
            )
          }
        />
      </div>
    </div>
  );
}
