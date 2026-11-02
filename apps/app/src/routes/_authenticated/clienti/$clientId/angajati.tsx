import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/clienti/$clientId/angajati')({
  staticData: { title: 'Angajați' },
  component: Outlet,
});
