import { legalAmendmentOperations } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { ChevronDown } from 'lucide-react';
import { Fragment, useId, useMemo, useState } from 'react';

import type {
  LegalChangeDetailResponseChangeAmendedUnitsItem as AmendedUnit,
  LegalChangeDetailResponseChangePassagesItem as Passage,
} from '@/api/generated/api';

import { type DiffSegment, wordDiff } from './law-diff';
import { listOf, operationLabels, unitLabel, withSuperscripts } from './legislation-labels';

const unitsShown = 8;
const longTextLength = 600;

export function AmendedUnits({ units }: { units: AmendedUnit[] }) {
  const groups = legalAmendmentOperations.flatMap((operation) => {
    const ofOperation = units.filter((unit) => unit.operation === operation);
    return ofOperation.length > 0
      ? [{ operation, units: [...new Set(ofOperation.map((u) => u.unit))] }]
      : [];
  });
  if (groups.length === 0) return null;
  return (
    <dl data-testid="legal-change-units" className="grid gap-1 text-sm leading-relaxed">
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
    return document ? `trimitere în ${document}` : 'trimitere într-un document';
  }
  const where = document ? `citat în ${document}` : 'citat într-un document';
  return passage.locator && passage.locator !== passage.unit
    ? `${where}, ${unitLabel(passage.locator)}`
    : where;
}

const statusNotes: Partial<Record<Passage['status'], string>> = {
  added: 'Prevedere nouă în lege.',
  repealed: 'Prevedere abrogată.',
  missing: 'Prevederea nu apare în textul legii.',
};

const hasText = (passage: Passage) => passage.oldText !== null || passage.newText !== null;

export function ChangedPassages({ passages }: { passages: Passage[] }) {
  return (
    <ul data-testid="legal-change-passages" className="grid gap-6">
      {groupPassages(passages).map((group) => (
        <PassageView key={group.key} group={group} />
      ))}
    </ul>
  );
}

function PassageView({ group }: { group: PassageGroup }) {
  const { first } = group;
  const long = Math.max(first.oldText?.length ?? 0, first.newText?.length ?? 0) > longTextLength;
  const [open, setOpen] = useState(!long);
  const textId = useId();

  return (
    <li data-testid="legal-change-passage" className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <p className="text-sm leading-relaxed">
          <b data-testid="legal-change-passage-unit" className="font-semibold">
            {unitLabel(first.unit)}
          </b>
          <span data-testid="legal-change-passage-places">, {group.places.join('; ')}</span>
        </p>
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

function LawText({ segments, side }: { segments: DiffSegment[]; side: 'before' | 'after' }) {
  const shown = side === 'before' ? 'deleted' : 'inserted';
  if (!segments.some((segment) => segment.kind === 'same' || segment.kind === shown)) {
    return <p className="text-sm text-muted-foreground">—</p>;
  }
  return (
    <p className="text-sm leading-relaxed whitespace-pre-line">
      {segments.map((segment, index) => {
        if (segment.kind === 'same') return <span key={index}>{segment.text}</span>;
        if (segment.kind !== shown) return null;
        const [, opening, words, closing] = edges.exec(segment.text)!;
        if (!words) return <span key={index}>{segment.text}</span>;
        return (
          <Fragment key={index}>
            {opening}
            {side === 'before' ? (
              <del className="rounded-xs bg-destructive-border px-0.5 text-inherit line-through">
                <span className="sr-only">eliminat: </span>
                {words}
              </del>
            ) : (
              <ins className="rounded-xs bg-success-border px-0.5 font-semibold text-inherit no-underline">
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

export function LawDiff({ before, after }: { before: string; after: string }) {
  const segments = useMemo(
    () => wordDiff(withSuperscripts(before), withSuperscripts(after)),
    [before, after]
  );
  return (
    <div data-testid="law-diff" className="grid overflow-hidden rounded-xl border sm:grid-cols-2">
      <div
        data-testid="law-diff-before"
        className="grid content-start gap-2 p-4 max-sm:border-b sm:border-r sm:p-5"
      >
        <h3 className="text-[13px] font-medium text-muted-foreground">Înainte</h3>
        <LawText segments={segments} side="before" />
      </div>
      <div data-testid="law-diff-after" className="grid content-start gap-2 p-4 sm:p-5">
        <h3 className="text-[13px] font-medium text-muted-foreground">Acum</h3>
        <LawText segments={segments} side="after" />
      </div>
    </div>
  );
}
