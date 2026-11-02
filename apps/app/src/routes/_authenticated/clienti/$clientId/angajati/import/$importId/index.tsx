import { createFileRoute, getRouteApi } from '@tanstack/react-router';

import { EmployeeImportPage } from '@/features/imports/employees/employee-import-page';

const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');

export const Route = createFileRoute(
  '/_authenticated/clienti/$clientId/angajati/import/$importId/'
)({
  component: EmployeeImportRoute,
});

function EmployeeImportRoute() {
  const { clientId, importId } = Route.useParams();
  const { client } = clientRoute.useLoaderData();
  return (
    <EmployeeImportPage importId={importId} clientId={clientId} clientName={client.legalName} />
  );
}
