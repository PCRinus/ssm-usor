import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/tests')({
  staticData: { title: 'Teste' },
  component: Outlet,
});
