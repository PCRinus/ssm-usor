import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { Check, ChevronDown, LoaderCircle, RefreshCw } from 'lucide-react';

import { openedHere } from '@/app/opener';
import { CellNote } from '@/components/data-table/cell-note';

import { detailsIdOf, useBehindTable } from './behind-table-context';
import { countOf, kindLabels } from './legislation-labels';
import {
  behindInstructions,
  behindTemplate,
  type BehindType,
  instructionsSummary,
  regenerable,
} from './regeneration-copy';

const textLink =
  'w-fit font-medium underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground';

function versionLine(type: BehindType) {
  const parts = [];
  if (behindTemplate(type)) {
    parts.push(`Versiunea ${type.newestVersion.version}`, kindLabels[type.newestVersion.kind]);
  }
  if (behindInstructions(type)) parts.push('Instrucțiuni schimbate');
  return parts.join(' · ');
}

export function DocumentCell({ type }: { type: BehindType }) {
  return (
    <>
      <span data-testid="behind-title" className="font-medium">
        {type.title}
      </span>
      <CellNote data-testid="behind-version">{versionLine(type)}</CellNote>
    </>
  );
}

export function ChangedCell({ type }: { type: BehindType }) {
  const template = behindTemplate(type);
  return (
    <div className="grid max-w-prose gap-1">
      <p data-testid="behind-note" className="leading-relaxed">
        {template
          ? (type.newestVersion.note ?? 'Versiunea nu spune ce s-a schimbat.')
          : instructionsSummary(type)}
      </p>
      {template &&
        type.legalChanges.map((change) => (
          <Link
            key={change.id}
            to="/legislatie/modificari/$changeId"
            params={{ changeId: change.id }}
            state={openedHere}
            data-testid="behind-legal-change"
            className={textLink}
          >
            Vezi modificarea {change.actName}
          </Link>
        ))}
    </div>
  );
}

export function ClientsCell({ type }: { type: BehindType }) {
  const { isOpen, onToggle } = useBehindTable();
  const open = isOpen(type);
  return (
    <Button
      variant="ghost"
      size="sm"
      data-testid="behind-clients-toggle"
      aria-label={`${countOf(type.clients.length, 'client', 'clienți')}: ${type.title}`}
      aria-expanded={open}
      aria-controls={open ? detailsIdOf(type) : undefined}
      className="-my-1 -ml-2 px-2 tabular-nums"
      onClick={() => onToggle(type)}
    >
      {countOf(type.clients.length, 'client', 'clienți')}
      <ChevronDown
        aria-hidden="true"
        className={cn('transition-transform', open && 'rotate-180')}
      />
    </Button>
  );
}

export function ActionCell({ type }: { type: BehindType }) {
  const { stateOf, onRegenerate, busy } = useBehindTable();
  const state = stateOf(type);
  if (state === 'done') {
    return (
      <span data-testid="behind-state" className="inline-flex items-center gap-1.5">
        <Check className="size-4 text-success-foreground" aria-hidden="true" />
        Gata
      </span>
    );
  }
  if (state === 'running') {
    return (
      <span
        data-testid="behind-state"
        className="inline-flex items-center gap-1.5 whitespace-nowrap"
      >
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        Se regenerează
      </span>
    );
  }
  if (state === 'waiting') {
    return (
      <span data-testid="behind-state" className="whitespace-nowrap text-muted-foreground">
        În așteptare
      </span>
    );
  }
  if (regenerable(type).length === 0) return null;
  return (
    <Button
      variant="secondary"
      size="sm"
      data-testid="behind-regenerate"
      aria-label={`Regenerează ${type.title}`}
      disabled={busy}
      onClick={() => onRegenerate(type)}
    >
      <RefreshCw aria-hidden="true" />
      Regenerează
    </Button>
  );
}
