import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/oferte')({
  staticData: { title: 'Oferte' },
  component: Outlet,
});
