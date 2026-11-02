import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/riscuri')({
  staticData: { title: 'Riscuri' },
  component: Outlet,
});
