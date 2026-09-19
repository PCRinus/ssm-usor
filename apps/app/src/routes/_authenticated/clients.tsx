import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/clients')({
  staticData: { title: 'Clienți' },
  component: Outlet,
});
