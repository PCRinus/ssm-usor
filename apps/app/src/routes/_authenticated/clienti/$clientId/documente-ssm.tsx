import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/clienti/$clientId/documente-ssm')({
  staticData: { title: 'Documente SSM' },
  component: Outlet,
});
