import { sortOrderSchema } from '@ssm-usor/contracts';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';

import { useAuth } from '@/features/auth/auth-context';
import { defaultWatchedActSort, watchedActSortKeys } from '@/features/legislation/watched-act-sort';
import { WatchedActs } from '@/features/legislation/watched-acts';

const searchSchema = z.object({
  sort: z.enum(watchedActSortKeys).optional().catch(undefined),
  order: sortOrderSchema.optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/legislatie/acte')({
  staticData: { title: 'Acte urmărite' },
  validateSearch: searchSchema,
  component: WatchedActsRoute,
});

function WatchedActsRoute() {
  const { session } = useAuth();
  const { sort = defaultWatchedActSort.sort, order = defaultWatchedActSort.order } =
    Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <WatchedActs
      userId={session?.user.id ?? ''}
      sort={{ sort, order }}
      onSortChange={(next) =>
        void navigate({
          replace: true,
          search: {
            sort: next.sort === defaultWatchedActSort.sort ? undefined : next.sort,
            order: next.order === defaultWatchedActSort.order ? undefined : next.order,
          },
        })
      }
    />
  );
}
