import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/clienti/$clientId/documente-su')({
  staticData: { title: 'Documentație SU' },
  component: Outlet,
});
