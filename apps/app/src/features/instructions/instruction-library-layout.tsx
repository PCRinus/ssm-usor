import { Link, Outlet } from '@tanstack/react-router';

import { SectionNav } from '@/components/section-nav';

import { instructionSections } from './instruction-sections';

export function InstructionLibraryLayout() {
  return (
    <div data-testid="instruction-library" className="grid gap-5">
      <div className="max-w-2xl">
        <h1 className="text-xl font-semibold tracking-tight">Instrucțiuni proprii</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Câte o instrucțiune pentru fiecare activitate, echipament de muncă sau categorie de
          echipament de protecție. O aplici la posturile unui client și se tipărește ca anexă a
          instrucțiunilor lui proprii.
        </p>
      </div>
      <SectionNav label="Secțiunile instrucțiunilor proprii">
        {instructionSections.map(({ to, label, icon: Icon }) => (
          <li key={to} className="shrink-0">
            <Link
              to={to}
              resetScroll={false}
              data-testid="instruction-section"
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
