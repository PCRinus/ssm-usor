import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/leads')({
  staticData: { title: 'Clienți potențiali' },
  component: Outlet,
});
