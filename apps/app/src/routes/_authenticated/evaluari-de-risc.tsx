import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/evaluari-de-risc')({
  staticData: { title: 'Riscuri' },
  component: Outlet,
});
