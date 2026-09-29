import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/clients/$clientId/other-documents')({
  staticData: { title: 'Alte documente' },
  component: Outlet,
});
