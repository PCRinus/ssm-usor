import { Link, Outlet } from '@tanstack/react-router';

import { SectionNav } from '@/components/section-nav';

import { testBankSections } from './test-bank-sections';

export function TestBankLayout() {
  return (
    <div data-testid="test-bank" className="grid gap-5">
      <div className="max-w-2xl">
        <h1 className="text-xl font-semibold tracking-tight">Banca de întrebări</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Întrebările testelor de verificare a cunoștințelor. Angajatul susține testul în portal,
          zece întrebări extrase la întâmplare, iar testul tipărit din documentație le cuprinde pe
          toate cele active.
        </p>
      </div>
      <SectionNav label="Secțiunile băncii de întrebări">
        {testBankSections.map(({ to, label, icon: Icon }) => (
          <li key={to} className="shrink-0">
            <Link
              to={to}
              resetScroll={false}
              data-testid="test-bank-section"
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
