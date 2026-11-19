import { Button } from '@ssm-usor/ui/components/button';
import { Progress } from '@ssm-usor/ui/components/progress';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { Building2, ChevronRight, FilePen, UsersRound } from 'lucide-react';
import { useId } from 'react';

import { openedHere } from '@/app/opener';
import { Masked } from '@/components/replay';

import { type ImportBand, importBands, type OpenImport, type OpenImports } from '../open-imports';

const bandTitles: Record<ImportBand, string> = {
  review: 'De verificat',
  reading: 'Se citesc',
  stopped: 'S-au oprit',
};

const stateTones: Record<ImportBand, string> = {
  review: 'text-warning-foreground',
  reading: 'text-foreground',
  stopped: 'text-destructive-foreground',
};

const tileIcons = { client: Building2, parts: FilePen, employees: UsersRound } as const;

const rowGrid =
  'grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 px-4 py-4 md:grid-cols-[2.5rem_minmax(0,1.1fr)_minmax(0,1fr)_9.5rem_11rem] md:items-center md:gap-x-5 md:px-5';

const focusRing = 'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

export function OpenImportsList({ groups }: { groups: OpenImports }) {
  const baseId = useId();
  return (
    <div data-testid="imports-open">
      {importBands
        .filter((band) => groups[band].length > 0)
        .map((band) => (
          <section
            key={band}
            data-testid="imports-band"
            data-band={band}
            aria-labelledby={`${baseId}-${band}`}
          >
            <h2
              id={`${baseId}-${band}`}
              className="flex gap-2 border-b bg-muted/50 px-4 py-2.5 text-[13px] font-semibold text-muted-foreground md:px-5"
            >
              {bandTitles[band]}
              <span className="text-foreground tabular-nums">{groups[band].length}</span>
            </h2>
            <ul className="divide-y border-b last:border-b-0">
              {groups[band].map((item) => (
                <li key={item.id} data-testid="imports-row" data-band={band}>
                  {item.action === null ? <ReadingRow item={item} /> : <ActionRow item={item} />}
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

function KindTile({ item }: { item: OpenImport }) {
  const Icon = tileIcons[item.tile];
  return (
    <span
      aria-hidden="true"
      className="grid size-10 place-items-center rounded-lg bg-secondary text-foreground"
    >
      <Icon className="size-5" />
    </span>
  );
}

function NameCell({ item }: { item: OpenImport }) {
  return (
    <span className="grid min-w-0 gap-0.5">
      <span className="font-medium wrap-anywhere">{item.name}</span>
      <span className="text-[13px] text-muted-foreground">{item.detail}</span>
    </span>
  );
}

function StartedCell({ item }: { item: OpenImport }) {
  return (
    <span className="col-start-2 text-[13px] text-muted-foreground md:col-start-auto md:grid md:gap-0.5 md:text-sm">
      <span className="text-foreground tabular-nums">{item.started}</span>
      {item.startedBy && (
        <>
          <span aria-hidden="true" className="md:hidden">
            {' · '}
          </span>
          <span className="md:text-[13px]">
            <span className="sr-only">Pornit de </span>
            <Masked>{item.startedBy}</Masked>
          </span>
        </>
      )}
    </span>
  );
}

function ActionRow({ item }: { item: OpenImport }) {
  return (
    <div className={rowGrid}>
      <KindTile item={item} />
      <NameCell item={item} />
      <span className="col-start-2 grid min-w-0 gap-0.5 md:col-start-auto">
        <span data-testid="imports-row-state" className={cn('font-medium', stateTones[item.band])}>
          {item.state}
        </span>
        {item.stateNote && (
          <span className="text-[13px] text-muted-foreground">{item.stateNote}</span>
        )}
      </span>
      <StartedCell item={item} />
      <span className="col-span-full md:col-span-1 md:justify-self-end">
        <Button
          asChild
          variant="secondary"
          size="sm"
          className="h-11 w-full text-[15px] md:h-8 md:w-auto md:text-sm"
        >
          <Link {...item.link} state={openedHere}>
            {item.action}
          </Link>
        </Button>
      </span>
    </div>
  );
}

function ReadingRow({ item }: { item: OpenImport }) {
  return (
    <Link {...item.link} state={openedHere} className={cn(rowGrid, 'hover:bg-muted/40', focusRing)}>
      <KindTile item={item} />
      <NameCell item={item} />
      <span className="col-start-2 grid min-w-0 gap-1.5 md:col-start-auto">
        <span data-testid="imports-row-state" className="font-medium">
          {item.state}
        </span>
        {item.progress !== null && (
          <Progress
            value={item.progress}
            aria-label={item.stateNote ?? item.state}
            className="h-1.5 max-w-64"
          />
        )}
        {item.stateNote && (
          <span className="text-[13px] text-muted-foreground tabular-nums">{item.stateNote}</span>
        )}
      </span>
      <StartedCell item={item} />
      <ChevronRight
        aria-hidden="true"
        className="hidden size-4 justify-self-end text-muted-foreground md:block"
      />
    </Link>
  );
}
