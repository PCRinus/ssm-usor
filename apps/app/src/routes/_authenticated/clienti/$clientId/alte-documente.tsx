import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/clienti/$clientId/alte-documente')({
  staticData: { title: 'Alte documente' },
  component: Outlet,
});
