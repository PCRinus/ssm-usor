import { createFileRoute, notFound } from '@tanstack/react-router';

import { ReleaseError, ReleaseNotFound, ReleasePage } from '@/features/updates/release-page';
import { releasesQueryOptions } from '@/features/updates/use-releases';

// Not `GET /releases/{tag}`: the list holds every release in full and the sidebar and the
// dialog have it already.
export const Route = createFileRoute('/_authenticated/actualizari/$tag')({
  loader: async ({ params, context: { apiRequest, queryClient, auth } }) => {
    const { items } = await queryClient.ensureQueryData(
      releasesQueryOptions(apiRequest, auth.getSnapshot().session?.user.id)
    );
    if (!items.some((release) => release.tag === params.tag)) throw notFound();
    return { crumb: params.tag };
  },
  component: ReleaseRoute,
  notFoundComponent: ReleaseNotFound,
  errorComponent: ReleaseError,
});

function ReleaseRoute() {
  const { tag } = Route.useParams();
  return <ReleasePage key={tag} tag={tag} />;
}
