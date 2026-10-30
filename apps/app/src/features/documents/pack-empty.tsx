import type { DocumentSet } from '@ssm-usor/contracts';
import { cn } from '@ssm-usor/ui/lib/utils';
import { ChevronDown, FileText } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';

import { documentSetCopy } from './document-sets';
import { SectionNumber } from './pack-contents';
import {
  archivedHint,
  contentsLabel,
  documentCountLabel,
  emptySectionCaption,
  packTotalLabel,
  totalOf,
} from './pack-labels';
import type { Pack } from './pack-status';

function EmptyPanel({
  set,
  readOnly,
  action,
  wide,
}: {
  set: DocumentSet;
  readOnly: boolean;
  action: ReactNode;
  wide: boolean;
}) {
  const copy = documentSetCopy[set];
  return (
    <div
      data-testid="pack-empty-panel"
      className={cn(
        'grid rounded-xl bg-success',
        wide ? 'justify-items-start gap-4 p-8' : 'gap-3.5 p-5'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex items-center justify-center bg-brand-lime',
          wide ? 'size-13 rounded-xl' : 'size-12 rounded-[11px]'
        )}
      >
        <FileText className={wide ? 'size-6' : 'size-5.5'} />
      </span>
      <div className="grid max-w-[62ch] gap-1.5">
        <h3
          className={cn('leading-snug font-semibold tracking-tight', wide ? 'text-xl' : 'text-lg')}
        >
          Documentația {copy.name} nu este generată încă
        </h3>
        <p data-testid="documents-hint" className="text-success-foreground">
          {readOnly
            ? archivedHint
            : wide
              ? `${copy.emptyHint} Cuprinsul din stânga arată ce va conține.`
              : copy.emptyHint}
        </p>
      </div>
      {!readOnly && action}
    </div>
  );
}

function Outline({ pack, wide, id }: { pack: Pack; wide: boolean; id?: string }) {
  return (
    <ol
      id={id}
      aria-label={contentsLabel}
      data-testid="pack-empty-outline"
      className={cn(wide && 'grid content-start gap-0.5 border-r bg-background/50 p-3')}
    >
      {pack.sections.map((section) => (
        <li
          key={section.id}
          data-testid="pack-empty-entry"
          className={cn('flex items-start gap-3', wide ? 'p-2.5' : 'border-t px-4 py-3')}
        >
          <SectionNumber
            number={section.number}
            size="sm"
            className="border border-dashed border-ring/60 text-muted-foreground"
          />
          <span className={cn('grid min-w-0 flex-1', wide ? 'gap-1.5' : 'gap-0.5')}>
            <span className={cn('leading-snug', wide && 'font-medium')}>{section.title}</span>
            {wide && (
              <span
                aria-hidden="true"
                className="h-1 rounded-full bg-[repeating-linear-gradient(90deg,var(--border)_0_10px,transparent_10px_14px)]"
              />
            )}
            <span data-testid="pack-section-caption" className="text-xs text-muted-foreground">
              {wide ? emptySectionCaption(section) : documentCountLabel(totalOf(section.counts))}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function PackEmpty({
  set,
  pack,
  readOnly,
  layout,
  action,
}: {
  set: DocumentSet;
  pack: Pack;
  readOnly: boolean;
  layout: 'wide' | 'narrow';
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const outlineId = useId();

  if (layout === 'wide') {
    return (
      <div data-testid="pack-empty" className="grid grid-cols-[19rem_minmax(0,1fr)] border-t">
        <Outline pack={pack} wide />
        <div className="px-7 py-6">
          <EmptyPanel set={set} readOnly={readOnly} action={action} wide />
        </div>
      </div>
    );
  }
  return (
    <div data-testid="pack-empty">
      <div className="p-4">
        <EmptyPanel set={set} readOnly={readOnly} action={action} wide={false} />
      </div>
      {pack.sections.length > 0 && (
        <>
          <button
            type="button"
            data-testid="pack-empty-outline-toggle"
            aria-expanded={open}
            aria-controls={outlineId}
            onClick={() => setOpen(!open)}
            className="flex w-full items-center justify-between gap-3 border-t px-4 py-3.5 text-left font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
          >
            <span className="grid gap-0.5">
              <span>Ce va cuprinde documentația</span>
              <span className="text-xs font-normal text-muted-foreground">
                {packTotalLabel(pack)}
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')}
            />
          </button>
          {open && <Outline pack={pack} wide={false} id={outlineId} />}
        </>
      )}
    </div>
  );
}
