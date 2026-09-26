import { createFileRoute, Outlet } from '@tanstack/react-router';

// The organization's instruction library (ADR 012): the modules the own instructions annex.
export const Route = createFileRoute('/_authenticated/instructions')({
  staticData: { title: 'Instrucțiuni' },
  component: Outlet,
});
