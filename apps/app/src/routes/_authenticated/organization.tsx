import { Button } from '@ssm-usor/ui/components/button';
import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { Award, Building2, UsersRound } from 'lucide-react';

import { useMe } from '../../account/use-me';
import { Notice } from '../../components/notice';
import { SectionNav } from '../../components/section-nav';
import { roleLabels } from '../../organization/labels';

export const Route = createFileRoute('/_authenticated/organization')({
  staticData: { title: 'Organizație' },
  component: OrganizationLayout,
});

const sections = [
  { to: '/organization/team', label: 'Echipă', icon: UsersRound },
  { to: '/organization/company', label: 'Date firmă', icon: Building2 },
  { to: '/organization/authorizations', label: 'Abilitări', icon: Award },
] as const;

export function OrganizationLayout() {
  const me = useMe();

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

  return (
    <div data-testid="organization-page" className="grid gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{membership.organization.name}</h1>
        <span className="text-sm text-muted-foreground">{roleLabels[membership.role]}</span>
      </div>
      <SectionNav label="Secțiunile organizației">
        {sections.map(({ to, label, icon: Icon }) => (
          <li key={to} className="shrink-0">
            <Link
              to={to}
              resetScroll={false}
              data-testid="organization-section"
              className="inline-flex h-10 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[status=active]:border-primary data-[status=active]:text-foreground"
              activeProps={{ 'aria-current': 'page' }}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {label}
            </Link>
          </li>
        ))}
      </SectionNav>
      <Outlet />
    </div>
  );
}
