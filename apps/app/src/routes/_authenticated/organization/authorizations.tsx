import { createFileRoute } from '@tanstack/react-router';

import { useMe } from '@/features/account/use-me';
import { authorizationsFocus, focusSearch } from '@/features/missing-data/focus';
import { AuthorizationsCard } from '@/features/organization/authorizations-card';

export const Route = createFileRoute('/_authenticated/organization/authorizations')({
  staticData: { title: 'Abilitări' },
  validateSearch: focusSearch(authorizationsFocus),
  component: OrganizationAuthorizationsPage,
});

function OrganizationAuthorizationsPage() {
  const me = useMe();
  const { focus } = Route.useSearch();
  // The layout renders this only once the account and its membership are loaded.
  if (!me.data?.membership) return null;

  return (
    <AuthorizationsCard
      userId={me.data.user.id}
      canEdit={me.data.membership.role === 'owner'}
      focus={focus}
    />
  );
}
