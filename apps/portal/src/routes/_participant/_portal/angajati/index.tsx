import { createFileRoute } from '@tanstack/react-router';

import { EmployeesPage } from '@/features/employees/employees-page';

export const Route = createFileRoute('/_participant/_portal/angajati/')({
  component: EmployeesPage,
});
