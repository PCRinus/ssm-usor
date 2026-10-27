import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/organization/subscription')({
  staticData: { title: 'Abonament' },
});
