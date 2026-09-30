import { createFileRoute, getRouteApi } from '@tanstack/react-router';

import { EmployeeForm } from '@/features/employees/employee-form';

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

export const Route = createFileRoute('/_authenticated/clients/$clientId/employees/new')({
  staticData: { title: 'Angajat nou', fullPage: true },
  component: NewEmployeePage,
});

function NewEmployeePage() {
  const { clientId } = Route.useParams();
  const { client } = clientRoute.useLoaderData();
  return <EmployeeForm clientId={clientId} clientName={client.legalName} />;
}
