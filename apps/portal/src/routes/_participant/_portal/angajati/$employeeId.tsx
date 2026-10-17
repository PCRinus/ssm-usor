import { createFileRoute } from '@tanstack/react-router';

import { EmployeePage } from '@/features/employees/employee-page';

export const Route = createFileRoute('/_participant/_portal/angajati/$employeeId')({
  component: EmployeeRoute,
});

function EmployeeRoute() {
  return <EmployeePage employeeId={Route.useParams().employeeId} />;
}
