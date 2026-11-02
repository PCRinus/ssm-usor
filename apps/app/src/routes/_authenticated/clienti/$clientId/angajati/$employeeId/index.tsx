import { createFileRoute } from '@tanstack/react-router';

import { EmployeePage } from '@/features/employees/employee-page';

// The only page that shows the CNP, and only on request.
export const Route = createFileRoute('/_authenticated/clienti/$clientId/angajati/$employeeId/')({
  component: EmployeePage,
});
