import { createFileRoute } from '@tanstack/react-router';

import { UpdatesPage } from '@/features/updates/updates-page';
import { releasesQueryOptions } from '@/features/updates/use-releases';

export const Route = createFileRoute('/_authenticated/actualizari/')({
  loader: async ({ context: { apiRequest, queryClient, auth } }) => {
    await queryClient.ensureQueryData(
      releasesQueryOptions(apiRequest, auth.getSnapshot().session?.user.id)
    );
  },
  component: UpdatesPage,
});
