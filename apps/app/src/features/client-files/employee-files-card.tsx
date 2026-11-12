import { getRouteApi } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';
import { EmployeePending } from '@/features/employees/employee-pending';
import { useEmployee } from '@/features/employees/use-employee';

import type { ClientFileEmployee } from './client-file-format';
import { ClientFilesCard } from './client-files-card';

const employeeRoute = getRouteApi('/_authenticated/clienti/$clientId/angajati/$employeeId');
const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');

export function EmployeeFilesCard({ employee }: { employee: ClientFileEmployee }) {
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  if (!session) return null;
  return (
    <ClientFilesCard
      client={client}
      employee={employee}
      userId={session.user.id}
      readOnly={client.archivedAt !== null}
    />
  );
}

export function EmployeeFilesTab() {
  const { clientId, employeeId } = employeeRoute.useParams();
  const employee = useEmployee(clientId, employeeId).data?.employee;
  if (!employee) return <EmployeePending />;
  return (
    <div data-testid="employee-files-tab">
      <EmployeeFilesCard employee={employee} />
    </div>
  );
}
