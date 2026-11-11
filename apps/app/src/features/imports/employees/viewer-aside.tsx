import { trainingDomainLabels } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { ArrowRight, Check, ChevronRight } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { roCount } from '@/features/employees/employee-format';

import { StatusTag, Tag } from '../review-parts';
import {
  type Decision,
  fieldLabels,
  type FieldName,
  type Person,
  resolveField,
  type ReviewContext,
  type SheetPage,
} from './employee-review-model';
import { ChoiceCards, type OtherCommit } from './person-decisions';
import { nextChoice } from './person-sections';
import { dateLabel } from './review-format';

type Update = Parameters<typeof ChoiceCards>[0]['onChange'];

export type Highlight = { photos: string[]; caption: string };

const lowerLabel = (label: string) =>
  label.charAt(1) === label.charAt(1).toUpperCase()
    ? label
    : label.charAt(0).toLowerCase() + label.slice(1);

function DecisionsLeft({ count }: { count: number }) {
  return count > 0 ? (
    <Tag tone="destructive" testId="viewer-decisions-left">
      {count} de hotărât
    </Tag>
  ) : (
    <StatusTag status={{ kind: 'done' }} />
  );
}

export function ViewerChoice({
  context,
  person,
  field,
  queue,
  decisions,
  onHighlight,
  onTyping,
  onGo,
  onClose,
  onChange,
}: {
  context: ReviewContext;
  person: Person;
  field: FieldName;
  queue: FieldName[];
  decisions: Decision[];
  onHighlight: (highlight: Highlight | null) => void;
  onTyping: (typing: boolean) => void;
  onGo: (field: FieldName) => void;
  onClose: () => void;
  onChange: Update;
}) {
  const headingId = useId();
  const commit = useRef<OtherCommit | null>(null);
  const change = context.changes.people[person.id]?.fields?.[field];
  const picked = change?.option !== undefined || change?.value !== undefined;
  const count = resolveField(context, person, field).options.length;
  const next = nextChoice(decisions, queue, field);

  function proceed() {
    if ((commit.current?.() ?? 'empty') === 'invalid') return;
    if (next) onGo(next);
    else onClose();
  }

  return (
    <div className="flex min-h-full flex-col" data-testid="viewer-choice">
      <div className="grid content-start gap-4 p-4 sm:p-5">
        <div className="flex min-h-7 items-center justify-between gap-3">
          <DecisionsLeft count={decisions.length} />
          {picked && (
            <span
              className="flex items-center gap-1.5 text-sm font-medium text-success-foreground"
              data-testid="viewer-choice-picked"
            >
              <Check className="size-4" aria-hidden="true" />
              Aleasă
            </span>
          )}
        </div>
        <div className="grid gap-0.5">
          <h3 id={headingId} className="text-[15px] font-semibold">
            {fieldLabels[field]}
          </h3>
          <p className="text-[13px] text-muted-foreground">
            Fișele scriu {roCount(count, 'variantă', 'variante')}
          </p>
        </div>
        <ChoiceCards
          key={field}
          context={context}
          person={person}
          name={field}
          labelledBy={headingId}
          stacked
          commitRef={commit}
          onHighlight={(option) =>
            onHighlight(
              option
                ? {
                    photos: option.pageIds,
                    caption: `Subliniate: fotografiile unde scrie ${option.value}`,
                  }
                : null
            )
          }
          onTyping={onTyping}
          onChange={onChange}
        />
      </div>
      <div className="sticky bottom-0 mt-auto border-t bg-background p-4 sm:px-5">
        <Button
          variant="outline"
          className="w-full"
          onClick={proceed}
          data-testid="viewer-choice-next"
        >
          {next ? (
            <>
              Mai departe: {lowerLabel(fieldLabels[next])}
              <ArrowRight aria-hidden="true" />
            </>
          ) : (
            'Gata, închide'
          )}
        </Button>
      </div>
    </div>
  );
}

type Citation = {
  key: string;
  label: string;
  photos: string[];
  heldOn: string | null;
  open: { kind: 'choice'; field: FieldName } | { kind: 'row'; id: string };
};

function citations(
  context: ReviewContext,
  person: Person,
  decisions: Decision[],
  page: SheetPage
): Citation[] {
  const choices = decisions
    .filter((decision) => decision.key.startsWith('choice-'))
    .map((decision) => decision.key.slice('choice-'.length) as FieldName)
    .flatMap((field): Citation[] => {
      const options = resolveField(context, person, field).options;
      if (!options.some((option) => option.pageIds.includes(page.id))) return [];
      return [
        {
          key: `choice-${field}`,
          label: fieldLabels[field],
          photos: options.flatMap((option) => option.pageIds),
          heldOn: null,
          open: { kind: 'choice', field },
        },
      ];
    });
  const rows = page.rows
    .filter((row) => !row.testOnly)
    .map((row): Citation => {
      const heldOn = context.changes.rows[row.id]?.values?.heldOn ?? row.heldOn;
      const day = typeof heldOn === 'string' ? heldOn : null;
      return {
        key: `row-${row.id}`,
        label: `Instruire ${trainingDomainLabels[row.domain]}, ${dateLabel(day) ?? 'Data nu se citește'}`,
        photos: [page.id],
        heldOn: day,
        open: { kind: 'row', id: row.id },
      };
    });
  return [...choices, ...rows];
}

function moreLabel(rest: Citation[]) {
  const years = rest.map((each) => each.heldOn?.slice(0, 4));
  if (rest.every((each) => each.open.kind === 'row') && years.every(Boolean)) {
    const sorted = (years as string[]).sort();
    const span = sorted[0] === sorted.at(-1) ? sorted[0] : `${sorted[0]}–${sorted.at(-1)}`;
    return `Încă ${rest.length}: instruirile din ${span}`;
  }
  return `Încă ${rest.length}: ${rest.map((each) => each.label).join(', ')}`;
}

const shownCitations = 5;

export function PhotoCitations({
  context,
  person,
  decisions,
  page,
  onHighlight,
  onOpenChoice,
  onOpenRow,
}: {
  context: ReviewContext;
  person: Person;
  decisions: Decision[];
  page: SheetPage;
  onHighlight: (highlight: Highlight | null) => void;
  onOpenChoice: (field: FieldName) => void;
  onOpenRow: (rowId: string) => void;
}) {
  const headingId = useId();
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const pointer = useRef('mouse');
  const items = citations(context, person, decisions, page);
  const shown = expanded ? items : items.slice(0, shownCitations);
  const rest = items.slice(shownCitations);
  const highlight = (item: Citation | null) =>
    onHighlight(
      item
        ? { photos: item.photos, caption: `Subliniate: fotografiile unde apare ${item.label}` }
        : null
    );
  const open = (item: Citation) =>
    item.open.kind === 'choice' ? onOpenChoice(item.open.field) : onOpenRow(item.open.id);

  return (
    <section
      aria-labelledby={headingId}
      className="grid content-start gap-3 p-4 sm:p-5"
      data-testid="viewer-citations"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={headingId} className="text-[15px] font-semibold">
          Pe această fotografie
        </h3>
        <span className="text-sm text-muted-foreground tabular-nums">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nimic de pe pagină nu trimite la această fotografie.
        </p>
      ) : (
        <ul className="grid gap-2" onPointerLeave={() => highlight(null)}>
          {shown.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                data-selected={selected === item.key || undefined}
                data-testid="viewer-citation"
                onPointerDown={(event) => {
                  pointer.current = event.pointerType;
                }}
                onPointerEnter={() => highlight(item)}
                onFocus={() => highlight(item)}
                onClick={() => {
                  if (pointer.current === 'touch' && selected !== item.key) {
                    setSelected(item.key);
                    highlight(item);
                    return;
                  }
                  open(item);
                }}
                className={cn(
                  'flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-[10px] border bg-card px-4 py-2 text-left text-sm outline-none hover:border-foreground/40 focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  item.open.kind === 'choice' && 'font-medium',
                  selected === item.key && 'border-foreground ring-1 ring-foreground'
                )}
              >
                <span className="min-w-0 wrap-anywhere">{item.label}</span>
                <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!expanded && rest.length > 0 && (
        <button
          type="button"
          aria-expanded={false}
          onClick={() => setExpanded(true)}
          className="flex w-fit cursor-pointer items-center gap-2 rounded-sm text-left text-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="viewer-citations-more"
        >
          <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
          {moreLabel(rest)}
        </button>
      )}
    </section>
  );
}
