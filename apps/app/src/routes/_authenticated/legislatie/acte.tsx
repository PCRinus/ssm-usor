import { createFileRoute } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';
import { watchedActListSearch } from '@/features/legislation/watched-act-list';
import { WatchedActs } from '@/features/legislation/watched-acts';

export const Route = createFileRoute('/_authenticated/legislatie/acte')({
  staticData: { title: 'Acte urmărite' },
  validateSearch: watchedActListSearch,
  component: WatchedActsRoute,
});

function WatchedActsRoute() {
  const { session } = useAuth();
  return <WatchedActs userId={session?.user.id ?? ''} />;
}
