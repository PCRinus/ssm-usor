import { Button } from '@ssm-usor/ui/components/button';
import { Send } from 'lucide-react';
import type { ReactNode } from 'react';

import { SectionCard } from '@/components/section-card';

export function PortalGettingStarted({
  choosing,
  onInviteAdministrator,
  onInviteWorkers,
}: {
  choosing: boolean;
  onInviteAdministrator: () => void;
  onInviteWorkers: () => void;
}) {
  return (
    <SectionCard
      data-testid="portal-getting-started"
      className="gap-4"
      title="Pornește portalul pentru acest client"
      help="portal.pornire"
      longTitle
      description="Doi pași și îi faci pe amândoi. Începe cu administratorul, ca să poată pregăti portalul la client."
    >
      <ol className="grid">
        <Step
          number={1}
          title="Administratorul clientului"
          action={
            <Button
              data-testid="portal-start-administrator"
              className="w-full sm:w-auto"
              onClick={onInviteAdministrator}
            >
              <Send aria-hidden="true" />
              Invită administratorul
            </Button>
          }
        >
          Vede în portal lucrătorii și fișele lor și contrasemnează actele adiționale.
        </Step>
        <Step
          number={2}
          title="Lucrătorii"
          action={
            <Button
              data-testid="portal-start-workers"
              className="w-full sm:w-auto"
              disabled={choosing}
              onClick={onInviteWorkers}
            >
              <Send aria-hidden="true" />
              Invită lucrătorii
            </Button>
          }
        >
          Își văd instruirile și își semnează rândurile din fișă, de pe telefon. Îi alegi din lista
          de mai jos.
        </Step>
      </ol>
    </SectionCard>
  );
}

function Step({
  number,
  title,
  action,
  children,
}: {
  number: number;
  title: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 border-t border-border/70 py-4 last:pb-0 sm:grid-cols-[1.75rem_minmax(0,1fr)_14rem]">
      <span
        aria-hidden="true"
        className="grid size-7 place-items-center self-start rounded-full bg-secondary text-sm font-semibold tabular-nums sm:self-center"
      >
        {number}
      </span>
      <span className="grid gap-0.5 text-sm">
        <span className="font-medium">
          <span className="sr-only">Pasul {number}: </span>
          {title}
        </span>
        <span className="text-muted-foreground">{children}</span>
      </span>
      <span className="col-span-full sm:col-span-1 sm:grid">{action}</span>
    </li>
  );
}
