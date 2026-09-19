import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/clients/$clientId/employees')({
  staticData: { title: 'Angajați' },
  component: Outlet,
});
