import { createFileRoute } from '@tanstack/react-router';

import { EmployeesSectionLayout } from '@/features/employees/employees-section-layout';

export const Route = createFileRoute('/_authenticated/clients/$clientId/employees/_views')({
  component: EmployeesSectionLayout,
});
