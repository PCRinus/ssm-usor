import { legalAmendmentOperations } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';

import type {
  LegalChangeListResponseItemsItem,
  LegalChangeListResponseItemsItemPassagesItem,
} from '@/api/generated/api';

import { wordDiff } from './law-diff';
import { listOf, operationLabels, unitLabel, unitName } from './legislation-labels';

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
        const label = operationLabels[operation];
        return (
          <div key={operation} className="flex flex-wrap gap-x-1.5">
            <dt className="text-muted-foreground">
              {units.length === 1 ? label.one : label.many}:
            </dt>
            <dd>{more > 0 ? `${shown.join(', ')} și încă ${more}` : listOf(shown)}</dd>
          </div>
        );
      })}
    </dl>
  );
}

type PassageGroup = { key: string; first: Passage; places: Passage[] };

function groupPassages(passages: Passage[]): PassageGroup[] {
  const groups = new Map<string, PassageGroup>();
  for (const passage of passages) {
    const key = JSON.stringify([passage.unit, passage.status, passage.oldText, passage.newText]);
    const group = groups.get(key);
    if (group) group.places.push(passage);
    else groups.set(key, { key, first: passage, places: [passage] });
  }
  return [...groups.values()];
}

function placeOf(passage: Passage) {
  const document = passage.document?.title;
  if (passage.citationForm === 'reference') {
    return document ? `Trimitere în ${document}` : 'Trimitere într-un document';
  }
  const where = document ? `Citat în ${document}` : 'Citat într-un document';
  return passage.locator ? `${where}, ${passage.locator}` : where;
}

const statusNotes: Partial<Record<Passage['status'], string>> = {
  added: 'Prevedere nouă în lege.',
  repealed: 'Prevedere abrogată.',
  missing: 'Prevederea nu apare în textul legii.',
};

export function ChangedPassages({ passages }: { passages: Passage[] }) {
  if (passages.length === 0) return null;
  return (
    <div data-testid="legal-change-passages" className="grid gap-3 pt-1">
      <p className="text-xs text-muted-foreground">
        În textul legii, cuvintele tăiate au fost eliminate, iar cele evidențiate au fost adăugate.
      </p>
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
  const length = (first.oldText?.length ?? 0) + (first.newText?.length ?? 0);
  const [open, setOpen] = useState(length <= longTextLength);
  const textId = useId();
  const hasText = first.oldText !== null || first.newText !== null;

  return (
    <li data-testid="legal-change-passage" className="grid gap-1.5 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium">{unitName(first.unit)}</p>
        {hasText && length > longTextLength && (
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
          <li key={place.id} data-testid="legal-change-passage-place">
            {placeOf(place)}
          </li>
        ))}
      </ul>
      {statusNotes[first.status] && <p className="text-sm">{statusNotes[first.status]}</p>}
      {hasText && (
        <div id={textId} hidden={!open}>
          <LawDiff before={first.oldText ?? ''} after={first.newText ?? ''} />
        </div>
      )}
    </li>
  );
}

export function LawDiff({ before, after }: { before: string; after: string }) {
  return (
    <p data-testid="law-diff" className="max-w-prose text-sm leading-relaxed whitespace-pre-line">
      {wordDiff(before, after).map((segment, index) =>
        segment.kind === 'same' ? (
          <span key={index}>{segment.text}</span>
        ) : segment.kind === 'deleted' ? (
          <del
            key={index}
            className="rounded-xs bg-destructive-border px-0.5 text-inherit line-through"
          >
            <span className="sr-only">eliminat: </span>
            {segment.text}
          </del>
        ) : (
          <ins
            key={index}
            className="rounded-xs bg-success-border px-0.5 font-semibold text-inherit no-underline"
          >
            <span className="sr-only">adăugat: </span>
            {segment.text}
          </ins>
        )
      )}
    </p>
  );
}
