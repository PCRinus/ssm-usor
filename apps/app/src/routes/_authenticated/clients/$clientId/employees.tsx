import { createFileRoute, Outlet } from '@tanstack/react-router';

// Layout for a client's employees section; it carries the breadcrumb title for nested pages.
export const Route = createFileRoute('/_authenticated/clients/$clientId/employees')({
  staticData: { title: 'Angajați' },
  component: Outlet,
});
