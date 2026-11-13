import { formatEmployeeName } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { type ErrorComponentProps, getRouteApi, Link, Outlet } from '@tanstack/react-router';
import { Pencil, RotateCcw, UserRound, UserRoundMinus } from 'lucide-react';
import { useState } from 'react';

import { NotFound, RouteError } from '@/app/route-states';
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
        personal
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
    <NotFound
      testId="employee-not-found"
      title="Lucrătorul nu a fost găsit"
      description="Nu există niciun lucrător cu acest identificator la acest client."
      action={
        <Button size="lg" asChild>
          <Link to="/clienti/$clientId/angajati" params={{ clientId }}>
            Înapoi la lucrători
          </Link>
        </Button>
      }
    />
  );
}

export function EmployeeError({ error }: ErrorComponentProps) {
  return (
    <RouteError
      error={error}
      testId="employee-error"
      title="Lucrătorul nu a putut fi încărcat"
      retryTestId="employee-retry"
      explainForbidden
    />
  );
}
