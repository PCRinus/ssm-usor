import { createFileRoute, Outlet } from '@tanstack/react-router';

// The service contract is an owner's, before and after promotion (ADR 007).
export const Route = createFileRoute('/_authenticated/clients/$clientId/contract')({
  staticData: { title: 'Contract' },
  component: Outlet,
});
