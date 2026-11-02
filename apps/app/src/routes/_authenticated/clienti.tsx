import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/clienti')({
  staticData: { title: 'Clienți' },
  component: Outlet,
});
