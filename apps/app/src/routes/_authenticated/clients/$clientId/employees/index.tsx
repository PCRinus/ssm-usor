import {
  defaultPageSize,
  type EmployeeSortKey,
  employeeSortKeys,
  employeeStatuses,
  sortOrderSchema,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { keepPreviousData } from '@tanstack/react-query';
import {
  createFileRoute,
  getRouteApi,
  Link,
  useNavigate,
  useRouteContext,
} from '@tanstack/react-router';
import { Plus, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { z } from 'zod';

import { getListEmployeesQueryKey, useListEmployees } from '../../../../../api/generated/api';
import { ApiHttpError } from '../../../../../api/http';
import { useAuth } from '../../../../../auth/auth-context';
import type { DataTableSort } from '../../../../../components/data-table/columns';
import { DataTable } from '../../../../../components/data-table/data-table';
import { employeeColumns, type EmployeeRow } from '../../../../../employees/employee-columns';
import { employeeStatusLabels } from '../../../../../employees/employee-format';
import {
  type EmployeeStatusChange,
  EmployeeStatusDialog,
} from '../../../../../employees/employee-status-dialog';

// The table state lives in the URL: status filter, page, and one sort key, so refresh and
// back keep the place in the list. Defaults are omitted to keep links short.
const defaultSort: DataTableSort & { sort: EmployeeSortKey } = { sort: 'name', order: 'asc' };

const searchSchema = z.object({
  status: z.enum(employeeStatuses).optional(),
  page: z.number().int().min(1).optional().catch(undefined),
  sort: z.enum(employeeSortKeys).optional().catch(undefined),
  order: sortOrderSchema.optional().catch(undefined),
});

const filters = [
  { status: undefined, label: employeeStatusLabels.active, testId: 'employees-filter-current' },
  {
    status: 'terminated',
    label: employeeStatusLabels.terminated,
    testId: 'employees-filter-terminated',
  },
] as const;

export const Route = createFileRoute('/_authenticated/clients/$clientId/employees/')({
  validateSearch: searchSchema,
  component: EmployeesPage,
});

const rowKey = (row: EmployeeRow) => row.id;

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

export function EmployeesPage() {
  const { clientId } = Route.useParams();
  const readOnly = clientRoute.useLoaderData().client.archivedAt !== null;
  const {
    status,
    page = 1,
    sort = defaultSort.sort,
    order = defaultSort.order,
  } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const params = { ...(status ? { status } : {}), page, pageSize: defaultPageSize, sort, order };
  const employees = useListEmployees(clientId, params, {
    request: apiRequest,
    query: {
      queryKey: [...getListEmployeesQueryKey(clientId, params), session?.user.id],
      enabled: Boolean(session && apiRequest.baseUrl),
      placeholderData: keepPreviousData,
    },
  });
  const meta = employees.data ?? { page, pageSize: defaultPageSize, total: 0 };
  const [change, setChange] = useState<EmployeeStatusChange | null>(null);
  const columns = useMemo(() => employeeColumns(readOnly ? undefined : setChange), [readOnly]);

  return (
    <div data-testid="employees-page" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Angajați</h2>
        {!readOnly && (
          <Button asChild>
            <Link
              to="/clients/$clientId/employees/new"
              params={{ clientId }}
              data-testid="employees-add"
            >
              <Plus aria-hidden="true" />
              Adaugă angajat
            </Link>
          </Button>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
          <nav aria-label="Filtrează angajații" className="flex gap-1">
            {filters.map((filter) => {
              const active = filter.status === status;
              return (
                <Link
                  key={filter.label}
                  to="/clients/$clientId/employees"
                  params={{ clientId }}
                  search={filter.status ? { status: filter.status } : {}}
                  data-testid={filter.testId}
                  aria-current={active ? 'page' : undefined}
                  replace
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {filter.label}
                </Link>
              );
            })}
          </nav>
          {employees.isSuccess && (
            <span className="ml-auto text-sm text-muted-foreground" data-testid="employees-count">
              {meta.total === 1 ? '1 angajat' : `${meta.total} angajați`}
            </span>
          )}
        </div>
        <DataTable
          testId="employees-table"
          rowTestId="employees-row"
          label="Lista angajaților"
          columns={columns}
          data={employees.data?.items}
          rowKey={rowKey}
          onRowClick={(employee) =>
            void navigate({
              to: '/clients/$clientId/employees/$employeeId',
              params: { clientId, employeeId: employee.id },
            })
          }
          meta={meta}
          noun={['angajat', 'angajați']}
          status={!apiRequest.baseUrl ? 'error' : employees.status}
          isFetching={employees.isFetching}
          sort={{ sort, order }}
          onSortChange={(next) =>
            // Filter and sort changes replace the entry: back returns to the previous page.
            void navigate({
              replace: true,
              search: (prev) => ({
                ...prev,
                sort: next.sort === defaultSort.sort ? undefined : (next.sort as EmployeeSortKey),
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
              <p data-testid="employees-error" role="alert" className="text-sm">
                {employees.error instanceof ApiHttpError && employees.error.status === 401
                  ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
                  : employees.error instanceof ApiHttpError && employees.error.status === 403
                    ? 'Contul tău nu face parte dintr-o organizație. Contactează administratorul.'
                    : employees.error instanceof ApiHttpError && employees.error.status === 404
                      ? 'Clientul nu mai există în organizația ta.'
                      : 'Nu am putut încărca lista angajaților. Încearcă din nou.'}
              </p>
              {apiRequest.baseUrl && (
                <Button
                  data-testid="employees-retry"
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
            <>
              <UserRound className="mx-auto mb-4 size-8 text-muted-foreground" aria-hidden="true" />
              <h3 className="text-base font-medium">
                {status === 'terminated' ? 'Niciun fost angajat' : 'Niciun angajat încă'}
              </h3>
              <p
                data-testid="employees-empty"
                className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground"
              >
                {status === 'terminated'
                  ? 'Angajații care pleacă rămân aici, cu dovezile lor.'
                  : 'Adaugă angajații clientului pentru a le organiza instruirile și documentele.'}
              </p>
              {!status && !readOnly && (
                <Button asChild variant="outline" className="mt-5">
                  <Link to="/clients/$clientId/employees/new" params={{ clientId }}>
                    <Plus aria-hidden="true" />
                    Adaugă primul angajat
                  </Link>
                </Button>
              )}
            </>
          }
        />
      </div>
      <EmployeeStatusDialog clientId={clientId} change={change} onClose={() => setChange(null)} />
    </div>
  );
}
