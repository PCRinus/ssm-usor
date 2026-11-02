import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/clienti-potentiali')({
  staticData: { title: 'Clienți potențiali' },
  component: Outlet,
});
