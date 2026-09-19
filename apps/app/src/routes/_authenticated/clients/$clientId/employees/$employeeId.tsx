import { formatEmployeeName, maskCnp } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import {
  createFileRoute,
  type ErrorComponentProps,
  Link,
  notFound,
  useRouteContext,
  useRouter,
} from '@tanstack/react-router';
import { ArrowLeft, Eye, EyeOff, RotateCcw, UserRoundMinus } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { z } from 'zod';

import {
  getGetEmployeeQueryKey,
  getGetEmployeeQueryOptions,
  useGetEmployee,
} from '../../../../../api/generated/api';
import { ApiHttpError } from '../../../../../api/http';
import { useAuth } from '../../../../../auth/auth-context';
import { formatDate, formatTenure, todayIso } from '../../../../../employees/employee-format';
import { EmployeeJobPositionDialog } from '../../../../../employees/employee-job-position-dialog';
import {
  type EmployeeStatusChange,
  EmployeeStatusDialog,
} from '../../../../../employees/employee-status-dialog';

// The only page that shows the CNP, and only on request. The loader warms the query and
// names the breadcrumb; the page reads the same query so a status change refreshes it.
export const Route = createFileRoute('/_authenticated/clients/$clientId/employees/$employeeId')({
  staticData: { fullPage: true },
  // The client layout already validates clientId; this route owns employeeId.
  params: { parse: (params) => ({ employeeId: z.uuid().parse(params.employeeId) }) },
  loader: async ({ params, context: { apiRequest, queryClient, auth } }) => {
    const userId = auth.getSnapshot().session?.user.id;
    try {
      const { employee } = await queryClient.ensureQueryData(
        getGetEmployeeQueryOptions(params.clientId, params.employeeId, {
          request: apiRequest,
          query: {
            queryKey: [...getGetEmployeeQueryKey(params.clientId, params.employeeId), userId],
          },
        })
      );
      return { crumb: formatEmployeeName(employee) };
    } catch (cause) {
      if (cause instanceof ApiHttpError && cause.status === 404) throw notFound();
      throw cause;
    }
  },
  component: EmployeePage,
  pendingComponent: EmployeePending,
  notFoundComponent: EmployeeNotFound,
  errorComponent: EmployeeError,
});

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <h2 className="border-b px-5 py-3.5 text-sm font-semibold">{title}</h2>
      <dl className="grid gap-px bg-border sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Fact({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div className={wide ? 'bg-card px-5 py-3.5 sm:col-span-2' : 'bg-card px-5 py-3.5'}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words whitespace-pre-line">
        {empty ? <span className="font-normal text-muted-foreground">—</span> : children}
      </dd>
    </div>
  );
}

// Masked until asked for; hides again when the page is left.
function Cnp({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span className="flex items-center gap-2">
      <span data-testid="employee-cnp-value" className="tabular-nums">
        {revealed ? value : maskCnp(value)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        data-testid="employee-cnp-toggle"
        aria-pressed={revealed}
        onClick={() => setRevealed((current) => !current)}
      >
        {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        {revealed ? 'Ascunde' : 'Arată'}
      </Button>
    </span>
  );
}

export function EmployeePage() {
  const { clientId, employeeId } = Route.useParams();
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const query = useGetEmployee(clientId, employeeId, {
    request: apiRequest,
    query: {
      queryKey: [...getGetEmployeeQueryKey(clientId, employeeId), session?.user.id],
      enabled: Boolean(session && apiRequest.baseUrl),
    },
  });
  const [change, setChange] = useState<EmployeeStatusChange | null>(null);
  const [moving, setMoving] = useState(false);
  const employee = query.data?.employee;
  if (!employee) return <EmployeePending />;
  const former = employee.status === 'terminated';
  const blood = [employee.bloodGroup, employee.rhFactor ? `Rh ${employee.rhFactor}` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div data-testid="employee-page" className="space-y-7">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3 text-muted-foreground">
          <Link to="/clients/$clientId/employees" params={{ clientId }} data-testid="employee-back">
            <ArrowLeft aria-hidden="true" />
            Angajați
          </Link>
        </Button>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight">
              {formatEmployeeName(employee)}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>{employee.jobPosition.name}</span>
              <Badge variant={former ? 'outline' : 'secondary'} data-testid="employee-status">
                {former ? 'Fost angajat' : 'Angajat actual'}
              </Badge>
            </p>
          </div>
          <Button
            variant="outline"
            data-testid="employee-status-action"
            onClick={() => setChange({ employee, action: former ? 'reactivate' : 'terminate' })}
          >
            {former ? <RotateCcw aria-hidden="true" /> : <UserRoundMinus aria-hidden="true" />}
            {former ? 'Reactivează…' : 'Marchează plecarea…'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        <Section title="Identificare">
          <Fact label="Nume">{employee.lastName}</Fact>
          <Fact label="Prenume">{employee.firstName}</Fact>
          <Fact label="CNP">{employee.cnp ? <Cnp value={employee.cnp} /> : null}</Fact>
          <Fact label="Marca">{employee.employeeNumber}</Fact>
        </Section>

        <Section title="Angajare">
          <Fact label="Post de lucru">
            <span className="flex flex-wrap items-center gap-2">
              <span data-testid="employee-job-position">{employee.jobPosition.name}</span>
              {!former && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  data-testid="employee-job-position-change"
                  onClick={() => setMoving(true)}
                >
                  Schimbă…
                </Button>
              )}
            </span>
          </Fact>
          <Fact label="Funcția din contract">{employee.jobTitle}</Fact>
          <Fact label="Data angajării">{formatDate(employee.hiredAt)}</Fact>
          <Fact label={former ? 'Vechime la plecare' : 'Vechime'}>
            {formatTenure(employee.hiredAt, employee.terminatedAt ?? todayIso())}
          </Fact>
          <Fact label="Data plecării">
            {employee.terminatedAt ? formatDate(employee.terminatedAt) : null}
          </Fact>
        </Section>

        <Section title="Contact">
          <Fact label="Email">
            {employee.email && (
              <a href={`mailto:${employee.email}`} className="hover:underline">
                {employee.email}
              </a>
            )}
          </Fact>
          <Fact label="Telefon">
            {employee.phone && (
              <a href={`tel:${employee.phone.replace(/[^+\d]/g, '')}`} className="hover:underline">
                {employee.phone}
              </a>
            )}
          </Fact>
        </Section>

        <Section title="Fișa de instruire">
          <Fact label="Data nașterii">
            {employee.birthDate ? formatDate(employee.birthDate) : null}
          </Fact>
          <Fact label="Locul nașterii">{employee.birthPlace}</Fact>
          <Fact label="Domiciliu" wide>
            {employee.homeAddress}
          </Fact>
          <Fact label="Grupa sanguină">{blood}</Fact>
          <Fact label="Observații" wide>
            {employee.notes}
          </Fact>
        </Section>
      </div>
      <EmployeeStatusDialog clientId={clientId} change={change} onClose={() => setChange(null)} />
      <EmployeeJobPositionDialog
        clientId={clientId}
        userId={session?.user.id ?? ''}
        employee={moving ? employee : null}
        onClose={() => setMoving(false)}
      />
    </div>
  );
}

function EmployeePending() {
  return (
    <div className="space-y-7" aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  );
}

function EmployeeNotFound() {
  const { clientId } = Route.useParams();
  return (
    <div data-testid="employee-not-found" className="mx-auto grid max-w-lg gap-5 py-14">
      <h1 className="text-2xl font-semibold">Angajatul nu a fost găsit</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Nu există niciun angajat cu acest identificator la acest client.
      </p>
      <Button asChild className="w-fit">
        <Link to="/clients/$clientId/employees" params={{ clientId }}>
          Înapoi la angajați
        </Link>
      </Button>
    </div>
  );
}

function EmployeeError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const message =
    error instanceof ApiHttpError && error.status === 401
      ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
      : error instanceof ApiHttpError && error.status === 403
        ? 'Contul tău nu face parte dintr-o organizație. Contactează administratorul.'
        : 'Nu am putut încărca datele angajatului. Încearcă din nou.';
  return (
    <div data-testid="employee-error" role="alert" className="mx-auto grid max-w-lg gap-5 py-14">
      <h1 className="text-2xl font-semibold">Angajatul nu a putut fi încărcat</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>
      <Button
        data-testid="employee-retry"
        variant="outline"
        className="w-fit"
        onClick={() => void router.invalidate()}
      >
        Încearcă din nou
      </Button>
    </div>
  );
}
