import { employeeStatuses, formatEmployeeName } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ssm-usor/ui/components/table';
import { cn } from '@ssm-usor/ui/lib/utils';
import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router';
import { Plus, UserRound } from 'lucide-react';
import { z } from 'zod';

import {
  type EmployeeListResponse,
  getListEmployeesQueryKey,
  useListEmployees,
} from '../../../../../api/generated/api';
import { ApiHttpError } from '../../../../../api/http';
import { useAuth } from '../../../../../auth/auth-context';
import { employeeStatusLabels, formatDate } from '../../../../../employees/employee-format';

type Employee = EmployeeListResponse['employees'][number];

// Without a status the API lists everyone still employed (active and suspended).
const searchSchema = z.object({ status: z.enum(employeeStatuses).optional() });

const filters = [
  { status: undefined, label: 'În activitate', testId: 'employees-filter-current' },
  { status: 'terminated', label: 'Plecați', testId: 'employees-filter-terminated' },
] as const;

export const Route = createFileRoute('/_authenticated/clients/$clientId/employees/')({
  validateSearch: searchSchema,
  component: EmployeesPage,
});

function contact(employee: Employee) {
  return (
    <>
      {employee.email && <span className="block truncate">{employee.email}</span>}
      {employee.phone && <span className="block tabular-nums">{employee.phone}</span>}
      {!employee.email && !employee.phone && '—'}
    </>
  );
}

function StatusBadge({ status }: { status: Employee['status'] }) {
  return (
    <Badge
      variant={status === 'active' ? 'secondary' : 'outline'}
      className={cn(status === 'suspended' && 'text-muted-foreground')}
    >
      {employeeStatusLabels[status]}
    </Badge>
  );
}

export function EmployeesPage() {
  const { clientId } = Route.useParams();
  const { status } = Route.useSearch();
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const params = status ? { status } : undefined;
  const employees = useListEmployees(clientId, params, {
    request: apiRequest,
    query: {
      queryKey: [...getListEmployeesQueryKey(clientId, params), session?.user.id],
      enabled: Boolean(session && apiRequest.baseUrl),
    },
  });
  const rows = employees.data?.employees ?? [];
  const columns = 5;

  return (
    <div data-testid="employees-page" className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Angajați</h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Persoanele angajate la acest client, pentru instruiri, fișe și documente.
          </p>
        </div>
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
                  replace
                  data-testid={filter.testId}
                  aria-current={active ? 'page' : undefined}
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
              {rows.length === 1 ? '1 angajat' : `${rows.length} angajați`}
            </span>
          )}
        </div>
        <Table data-testid="employees-table" aria-label="Lista angajaților">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Angajat</TableHead>
              <TableHead>Funcție</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Angajat din</TableHead>
              <TableHead className="pr-5">Stare</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!apiRequest.baseUrl || employees.isError ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns} className="h-48 px-5 text-center whitespace-normal">
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
                </TableCell>
              </TableRow>
            ) : employees.isPending ? (
              Array.from({ length: 3 }, (_, index) => (
                <TableRow key={index} className="hover:bg-transparent">
                  <TableCell className="pl-5">
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell className="pr-5">
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns} className="h-64 px-5 text-center whitespace-normal">
                  <UserRound
                    className="mx-auto mb-4 size-8 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <h3 className="text-base font-medium">
                    {status === 'terminated' ? 'Niciun angajat plecat' : 'Niciun angajat încă'}
                  </h3>
                  <p
                    data-testid="employees-empty"
                    className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground"
                  >
                    {status === 'terminated'
                      ? 'Angajații care pleacă rămân aici, cu dovezile lor.'
                      : 'Adaugă angajații clientului pentru a le organiza instruirile și documentele.'}
                  </p>
                  {!status && (
                    <Button asChild variant="outline" className="mt-5">
                      <Link to="/clients/$clientId/employees/new" params={{ clientId }}>
                        <Plus aria-hidden="true" />
                        Adaugă primul angajat
                      </Link>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((employee) => (
                <TableRow key={employee.id} data-testid="employees-row">
                  <TableCell className="pl-5 font-medium">
                    {formatEmployeeName(employee)}
                    {employee.employeeNumber && (
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        Marca {employee.employeeNumber}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{employee.jobTitle}</TableCell>
                  <TableCell className="max-w-56 text-sm">{contact(employee)}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatDate(employee.hiredAt)}
                    {employee.terminatedAt && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        până la {formatDate(employee.terminatedAt)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="pr-5">
                    <StatusBadge status={employee.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
