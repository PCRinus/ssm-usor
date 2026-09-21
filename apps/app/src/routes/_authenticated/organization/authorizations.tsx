import { createFileRoute } from '@tanstack/react-router';

import { useMe } from '../../../account/use-me';
import { AuthorizationsCard } from '../../../organization/authorizations-card';

export const Route = createFileRoute('/_authenticated/organization/authorizations')({
  staticData: { title: 'Abilitări' },
  component: OrganizationAuthorizationsPage,
});

export function OrganizationAuthorizationsPage() {
  const me = useMe();
  // The layout renders this only once the account and its membership are loaded.
  if (!me.data?.membership) return null;

  return (
    <AuthorizationsCard userId={me.data.user.id} canEdit={me.data.membership.role === 'owner'} />
  );
}
