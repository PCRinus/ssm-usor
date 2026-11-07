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
import { SectionNav, SectionNavLink } from '@/components/section-nav';
import { HeaderFact, RecordHeader } from '@/features/clients/record-header';

import { EmployeePending } from './employee-pending';
import { employeeSections } from './employee-sections';
import { type EmployeeStatusChange, EmployeeStatusDialog } from './employee-status-dialog';
import { useEmployee } from './use-employee';

const employeeRoute = getRouteApi('/_authenticated/clienti/$clientId/angajati/$employeeId');
const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');

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
                to="/clienti/$clientId/angajati"
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
                  {former ? 'Fost lucrător' : 'Lucrător actual'}
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
                  to="/clienti/$clientId/angajati/$employeeId/editare"
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
      <SectionNav label="Secțiunile lucrătorului">
        {employeeSections.map(({ to, label, icon, exact }) => (
          <SectionNavLink
            key={to}
            to={to}
            params={{ clientId, employeeId }}
            activeOptions={{ exact }}
            data-testid="employee-section"
            icon={icon}
          >
            {label}
          </SectionNavLink>
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
      <h1 className="text-2xl font-semibold">Lucrătorul nu a fost găsit</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Nu există niciun lucrător cu acest identificator la acest client.
      </p>
      <Button asChild className="w-fit">
        <Link to="/clienti/$clientId/angajati" params={{ clientId }}>
          Înapoi la lucrători
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
        ? 'Contul tău nu face parte dintr-o organizație. Contactează adminul.'
        : 'Nu am putut încărca datele lucrătorului. Încearcă din nou.';
  return (
    <div data-testid="employee-error" role="alert" className="mx-auto grid max-w-lg gap-5 py-14">
      <h1 className="text-2xl font-semibold">Lucrătorul nu a putut fi încărcat</h1>
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
