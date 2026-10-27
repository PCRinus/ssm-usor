import { Link } from '@tanstack/react-router';
import { PenLine, ScanText } from 'lucide-react';
import type { ReactNode } from 'react';

const wayClass =
  'grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3.5 gap-y-1 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

function WayContent({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <>
      <span
        className="row-span-2 grid size-10 place-items-center rounded-lg bg-secondary"
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="text-[15px] font-semibold">{title}</span>
      <span className="text-sm leading-snug text-muted-foreground">{text}</span>
    </>
  );
}

export function StartWays({ onImport }: { onImport: () => void }) {
  return (
    <div
      className="mx-auto mt-6 grid max-w-[38rem] gap-3 sm:grid-cols-2"
      data-testid="clients-start-ways"
    >
      <Link to="/clients/new" className={wayClass} data-testid="clients-start-form">
        <WayContent
          icon={<PenLine className="size-5" />}
          title="Adaugă primul client"
          text="Completezi tu datele firmei, pornind de la CUI."
        />
      </Link>
      <button
        type="button"
        className={wayClass}
        data-testid="clients-start-import"
        onClick={onImport}
      >
        <WayContent
          icon={<ScanText className="size-5" />}
          title="Importă din documente"
          text="Încarci dosarul SSM și PSI pe care îl ai deja, iar noi îți propunem datele."
        />
      </button>
    </div>
  );
}
