import { Button } from '@ssm-usor/ui/components/button';
import { Outlet, useMatchRoute, useNavigate } from '@tanstack/react-router';
import { PenLine } from 'lucide-react';
import { useMemo, useState } from 'react';

import { openedHere } from '@/app/opener';
import { HelpLink } from '@/components/help-link';
import { SectionNav, SectionNavLink } from '@/components/section-nav';
import { useAuth } from '@/features/auth/auth-context';

import { instructionSections } from './instruction-sections';
import { InstructionStartContext } from './instruction-start-context';
import { InstructionStartDialog } from './instruction-start-dialog';

export function InstructionLibraryLayout() {
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const { session } = useAuth();
  const [starting, setStarting] = useState(false);
  const [tabEmpty, setTabEmpty] = useState(false);
  const domain = matchRoute({ to: '/instructiuni/su' }) ? 'su' : 'ssm';
  const start = useMemo(() => ({ start: () => setStarting(true), setTabEmpty }), []);

  return (
    <div data-testid="instruction-library" className="grid gap-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <h1 className="text-3xl font-semibold tracking-tight">Instrucțiuni proprii</h1>
          <HelpLink topic="instructiuni.biblioteca" label="Ajutor: Instrucțiuni proprii" />
        </div>
        {!tabEmpty && (
          <Button
            className="h-11 w-full sm:h-9 sm:w-auto"
            data-testid="instruction-write"
            onClick={() => setStarting(true)}
          >
            <PenLine aria-hidden="true" />
            Scrie o instrucțiune
          </Button>
        )}
      </div>
      <div className="grid gap-5">
        <SectionNav label="Secțiunile instrucțiunilor proprii">
          {instructionSections.map(({ to, label, icon }) => (
            <SectionNavLink key={to} to={to} data-testid="instruction-tab" icon={icon}>
              {label}
            </SectionNavLink>
          ))}
        </SectionNav>
        <InstructionStartContext value={start}>
          <Outlet />
        </InstructionStartContext>
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
            state: openedHere,
          });
        }}
      />
    </div>
  );
}
