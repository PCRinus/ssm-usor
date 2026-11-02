import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/teste')({
  staticData: { title: 'Teste' },
  component: Outlet,
});
