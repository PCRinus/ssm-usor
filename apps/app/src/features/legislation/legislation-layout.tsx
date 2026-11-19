import { Outlet, useMatches } from '@tanstack/react-router';

import { HelpLink } from '@/components/help-link';
import { phoneBleed } from '@/components/page-spacing';
import { SectionNav, SectionNavLink } from '@/components/section-nav';
import { TabSheet } from '@/components/tab-sheet';

import { LastCheck } from './last-check';
import { legislationSections } from './legislation-sections';
import { useBehindSummary } from './use-behind-summary';

export function LegislationLayout() {
  const counts = useBehindSummary().data?.counts;
  const flushSheet = useMatches({
    select: (matches) => matches.some((match) => match.staticData.flushSheet),
  });

  return (
    <div data-testid="legislation-page">
      <div className="mb-5 grid gap-2">
        <div className="flex items-center gap-1.5">
          <h1 className="text-3xl font-semibold tracking-tight">Legislație</h1>
          <HelpLink topic="legislatie.pagina" label="Ajutor: Legislație" />
        </div>
        <LastCheck />
      </div>
      <SectionNav label="Secțiunile paginii Legislație" variant="folder" className={phoneBleed}>
        {legislationSections.map((section) => (
          <SectionNavLink
            key={section.to}
            to={section.to}
            data-testid="legislation-section"
            icon={section.icon}
            count={'set' in section ? counts?.[section.set] : undefined}
            countUnit="documente de actualizat"
          >
            {section.label}
          </SectionNavLink>
        ))}
      </SectionNav>
      <TabSheet flush={flushSheet}>
        <Outlet />
      </TabSheet>
    </div>
  );
}
