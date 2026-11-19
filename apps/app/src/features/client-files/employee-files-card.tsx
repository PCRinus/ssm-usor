import { getRouteApi } from '@tanstack/react-router';

import { keepOpener } from '@/app/opener';
import { useAuth } from '@/features/auth/auth-context';
import { EmployeePending } from '@/features/employees/employee-pending';
import { useEmployee } from '@/features/employees/use-employee';

import { ClientFilesCard } from './client-files-card';

const filesRoute = getRouteApi('/_authenticated/clienti/$clientId/angajati/$employeeId/documente');
const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');

export function EmployeeFilesTab() {
  const { clientId, employeeId } = filesRoute.useParams();
  const search = filesRoute.useSearch();
  const navigate = filesRoute.useNavigate();
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  const employee = useEmployee(clientId, employeeId).data?.employee;
  if (!employee) return <EmployeePending />;
  if (!session) return null;
  return (
    <div data-testid="employee-files-tab">
      <ClientFilesCard
        client={client}
        employee={employee}
        readOnly={client.archivedAt !== null}
        search={search}
        onSearch={(next) =>
          void navigate({ search: next, state: keepOpener, replace: true, resetScroll: false })
        }
      />
    </div>
  );
}
