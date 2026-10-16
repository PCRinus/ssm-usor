import { getRouteApi } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';

import type { ClientFileEmployee } from './client-file-format';
import { ClientFilesCard } from './client-files-card';

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

export function EmployeeFilesCard({ employee }: { employee: ClientFileEmployee }) {
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  if (!session) return null;
  return (
    <ClientFilesCard
      client={client}
      employee={employee}
      userId={session.user.id}
      readOnly={client.archivedAt !== null}
    />
  );
}
