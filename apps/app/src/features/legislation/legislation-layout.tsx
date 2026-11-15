import { Outlet } from '@tanstack/react-router';

import { HelpLink } from '@/components/help-link';
import { SectionNav, SectionNavLink } from '@/components/section-nav';
import { useAuth } from '@/features/auth/auth-context';

import { LastCheck } from './last-check';
import { legislationSections } from './legislation-sections';

export function LegislationLayout() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  return (
    <div data-testid="legislation-page" className="grid gap-5">
      <div className="grid gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="text-3xl font-semibold tracking-tight">Legislație</h1>
          <HelpLink topic="legislatie.pagina" label="Ajutor: Legislație" />
        </div>
        <LastCheck userId={userId} />
      </div>
      <SectionNav label="Secțiunile paginii Legislație">
        {legislationSections.map(({ to, label, icon }) => (
          <SectionNavLink key={to} to={to} data-testid="legislation-section" icon={icon}>
            {label}
          </SectionNavLink>
        ))}
      </SectionNav>
      <Outlet />
    </div>
  );
}
