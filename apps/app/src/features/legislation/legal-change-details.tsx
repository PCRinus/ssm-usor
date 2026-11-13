import { legalAmendmentOperations } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { ChevronDown } from 'lucide-react';
import { Fragment, useId, useMemo, useState } from 'react';

import type {
  LegalChangeListResponseItemsItem,
  LegalChangeListResponseItemsItemPassagesItem,
} from '@/api/generated/api';

import { type DiffSegment, wordDiff } from './law-diff';
import { listOf, operationLabels, unitLabel, withSuperscripts } from './legislation-labels';

type Change = LegalChangeListResponseItemsItem;
type Passage = LegalChangeListResponseItemsItemPassagesItem;

const unitsShown = 8;
const longTextLength = 600;

export function AmendedUnits({ change }: { change: Change }) {
  const groups = legalAmendmentOperations.flatMap((operation) => {
    const units = change.amendedUnits.filter((unit) => unit.operation === operation);
    return units.length > 0 ? [{ operation, units: [...new Set(units.map((u) => u.unit))] }] : [];
  });
  if (groups.length === 0) return null;
  return (
    <dl data-testid="legal-change-units" className="grid gap-0.5 text-sm">
      {groups.map(({ operation, units }) => {
        const shown = units.slice(0, unitsShown).map(unitLabel);
        const more = units.length - shown.length;
        return (
          <div key={operation} className="flex flex-wrap gap-x-1.5">
            <dt className="text-muted-foreground">{operationLabels[operation]}:</dt>
            <dd>{more > 0 ? `${shown.join(', ')} și încă ${more}` : listOf(shown)}</dd>
          </div>
        );
      })}
    </dl>
  );
}

type PassageGroup = { key: string; first: Passage; places: string[] };

function groupPassages(passages: Passage[]): PassageGroup[] {
  const groups = new Map<string, PassageGroup>();
  for (const passage of passages) {
    const key = JSON.stringify([passage.unit, passage.status, passage.oldText, passage.newText]);
    const place = placeOf(passage);
    const group = groups.get(key);
    if (!group) groups.set(key, { key, first: passage, places: [place] });
    else if (!group.places.includes(place)) group.places.push(place);
  }
  return [...groups.values()];
}

function placeOf(passage: Passage) {
  const document = passage.document?.title;
  if (passage.citationForm === 'reference') {
    return document ? `Trimitere în ${document}` : 'Trimitere într-un document';
  }
  const where = document ? `Citat în ${document}` : 'Citat într-un document';
  return passage.locator ? `${where}, ${unitLabel(passage.locator)}` : where;
}

const statusNotes: Partial<Record<Passage['status'], string>> = {
  added: 'Prevedere nouă în lege.',
  repealed: 'Prevedere abrogată.',
  missing: 'Prevederea nu apare în textul legii.',
};

const hasText = (passage: Passage) => passage.oldText !== null || passage.newText !== null;

export function ChangedPassages({ passages }: { passages: Passage[] }) {
  if (passages.length === 0) return null;
  return (
    <div data-testid="legal-change-passages" className="grid gap-3 pt-1">
      {passages.some(hasText) && (
        <p data-testid="law-diff-legend" className="text-xs text-muted-foreground">
          În textul legii, cuvintele tăiate au fost eliminate, iar cele evidențiate au fost
          adăugate.
        </p>
      )}
      <ul className="grid gap-3">
        {groupPassages(passages).map((group) => (
          <PassageView key={group.key} group={group} />
        ))}
      </ul>
    </div>
  );
}

function PassageView({ group }: { group: PassageGroup }) {
  const { first } = group;
  const long = Math.max(first.oldText?.length ?? 0, first.newText?.length ?? 0) > longTextLength;
  const [open, setOpen] = useState(!long);
  const textId = useId();

  return (
    <li data-testid="legal-change-passage" className="grid gap-1.5 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium">{withSuperscripts(first.unit)}</p>
        {hasText(first) && long && (
          <Button
            variant="ghost"
            size="sm"
            data-testid="legal-change-passage-toggle"
            aria-expanded={open}
            aria-controls={textId}
            className="-mx-2 -my-1 px-2"
            onClick={() => setOpen((current) => !current)}
          >
            Ce s-a schimbat
            <ChevronDown
              aria-hidden="true"
              className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
            />
          </Button>
        )}
      </div>
      <ul className="grid gap-0.5 text-sm text-muted-foreground">
        {group.places.map((place) => (
          <li key={place} data-testid="legal-change-passage-place">
            {place}
          </li>
        ))}
      </ul>
      {statusNotes[first.status] && <p className="text-sm">{statusNotes[first.status]}</p>}
      {hasText(first) && (
        <div id={textId} hidden={!open}>
          {open && <LawDiff before={first.oldText ?? ''} after={first.newText ?? ''} />}
        </div>
      )}
    </li>
  );
}

const edges = /^(\s*)([\s\S]*?)(\s*)$/;

// A margin, not a space, keeps a replaced word off its replacement: the law's text gains no
// character, and a change inside one word or number, "(2)" to "(3)", stays tight.
function standsApart(segments: DiffSegment[], index: number) {
  const deleted = segments[index - 1];
  const inserted = segments[index]!;
  if (deleted?.kind !== 'deleted' || /\s$/.test(deleted.text) || /^\s/.test(inserted.text)) {
    return false;
  }
  const before = segments[index - 2]?.text;
  const after = segments[index + 1]?.text;
  return (
    (before === undefined || /\s$/.test(before) || /^\s/.test(deleted.text)) &&
    (after === undefined || /^[\s.,;:!?]/.test(after))
  );
}

export function LawDiff({ before, after }: { before: string; after: string }) {
  const segments = useMemo(
    () => wordDiff(withSuperscripts(before), withSuperscripts(after)),
    [before, after]
  );
  return (
    <p data-testid="law-diff" className="max-w-prose text-sm leading-relaxed whitespace-pre-line">
      {segments.map((segment, index) => {
        if (segment.kind === 'same') return <span key={index}>{segment.text}</span>;
        const [, opening, words, closing] = edges.exec(segment.text)!;
        if (!words)
          return segment.kind === 'inserted' ? <span key={index}>{segment.text}</span> : null;
        return (
          <Fragment key={index}>
            {opening}
            {segment.kind === 'deleted' ? (
              <del className="rounded-xs bg-destructive-border px-0.5 text-inherit line-through">
                <span className="sr-only">eliminat: </span>
                {words}
              </del>
            ) : (
              <ins
                className={cn(
                  'rounded-xs bg-success-border px-0.5 font-semibold text-inherit no-underline',
                  standsApart(segments, index) && 'ml-1'
                )}
              >
                <span className="sr-only">adăugat: </span>
                {words}
              </ins>
            )}
            {closing}
          </Fragment>
        );
      })}
    </p>
  );
}
