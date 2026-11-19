import { createFileRoute } from '@tanstack/react-router';

import { importsSearchSchema } from '@/features/imports/list/imports-search';
import { ImportsTab } from '@/features/imports/list/imports-tab';

export const Route = createFileRoute('/_authenticated/importuri/lucratori')({
  staticData: { title: 'Lucrători' },
  validateSearch: importsSearchSchema,
  component: EmployeeImports,
});

function EmployeeImports() {
  return <ImportsTab kind="employees" search={Route.useSearch()} />;
}
