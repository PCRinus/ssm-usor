import { Button } from '@ssm-usor/ui/components/button';
import { createFileRoute, Outlet, useMatches } from '@tanstack/react-router';
import { Award, Building2, CreditCard, UsersRound } from 'lucide-react';

import { Notice } from '@/components/notice';
import { SectionNav, SectionNavLink } from '@/components/section-nav';
import { useMe } from '@/features/account/use-me';
import { roleLabels } from '@/features/organization/labels';

export const Route = createFileRoute('/_authenticated/organizatie')({
  staticData: { title: 'Organizație' },
  component: OrganizationLayout,
});

const sections = [
  { to: '/organizatie/echipa', label: 'Echipă', icon: UsersRound },
  { to: '/organizatie/date-firma', label: 'Date firmă', icon: Building2 },
  { to: '/organizatie/abilitari', label: 'Abilitări', icon: Award },
  { to: '/organizatie/abonament', label: 'Abonament', icon: CreditCard },
] as const;

function OrganizationLayout() {
  const me = useMe();
  const fullPage = useMatches({
    select: (matches) => matches.some((match) => match.staticData.fullPage),
  });

  if (me.isPending) {
    return (
      <p role="status" data-testid="organization-loading">
        Se încarcă organizația…
      </p>
    );
  }
  if (me.isError) {
    return (
      <Notice
        variant="destructive"
        action={
          <Button variant="outline" disabled={me.isFetching} onClick={() => void me.refetch()}>
            Încearcă din nou
          </Button>
        }
      >
        Nu am putut încărca organizația.
      </Notice>
    );
  }

  const { membership } = me.data;
  // The shell sends an account without an organization to onboarding before this renders.
  if (!membership) return null;
  if (fullPage) return <Outlet />;

  return (
    <div data-testid="organization-page" className="grid gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{membership.organization.name}</h1>
        <span className="text-sm text-muted-foreground">{roleLabels[membership.role]}</span>
      </div>
      <SectionNav label="Secțiunile organizației">
        {sections.map(({ to, label, icon }) => (
          <SectionNavLink key={to} to={to} data-testid="organization-section" icon={icon}>
            {label}
          </SectionNavLink>
        ))}
      </SectionNav>
      <Outlet />
    </div>
  );
}
