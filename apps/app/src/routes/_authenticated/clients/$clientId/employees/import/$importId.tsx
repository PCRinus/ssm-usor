import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { EmployeeImportScope } from '@/features/imports/employees/employee-import-page';

export const Route = createFileRoute(
  '/_authenticated/clients/$clientId/employees/import/$importId'
)({
  params: { parse: (params) => ({ importId: z.uuid().parse(params.importId) }) },
  staticData: { title: 'Angajați din fișe', fullPage: true },
  loader: () => ({ crumb: 'Angajați din fișe' }),
  component: EmployeeImportScope,
});
