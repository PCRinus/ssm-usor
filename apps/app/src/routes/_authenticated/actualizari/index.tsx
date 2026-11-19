import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { UpdatesPage } from '@/features/updates/updates-page';
import { releasesQueryOptions } from '@/features/updates/use-releases';

const searchSchema = z.object({
  luna: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute('/_authenticated/actualizari/')({
  validateSearch: searchSchema,
  loader: async ({ context: { apiRequest, queryClient, auth } }) => {
    await queryClient.ensureQueryData(
      releasesQueryOptions(apiRequest, auth.getSnapshot().session?.user.id)
    );
  },
  component: UpdatesRoute,
});

function UpdatesRoute() {
  const { luna } = Route.useSearch();
  return <UpdatesPage month={luna} />;
}
