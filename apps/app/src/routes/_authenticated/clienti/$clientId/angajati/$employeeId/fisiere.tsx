import { createFileRoute } from '@tanstack/react-router';

import { EmployeeFilesTab } from '@/features/client-files/employee-files-card';

export const Route = createFileRoute(
  '/_authenticated/clienti/$clientId/angajati/$employeeId/fisiere'
)({
  staticData: { title: 'Fișiere' },
  component: EmployeeFilesTab,
});
