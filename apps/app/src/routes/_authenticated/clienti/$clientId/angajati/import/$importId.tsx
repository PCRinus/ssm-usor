import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { EmployeeImportScope } from '@/features/imports/employees/employee-import-page';

export const Route = createFileRoute('/_authenticated/clienti/$clientId/angajati/import/$importId')(
  {
    params: { parse: (params) => ({ importId: z.uuid().parse(params.importId) }) },
    staticData: { title: 'Lucrători din fișe', fullPage: true },
    loader: () => ({ crumb: 'Lucrători din fișe' }),
    component: EmployeeImportScope,
  }
);
