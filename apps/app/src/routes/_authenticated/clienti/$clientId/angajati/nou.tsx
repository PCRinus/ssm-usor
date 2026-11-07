import { createFileRoute, getRouteApi } from '@tanstack/react-router';

import { EmployeeForm } from '@/features/employees/employee-form';

const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');

export const Route = createFileRoute('/_authenticated/clienti/$clientId/angajati/nou')({
  staticData: { title: 'Lucrător nou', fullPage: true },
  component: NewEmployeePage,
});

function NewEmployeePage() {
  const { clientId } = Route.useParams();
  const { client } = clientRoute.useLoaderData();
  return <EmployeeForm clientId={clientId} clientName={client.legalName} />;
}
