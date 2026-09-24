import { createFileRoute, Outlet } from '@tanstack/react-router';

// The posts a client employs people in, as occupational safety sees them (ADR 006).
export const Route = createFileRoute('/_authenticated/clients/$clientId/job-positions')({
  staticData: { title: 'Posturi de lucru' },
  component: Outlet,
});
