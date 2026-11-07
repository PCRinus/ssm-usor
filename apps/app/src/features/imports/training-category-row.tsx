import { Button } from '@ssm-usor/ui/components/button';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Plus, Split } from 'lucide-react';
import { useId, useState } from 'react';

import { notApplicable } from '@/features/training/document-details-schema';

import { DecisionRow, type Tone } from './library/decision-row';
import type { FieldContext } from './review-fields';
import { anchorOf, flagNote, flagsAt, inferenceNote, type TrainingCategory } from './review-model';
import {
  EditButton,
  EditedTag,
  KindLine,
  PickList,
  PickOption,
  RowNote,
  SourceButton,
  SourceFileNames,
} from './review-parts';
import {
  type CategoryCandidate,
  categoryChanges,
  categoryChoices,
  type CategoryState,
  type CategoryValue,
  formatCategoryValue,
} from './training-category';

const undecided = '';

const valueOfChoice = (choice: string): CategoryValue | null =>
  choice === undecided ? null : choice === notApplicable ? notApplicable : Number(choice);

function save(context: FieldContext, category: TrainingCategory, value: CategoryValue | null) {
  context.review.setFields(categoryChanges(context.states, category, context.changes, value));
}

function CategorySelect({
  id,
  state,
  value,
  onChange,
  describedBy,
  label,
  autoFocus,
}: {
  id: string;
  state: CategoryState;
  value: string;
  onChange: (value: string) => void;
  describedBy?: string;
  label?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="w-full sm:w-72">
      <NativeSelect
        id={id}
        data-testid="review-category-select"
        autoFocus={autoFocus}
        aria-label={label}
        aria-describedby={describedBy}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <NativeSelectOption value={undecided}>Nespecificat</NativeSelectOption>
        {categoryChoices(state.category, state.value).map((choice) => (
          <NativeSelectOption key={choice.value} value={String(choice.value)}>
            {choice.label}
          </NativeSelectOption>
        ))}
        <NativeSelectOption value={notApplicable}>Nu se aplică</NativeSelectOption>
      </NativeSelect>
    </div>
  );
}

const hintOf = (category: TrainingCategory) =>
  `Alege un interval sau „Nu se aplică”. Cel mult la ${category.maxMonths} luni.`;

function CategoryEditor({
  state,
  context,
  onDone,
}: {
  state: CategoryState;
  context: FieldContext;
  onDone: () => void;
}) {
  const formId = useId();
  const id = `review-input-${anchorOf(state.category.interval)}`;
  const [choice, setChoice] = useState(state.value === null ? undecided : String(state.value));
  return (
    <DecisionRow
      tone="editing"
      top
      wide
      id={anchorOf(state.category.interval)}
      testId="review-row-editing"
      label={
        <label htmlFor={id} className="grid gap-0.5 sm:mt-2">
          {state.label}
          <span className="text-xs font-semibold text-ring">Schimbi acum</span>
        </label>
      }
      actions={
        <>
          <Button type="button" variant="outline" onClick={onDone}>
            Renunță
          </Button>
          <Button type="submit" form={formId} data-testid="review-group-save">
            Salvează
          </Button>
        </>
      }
    >
      <form
        id={formId}
        data-testid="review-group-form"
        className="grid gap-2"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save(context, state.category, valueOfChoice(choice));
          onDone();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onDone();
        }}
      >
        <CategorySelect
          id={id}
          state={state}
          value={choice}
          onChange={setChoice}
          describedBy={`${id}-hint`}
          autoFocus
        />
        <span id={`${id}-hint`} className="text-[13px] text-muted-foreground">
          {hintOf(state.category)}
        </span>
      </form>
    </DecisionRow>
  );
}

const sameCandidate = (a: CategoryCandidate | null, b: CategoryCandidate) =>
  a !== null && a.path === b.path && a.option === b.option;

function choiceLine(state: CategoryState) {
  if (state.conflict === 'documents') {
    return 'Documentele dau și o periodicitate, și „Nu se aplică”. Alege-o pe cea valabilă.';
  }
  if (state.conflict === 'member') {
    return 'Periodicitatea și „Nu se aplică” nu pot rămâne amândouă. Alege una.';
  }
  return `Documentele dau ${state.candidates.length} variante. Alege-o pe cea de acum.`;
}

function memberChoiceOf(state: CategoryState, context: FieldContext): string | null {
  if (state.edited) return String(state.value);
  if (state.conflict !== 'member') return null;
  const interval = context.states[state.category.interval]!;
  return interval.edited ? String(interval.value) : notApplicable;
}

function CategoryChoiceRow({ state, context }: { state: CategoryState; context: FieldContext }) {
  const name = useId();
  const decided = state.status !== 'choice';
  const memberChoice = memberChoiceOf(state, context);
  const [otherOpen, setOtherOpen] = useState(memberChoice !== null);
  const [other, setOther] = useState(memberChoice ?? undecided);
  return (
    <DecisionRow
      tone={decided ? 'done' : 'todo'}
      top
      wide
      id={anchorOf(state.category.interval)}
      testId="review-category-choice"
      label={<span id={`${name}-label`}>{state.label}</span>}
    >
      <KindLine icon={<Split aria-hidden="true" />} tone={decided ? undefined : 'warning'}>
        {choiceLine(state)}
      </KindLine>
      <PickList labelledBy={`${name}-label`}>
        {state.candidates.map((candidate) => {
          const text = formatCategoryValue(state.category, candidate.value);
          return (
            <PickOption
              key={`${candidate.path}-${candidate.option}`}
              name={name}
              checked={!otherOpen && sameCandidate(state.inForce, candidate)}
              onPick={() => {
                setOtherOpen(false);
                save(context, state.category, candidate.value);
              }}
              heading={
                candidate.inferred ? (
                  'Dedusă din posturile propuse'
                ) : (
                  <SourceFileNames sources={candidate.sources} />
                )
              }
              action={
                <SourceButton
                  sources={candidate.sources}
                  onOpen={() => context.openSource(text, candidate.sources)}
                />
              }
            >
              {text}
            </PickOption>
          );
        })}
        <PickOption
          name={name}
          checked={otherOpen}
          inDocuments={decided && state.edited}
          onPick={() => setOtherOpen(true)}
          heading="Altă periodicitate"
          below={
            otherOpen && (
              <form
                className="flex flex-wrap gap-2"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  save(context, state.category, valueOfChoice(other));
                }}
              >
                <CategorySelect
                  id={`${name}-other`}
                  state={state}
                  value={other}
                  onChange={setOther}
                  label={state.label}
                />
                <Button type="submit" variant="outline" disabled={other === undecided}>
                  Folosește
                </Button>
              </form>
            )
          }
        >
          {!otherOpen && (
            <span className="text-muted-foreground">
              O alegi tu, dacă niciuna nu mai e valabilă.
            </span>
          )}
        </PickOption>
      </PickList>
    </DecisionRow>
  );
}

function CategoryValueRow({
  state,
  context,
  onEdit,
}: {
  state: CategoryState;
  context: FieldContext;
  onEdit: () => void;
}) {
  const flags = [
    ...flagsAt(context.proposal, state.category.interval),
    ...flagsAt(context.proposal, state.category.notApplicable),
  ].filter((flag) => flag.code !== 'missing');
  const inferred = state.inForce
    ? inferenceNote(state.category.notApplicable, state.inForce.inferred)
    : null;
  const tone: Tone = flags.length > 0 ? 'warning' : 'done';
  return (
    <DecisionRow
      tone={tone}
      wide
      id={anchorOf(state.category.interval)}
      testId="review-row"
      label={state.label}
      actions={
        <>
          <SourceButton
            sources={state.sources}
            onOpen={() => context.openSource(state.label, state.sources)}
          />
          <EditButton onClick={onEdit} />
        </>
      }
    >
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{formatCategoryValue(state.category, state.value)}</span>
        {state.edited && <EditedTag />}
      </span>
      {inferred && <RowNote testId="review-inferred">{inferred}</RowNote>}
      {state.edited && state.proposed !== null && (
        <RowNote>Din documente: {formatCategoryValue(state.category, state.proposed)}</RowNote>
      )}
      {flags.map((flag) => (
        <RowNote key={`${flag.path}-${flag.code}`}>
          {flagNote(flag, context.proposal, context.changes)}
        </RowNote>
      ))}
    </DecisionRow>
  );
}

function CategoryMissingRow({
  state,
  context,
  onEdit,
}: {
  state: CategoryState;
  context: FieldContext;
  onEdit: () => void;
}) {
  return (
    <DecisionRow
      tone="todo"
      wide
      id={anchorOf(state.category.interval)}
      testId="review-row"
      label={state.label}
      actions={
        <>
          <SourceButton
            sources={state.sources}
            onOpen={() => context.openSource(state.label, state.sources)}
          />
          <Button type="button" data-testid="review-complete" onClick={onEdit}>
            <Plus aria-hidden="true" />
            Completează
          </Button>
        </>
      }
    >
      <span className="text-warning-foreground">
        Lipsește din documente. Alege periodicitatea sau „Nu se aplică”, dacă o știi; altfel rămâne
        necompletată.
      </span>
    </DecisionRow>
  );
}

export function TrainingCategoryRow({
  state,
  context,
  editing,
  onEdit,
  onDone,
}: {
  state: CategoryState;
  context: FieldContext;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
}) {
  if (editing) return <CategoryEditor state={state} context={context} onDone={onDone} />;
  if (state.status === 'choice' || state.candidates.length > 1) {
    return <CategoryChoiceRow state={state} context={context} />;
  }
  if (state.status === 'missing') {
    return <CategoryMissingRow state={state} context={context} onEdit={onEdit} />;
  }
  return <CategoryValueRow state={state} context={context} onEdit={onEdit} />;
}

export function CategoryDifferRow({
  state,
  context,
}: {
  state: CategoryState;
  context: FieldContext;
}) {
  const name = useId();
  const { category } = state;
  const replaced = state.comparison === 'replaced';
  const withoutReplace = (path: string) => {
    const rest = Object.fromEntries(
      Object.entries(context.changes.fields[path] ?? {}).filter(([key]) => key !== 'replace')
    );
    return Object.keys(rest).length ? rest : null;
  };
  const replacing = state.value === notApplicable ? category.notApplicable : category.interval;
  return (
    <DecisionRow
      tone="done"
      top
      wide
      id={anchorOf(category.interval)}
      testId="review-differs-row"
      label={<span id={`${name}-label`}>{state.label}</span>}
    >
      <PickList labelledBy={`${name}-label`}>
        <PickOption
          name={name}
          checked={!replaced}
          onPick={() =>
            context.review.setFields({
              [category.interval]: withoutReplace(category.interval),
              [category.notApplicable]: withoutReplace(category.notApplicable),
            })
          }
          heading="În aplicație"
          testId="review-keep-app"
        >
          {formatCategoryValue(category, state.existing)}
        </PickOption>
        <PickOption
          name={name}
          checked={replaced}
          onPick={() =>
            context.review.setField(replacing, {
              ...context.changes.fields[replacing],
              replace: true,
            })
          }
          heading="În documente"
          testId="review-use-documents"
          action={
            <SourceButton
              sources={state.sources}
              onOpen={() => context.openSource(state.label, state.sources)}
            />
          }
        >
          {formatCategoryValue(category, state.value)}
        </PickOption>
      </PickList>
    </DecisionRow>
  );
}
