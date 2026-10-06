import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/clients/$clientId/fire-safety-documents')({
  staticData: { title: 'Documente PSI' },
  component: Outlet,
});
