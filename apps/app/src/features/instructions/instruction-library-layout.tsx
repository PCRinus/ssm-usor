import { Button } from '@ssm-usor/ui/components/button';
import { Link, Outlet, useMatchRoute, useNavigate } from '@tanstack/react-router';
import { PenLine } from 'lucide-react';
import { useState } from 'react';

import { HelpLink } from '@/components/help-link';
import { SectionNav } from '@/components/section-nav';
import { useAuth } from '@/features/auth/auth-context';

import { instructionSections } from './instruction-sections';
import { InstructionStartDialog } from './instruction-start-dialog';

export function InstructionLibraryLayout() {
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const { session } = useAuth();
  const [starting, setStarting] = useState(false);
  const domain = matchRoute({ to: '/instructiuni/su' }) ? 'su' : 'ssm';

  return (
    <div data-testid="instruction-library" className="grid gap-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <h1 className="text-3xl font-semibold tracking-tight">Instrucțiuni proprii</h1>
          <HelpLink topic="instructiuni.biblioteca" label="Ajutor: Instrucțiuni proprii" />
        </div>
        <Button
          className="w-full sm:w-auto"
          data-testid="instruction-write"
          onClick={() => setStarting(true)}
        >
          <PenLine aria-hidden="true" />
          Scrie o instrucțiune
        </Button>
      </div>
      <div className="grid gap-5">
        <SectionNav label="Secțiunile instrucțiunilor proprii">
          {instructionSections.map(({ to, label, icon: Icon }) => (
            <li key={to} className="shrink-0">
              <Link
                to={to}
                resetScroll={false}
                data-testid="instruction-tab"
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
      <InstructionStartDialog
        open={starting}
        initial={{ domain }}
        userId={session?.user.id ?? ''}
        onClose={() => setStarting(false)}
        onSubmit={(values) => {
          setStarting(false);
          void navigate({
            to: '/instructiuni/nou',
            search: values,
            state: { openedFromList: true },
          });
        }}
      />
    </div>
  );
}
