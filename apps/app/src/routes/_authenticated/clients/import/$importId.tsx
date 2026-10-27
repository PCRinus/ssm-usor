import { createFileRoute, Outlet } from '@tanstack/react-router';
import { z } from 'zod';

export const Route = createFileRoute('/_authenticated/clients/import/$importId')({
  params: { parse: (params) => ({ importId: z.uuid().parse(params.importId) }) },
  staticData: { title: 'Import din documente' },
  component: Outlet,
});
