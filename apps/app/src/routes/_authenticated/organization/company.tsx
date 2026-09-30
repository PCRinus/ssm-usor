import { createFileRoute } from '@tanstack/react-router';

import { useMe } from '@/account/use-me';
import { focusSearch, organizationCompanyFocus } from '@/missing-data/focus';
import { CompanyDetailsCard } from '@/organization/company-details-card';

export const Route = createFileRoute('/_authenticated/organization/company')({
  staticData: { title: 'Date firmă' },
  validateSearch: focusSearch(organizationCompanyFocus),
  component: OrganizationCompanyPage,
});

export function OrganizationCompanyPage() {
  const me = useMe();
  const { focus } = Route.useSearch();
  // The layout renders this only once the account and its membership are loaded.
  if (!me.data?.membership) return null;

  return (
    <CompanyDetailsCard
      userId={me.data.user.id}
      canEdit={me.data.membership.role === 'owner'}
      focus={focus}
    />
  );
}
