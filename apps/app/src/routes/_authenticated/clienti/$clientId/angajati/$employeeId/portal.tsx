import { createFileRoute, getRouteApi } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';
import { useEmployee } from '@/features/employees/use-employee';
import {
  accessLead,
  hasContact,
  useEmployeeParticipant,
} from '@/features/participants/employee-access';
import { EmployeePortalCard } from '@/features/participants/employee-portal-card';
import { SigningAgreementCard } from '@/features/signatures/signing-agreement-card';

export const Route = createFileRoute(
  '/_authenticated/clienti/$clientId/angajati/$employeeId/portal'
)({
  staticData: { title: 'Portal' },
  component: EmployeePortal,
});

const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');

// One dark button on the tab: the access panel's step comes first, the agreement's after it.
function EmployeePortal() {
  const { clientId, employeeId } = Route.useParams();
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  const query = useEmployee(clientId, employeeId);
  const access = useEmployeeParticipant(clientId, employeeId);
  const employee = query.data?.employee;
  if (!employee || !session) return null;
  const readOnly = client.archivedAt !== null;
  const former = employee.status === 'terminated';
  const state = access.data;
  const invited = Boolean(
    state?.participant || (state?.invitation && state.invitation.status !== 'expired')
  );

  return (
    <div data-testid="employee-portal" className="grid gap-4">
      <EmployeePortalCard employee={employee} readOnly={readOnly} former={former} />
      <SigningAgreementCard
        employee={employee}
        readOnly={readOnly}
        former={former}
        invited={invited}
        leads={state !== undefined && accessLead(state, employee, readOnly || former) === null}
        contactAsked={
          state !== undefined && !readOnly && !former && !invited && !hasContact(employee)
        }
      />
    </div>
  );
}
