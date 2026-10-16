import { formatEmployeeName } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import {
  type ErrorComponentProps,
  getRouteApi,
  Link,
  Outlet,
  useRouter,
} from '@tanstack/react-router';
import { Pencil, RotateCcw, UserRound, UserRoundMinus } from 'lucide-react';
import { useState } from 'react';

import { ApiHttpError } from '@/api/http';
import { SectionNav } from '@/components/section-nav';
import { HeaderFact, RecordHeader } from '@/features/clients/record-header';

import { EmployeePending } from './employee-pending';
import { employeeSections } from './employee-sections';
import { type EmployeeStatusChange, EmployeeStatusDialog } from './employee-status-dialog';
import { useEmployee } from './use-employee';

const employeeRoute = getRouteApi('/_authenticated/clients/$clientId/employees/$employeeId');
const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

export function EmployeeLayout() {
  const { clientId, employeeId } = employeeRoute.useParams();
  const { client } = clientRoute.useLoaderData();
  const readOnly = client.archivedAt !== null;
  const query = useEmployee(clientId, employeeId);
  const [change, setChange] = useState<EmployeeStatusChange | null>(null);
  const employee = query.data?.employee;
  if (!employee) return <EmployeePending />;
  const former = employee.status === 'terminated';

  return (
    <div data-testid="employee-layout" className="space-y-5">
      <RecordHeader
        icon={UserRound}
        title={formatEmployeeName(employee)}
        facts={
          <>
            <HeaderFact label="Post">
              <span data-testid="employee-header-position">{employee.jobPosition.name}</span>
            </HeaderFact>
            <HeaderFact label="Client">
              <Link
                to="/clients/$clientId/employees"
                params={{ clientId }}
                data-testid="employee-header-client"
                className="hover:underline"
              >
                {client.legalName}
              </Link>
            </HeaderFact>
            <div className="flex items-center">
              <dt className="sr-only">Situație</dt>
              <dd>
                <Badge variant={former ? 'outline' : 'secondary'} data-testid="employee-status">
                  {former ? 'Fost angajat' : 'Angajat actual'}
                </Badge>
              </dd>
            </div>
          </>
        }
        actions={
          !readOnly && (
            <>
              <Button asChild variant="outline" size="sm" data-testid="employee-edit">
                <Link
                  to="/clients/$clientId/employees/$employeeId/edit"
                  params={{ clientId, employeeId }}
                >
                  <Pencil aria-hidden="true" />
                  Modifică
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                data-testid="employee-status-action"
                onClick={() => setChange({ employee, action: former ? 'reactivate' : 'terminate' })}
              >
                {former ? <RotateCcw aria-hidden="true" /> : <UserRoundMinus aria-hidden="true" />}
                {former ? 'Reactivează…' : 'Marchează plecarea…'}
              </Button>
            </>
          )
        }
        actionsWidth="wide"
      />
      <SectionNav label="Secțiunile angajatului">
        {employeeSections.map(({ to, label, icon: Icon, exact }) => (
          <li key={to} className="shrink-0">
            <Link
              to={to}
              params={{ clientId, employeeId }}
              resetScroll={false}
              activeOptions={{ exact }}
              data-testid="employee-section"
              className="inline-flex h-10 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[status=active]:border-primary data-[status=active]:text-foreground"
              activeProps={{ 'aria-current': 'page' }}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {label}
            </Link>
          </li>
        ))}
      </SectionNav>
      <Outlet />
      <EmployeeStatusDialog clientId={clientId} change={change} onClose={() => setChange(null)} />
    </div>
  );
}

export function EmployeeNotFound() {
  const { clientId } = employeeRoute.useParams();
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

export function EmployeeError({ error }: ErrorComponentProps) {
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
