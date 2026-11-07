import { Outlet } from '@tanstack/react-router';

import { SectionNav, SectionNavLink } from '@/components/section-nav';

import { testBankSections } from './test-bank-sections';

export function TestBankLayout() {
  return (
    <div data-testid="test-bank" className="grid gap-5">
      <div className="max-w-2xl">
        <h1 className="text-xl font-semibold tracking-tight">Banca de întrebări</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Întrebările testelor de verificare a cunoștințelor. Lucrătorul susține testul în portal,
          zece întrebări extrase la întâmplare, iar testul tipărit din documentație le cuprinde pe
          toate cele active. Întrebările predefinite nu se modifică: ascunde-o pe cea care nu ți se
          potrivește și adaugă una proprie în locul ei.
        </p>
      </div>
      <SectionNav label="Secțiunile băncii de întrebări">
        {testBankSections.map(({ to, label, icon }) => (
          <SectionNavLink key={to} to={to} data-testid="test-bank-section" icon={icon}>
            {label}
          </SectionNavLink>
        ))}
      </SectionNav>
      <Outlet />
    </div>
  );
}
