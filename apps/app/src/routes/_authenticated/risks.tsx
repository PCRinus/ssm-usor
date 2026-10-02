import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/risks')({
  staticData: { title: 'Riscuri' },
  component: Outlet,
});
