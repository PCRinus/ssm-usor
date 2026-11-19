import { Outlet } from '@tanstack/react-router';

import { HelpLink } from '@/components/help-link';
import { phoneBleed } from '@/components/page-spacing';
import { SectionNav, SectionNavLink } from '@/components/section-nav';
import { TabSheet } from '@/components/tab-sheet';

import { instructionSections } from './instruction-sections';

export function InstructionLibraryLayout() {
  return (
    <div data-testid="instruction-library">
      <div className="mb-5 flex items-center gap-1.5">
        <h1 className="text-3xl font-semibold tracking-tight">Instrucțiuni proprii</h1>
        <HelpLink topic="instructiuni.biblioteca" label="Ajutor: Instrucțiuni proprii" />
      </div>
      <SectionNav
        label="Secțiunile instrucțiunilor proprii"
        variant="folder"
        className={phoneBleed}
      >
        {instructionSections.map(({ to, label, icon }) => (
          <SectionNavLink key={to} to={to} data-testid="instruction-tab" icon={icon}>
            {label}
          </SectionNavLink>
        ))}
      </SectionNav>
      <TabSheet flush>
        <Outlet />
      </TabSheet>
    </div>
  );
}
