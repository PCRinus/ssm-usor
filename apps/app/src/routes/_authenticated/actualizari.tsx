import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/actualizari')({
  staticData: { title: 'Actualizări' },
  component: Outlet,
});
