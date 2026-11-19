import { Badge } from '@ssm-usor/ui/components/badge';
import { createFileRoute, Outlet, useMatches } from '@tanstack/react-router';
import { Award, Building2, CreditCard, UsersRound } from 'lucide-react';

import { HelpLink } from '@/components/help-link';
import { LoadFailed } from '@/components/load-failed';
import { phoneBleed } from '@/components/page-spacing';
import { SectionNav, SectionNavLink } from '@/components/section-nav';
import { TabSheet } from '@/components/tab-sheet';
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
  const flushSheet = useMatches({
    select: (matches) => matches.some((match) => match.staticData.flushSheet),
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
      <LoadFailed error={me.error} busy={me.isFetching} onRetry={() => void me.refetch()}>
        Nu am putut încărca organizația.
      </LoadFailed>
    );
  }

  const { membership } = me.data;
  // The shell sends an account without an organization to onboarding before this renders.
  if (!membership) return null;
  if (fullPage) return <Outlet />;

  return (
    <div data-testid="organization-page">
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{membership.organization.name}</h1>
        <div className="flex items-center gap-1.5">
          <Badge
            variant="secondary"
            data-testid="organization-role"
            className="px-2.5 py-1 text-[13px]"
          >
            Rolul tău: {roleLabels[membership.role]}
          </Badge>
          <HelpLink topic="organizatie.roluri" label="Ajutor: Rolurile" />
        </div>
      </div>
      <SectionNav label="Secțiunile organizației" variant="folder" className={phoneBleed}>
        {sections.map(({ to, label, icon }) => (
          <SectionNavLink key={to} to={to} data-testid="organization-section" icon={icon}>
            {label}
          </SectionNavLink>
        ))}
      </SectionNav>
      <TabSheet flush={flushSheet}>
        <Outlet />
      </TabSheet>
    </div>
  );
}
