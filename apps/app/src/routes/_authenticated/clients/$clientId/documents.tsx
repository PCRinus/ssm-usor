import { createFileRoute, Outlet } from '@tanstack/react-router';

// Layout for a client's documents section; it carries the breadcrumb title for nested pages.
export const Route = createFileRoute('/_authenticated/clients/$clientId/documents')({
  staticData: { title: 'Documente' },
  component: Outlet,
});
