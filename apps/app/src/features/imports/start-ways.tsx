import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { PenLine, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

import { openedHere } from '@/app/opener';

export const wayClass =
  'grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3.5 gap-y-1 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

export function WayBadge({ children, primary }: { children: ReactNode; primary?: boolean }) {
  return (
    <span
      className={cn(
        'row-span-2 grid size-10 place-items-center rounded-lg',
        primary ? 'bg-primary text-primary-foreground' : 'bg-secondary'
      )}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

function WayContent({
  icon,
  title,
  text,
  primary,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  primary?: boolean;
}) {
  return (
    <>
      <WayBadge primary={primary}>{icon}</WayBadge>
      <span className="text-[15px] font-semibold">{title}</span>
      <span className="text-sm leading-snug text-muted-foreground">{text}</span>
    </>
  );
}

export function StartWays({ onImport }: { onImport: () => void }) {
  return (
    <div
      className="grid w-full max-w-[38rem] gap-3 sm:grid-cols-2"
      data-testid="clients-start-ways"
    >
      <button
        type="button"
        className={`${wayClass} border-primary/40`}
        data-testid="clients-start-import"
        onClick={onImport}
      >
        <WayContent
          icon={<Sparkles className="size-5" />}
          title="Adaugă primul client cu AI"
          text="Încarci dosarul SSM și SU, iar AI-ul citește documentele și îți propune datele."
          primary
        />
      </button>
      <Link
        to="/clienti/nou"
        state={openedHere}
        className={wayClass}
        data-testid="clients-start-form"
      >
        <WayContent
          icon={<PenLine className="size-5" />}
          title="Adaugă manual"
          text="Completezi tu datele firmei, pornind de la CUI."
        />
      </Link>
    </div>
  );
}
