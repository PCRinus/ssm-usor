import { createFileRoute, getRouteApi } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';
import { useEmployee } from '@/features/employees/use-employee';
import { EmployeePortalCard } from '@/features/participants/employee-portal-card';
import { SigningAgreementCard } from '@/features/signatures/signing-agreement-card';

export const Route = createFileRoute(
  '/_authenticated/clienti/$clientId/angajati/$employeeId/portal'
)({
  staticData: { title: 'Portal' },
  component: EmployeePortal,
});

const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');

function EmployeePortal() {
  const { clientId, employeeId } = Route.useParams();
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  const query = useEmployee(clientId, employeeId);
  const employee = query.data?.employee;
  if (!employee || !session) return null;
  const readOnly = client.archivedAt !== null;

  return (
    <div data-testid="employee-portal" className="grid gap-6">
      <EmployeePortalCard employee={employee} readOnly={readOnly} />
      <SigningAgreementCard employee={employee} readOnly={readOnly} />
    </div>
  );
}
