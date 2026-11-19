import { Outlet } from '@tanstack/react-router';

import { HelpLink } from '@/components/help-link';
import { phoneBleed } from '@/components/page-spacing';
import { SectionNav, SectionNavLink } from '@/components/section-nav';
import { TabSheet } from '@/components/tab-sheet';

import { testBankSections } from './test-bank-sections';
import { sittingRules } from './test-format';
import { useTestBank } from './use-test-bank';

export function TestBankLayout() {
  const bank = useTestBank();
  return (
    <div data-testid="test-bank">
      <div className="mb-5">
        <div className="flex items-center gap-1.5">
          <h1 className="text-3xl font-semibold tracking-tight">Teste</h1>
          <HelpLink topic="teste.pagina" label="Ajutor: Teste" />
        </div>
        <p data-testid="test-bank-rules" className="mt-1 min-h-5 text-sm text-muted-foreground">
          {bank.data && sittingRules(bank.data)}
        </p>
      </div>
      <SectionNav label="Testele" variant="folder" className={phoneBleed}>
        {testBankSections.map(({ to, label, icon }) => (
          <SectionNavLink key={to} to={to} data-testid="test-bank-section" icon={icon}>
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
