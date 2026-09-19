import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/clients/$clientId/documents')({
  staticData: { title: 'Documente' },
  component: Outlet,
});
