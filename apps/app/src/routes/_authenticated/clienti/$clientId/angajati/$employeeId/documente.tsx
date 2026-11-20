import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { clientFileListSearch } from '@/features/client-files/client-file-list';
import { EmployeeFilesTab } from '@/features/client-files/employee-files-card';

export const Route = createFileRoute(
  '/_authenticated/clienti/$clientId/angajati/$employeeId/documente'
)({
  staticData: { title: 'Documente', flushSheet: true },
  validateSearch: z.object(clientFileListSearch),
  component: EmployeeFilesTab,
});
