import { createFileRoute } from '@tanstack/react-router';

import { watchedActListSearch } from '@/features/legislation/watched-act-list';
import { WatchedActs } from '@/features/legislation/watched-acts';

export const Route = createFileRoute('/_authenticated/legislatie/acte')({
  staticData: { title: 'Acte urmărite', flushSheet: true },
  validateSearch: watchedActListSearch,
  component: WatchedActsRoute,
});

function WatchedActsRoute() {
  return <WatchedActs />;
}
