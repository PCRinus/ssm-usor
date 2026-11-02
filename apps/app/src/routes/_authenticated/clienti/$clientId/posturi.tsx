import { createFileRoute, Outlet } from '@tanstack/react-router';

// The posts a client employs people in, as occupational safety sees them (ADR 006).
export const Route = createFileRoute('/_authenticated/clienti/$clientId/posturi')({
  staticData: { title: 'Posturi de lucru' },
  component: Outlet,
});
