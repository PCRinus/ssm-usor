import { createFileRoute, Outlet } from '@tanstack/react-router';

// Layout for the clients section; it carries the breadcrumb title for nested pages.
export const Route = createFileRoute('/_authenticated/clients')({
  staticData: { title: 'Clienți' },
  component: Outlet,
});
