import {
  type FireExtinguisherNorm,
  fireExtinguisherNormLabels,
  fireExtinguisherNorms,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { Sparkles } from 'lucide-react';
import { useId, useState } from 'react';

import { DecisionRow } from './library/decision-row';
import { FieldCard, type FieldContext } from './review-fields';
import {
  anchorOf,
  type Blocker,
  flagNote,
  flagsAt,
  itemName,
  type ItemState,
  itemStates,
  officeActivityChoice,
  officeActivityPath,
  officeActivityStates,
  type SuggestedFieldName,
  suggestedFields,
  suggestedValue,
  suggestedValuesPath,
  suggestionsConfirmed,
  suggestionSources,
  suggestionStates,
} from './review-model';
import {
  EditedTag,
  KindLine,
  LinkButton,
  PickList,
  PickOption,
  RowNote,
  SourceButton,
  SourceFileNames,
  Tag,
} from './review-parts';

type ItemsContext = FieldContext & { blockers: Blocker[] };

const suggestedLabels: Record<SuggestedFieldName, string> = {
  combustibleMaterials: 'Materiale combustibile',
  ignitionSources: 'Surse de aprindere',
  fireRiskEquipment: 'Echipamente și mijloace de lucru',
  specificMeasures: 'Măsuri specifice',
  extinguisherNorm: 'Norma de dotare cu stingătoare',
};

const SuggestionTag = () => (
  <Tag tone="info" icon={<Sparkles aria-hidden="true" />} testId="review-suggestion-tag">
    Sugestie din activitate
  </Tag>
);

function shown(field: SuggestedFieldName, value: unknown) {
  if (field !== 'extinguisherNorm') return String(value ?? '');
  return fireExtinguisherNormLabels[value as FireExtinguisherNorm]?.label ?? String(value ?? '');
}

function textProblem(raw: string) {
  const text = raw.trim();
  if (text.length < 2) return 'Scrie cel puțin 2 caractere.';
  if (text.length > 600) return 'Cel mult 600 de caractere.';
  return null;
}

function setSuggested(
  context: ItemsContext,
  state: ItemState,
  field: SuggestedFieldName,
  value: string | null | undefined
) {
  context.review.setItem(state.item.id, (current) => {
    const values = Object.fromEntries(
      Object.entries(current.values ?? {}).filter(([key]) => key !== field)
    );
    if (value !== undefined) values[field] = value;
    return { ...current, values };
  });
}

function SuggestedValueRow({
  state,
  field,
  context,
}: {
  state: ItemState;
  field: SuggestedFieldName;
  context: ItemsContext;
}) {
  const id = useId();
  const label = suggestedLabels[field];
  const suggestion = state.item[field];
  const current = suggestedValue(state.item, context.changes, field);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const sources = suggestionSources(state.item, field);
  const flags = flagsAt(context.proposal, `workplaces.${state.index}.suggested.${field}`);
  const startEditing = () => {
    setDraft(current.kind === 'other' ? current.value : String(suggestion ?? ''));
    setProblem(null);
    setEditing(true);
  };
  const save = () => {
    const value = draft.trim();
    const trouble = field === 'extinguisherNorm' ? null : textProblem(value);
    setProblem(trouble);
    if (trouble) return;
    setSuggested(context, state, field, value === suggestion ? undefined : value);
    setEditing(false);
  };
  return (
    <div
      role="group"
      aria-labelledby={`${id}-label`}
      data-testid="review-suggested-value"
      data-state={current.kind}
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 rounded-[10px] border bg-background/60 px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span id={`${id}-label`} className="text-[13px] font-semibold text-muted-foreground">
          {label}
        </span>
        {current.kind === 'keep' ? <SuggestionTag /> : <EditedTag />}
      </div>
      {editing ? (
        <form
          className="grid gap-1.5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          {field === 'extinguisherNorm' ? (
            <NativeSelect
              aria-label={label}
              data-testid="review-suggested-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            >
              {fireExtinguisherNorms.map((norm) => (
                <NativeSelectOption key={norm} value={norm}>
                  {fireExtinguisherNormLabels[norm].label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          ) : (
            <Textarea
              aria-label={label}
              data-testid="review-suggested-input"
              autoFocus
              rows={3}
              aria-invalid={Boolean(problem)}
              aria-describedby={problem ? `${id}-problem` : undefined}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          )}
          {problem && (
            <span id={`${id}-problem`} className="text-[13px] text-destructive">
              {problem}
            </span>
          )}
          <span className="flex flex-wrap gap-2">
            <Button type="submit" variant="outline">
              Folosește
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Renunță
            </Button>
          </span>
        </form>
      ) : (
        <span className="grid grid-cols-[minmax(0,1fr)] gap-1 text-sm wrap-anywhere">
          {current.kind === 'empty' ? (
            <span className="text-muted-foreground">
              Necompletat. Îl completezi pe fișa clientului.
            </span>
          ) : (
            <span data-testid="review-suggested-text">
              {shown(field, current.kind === 'other' ? current.value : suggestion)}
            </span>
          )}
          {current.kind !== 'keep' && (
            <span className="text-[13px] text-muted-foreground">
              Sugestia: {shown(field, suggestion)}
            </span>
          )}
        </span>
      )}
      {flags.map((flag) => (
        <RowNote key={`${flag.path}-${flag.code}`}>
          {flagNote(flag, context.proposal, context.changes)}
        </RowNote>
      ))}
      {!editing && (
        <span className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted-foreground max-sm:[&>button]:min-h-11">
          <span className="flex min-w-0 items-center gap-1">
            Din <SourceFileNames sources={sources} />
          </span>
          <SourceButton
            outlined={false}
            sources={sources}
            onOpen={() => context.openSource(`${label}: ${shown(field, suggestion)}`, sources)}
          />
          <LinkButton onClick={startEditing} data-testid="review-suggested-change">
            Schimbă
          </LinkButton>
          {current.kind === 'keep' ? (
            <LinkButton
              onClick={() => setSuggested(context, state, field, null)}
              data-testid="review-suggested-empty"
            >
              Lasă necompletat
            </LinkButton>
          ) : (
            <LinkButton
              onClick={() => setSuggested(context, state, field, undefined)}
              data-testid="review-suggested-restore"
            >
              Revino la sugestie
            </LinkButton>
          )}
        </span>
      )}
    </div>
  );
}

function SuggestionsRow({ state, context }: { state: ItemState; context: ItemsContext }) {
  const name = useId();
  const path = suggestedValuesPath(state.item.id);
  const fields = suggestedFields(state, context.changes);
  const confirmed = suggestionsConfirmed(state.item, context.changes);
  const allEmpty = fields.every(
    (field) => suggestedValue(state.item, context.changes, field).kind === 'empty'
  );
  const confirm = () => context.review.setField(path, { option: 0 });
  return (
    <DecisionRow
      tone={confirmed ? 'done' : 'todo'}
      top
      wide
      id={anchorOf(path)}
      testId="review-suggestions"
      label={<span id={`${name}-label`}>{itemName('workplaces', state.values)}</span>}
    >
      <KindLine icon={<Sparkles aria-hidden="true" />} tone={confirmed ? undefined : 'warning'}>
        Niciun document nu le scrie. Le-am propus din ce spun documentele despre activitatea de
        aici. Păstrează-le doar dacă se potrivesc locului.
      </KindLine>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        {fields.map((field) => (
          <SuggestedValueRow key={field} state={state} field={field} context={context} />
        ))}
      </div>
      <PickList labelledBy={`${name}-label`}>
        <PickOption
          name={name}
          checked={confirmed && !allEmpty}
          onPick={confirm}
          heading="Păstrează valorile de mai sus"
          testId="review-suggestions-keep"
        >
          <span className="text-muted-foreground">
            Intră pe fișa punctului de lucru așa cum le vezi.
          </span>
        </PickOption>
        <PickOption
          name={name}
          checked={confirmed && allEmpty}
          inDocuments={false}
          onPick={() => {
            context.review.setItem(state.item.id, (current) => ({
              ...current,
              values: {
                ...current.values,
                ...Object.fromEntries(fields.map((field) => [field, null])),
              },
            }));
            confirm();
          }}
          heading="Lasă necompletat"
          testId="review-suggestions-empty"
        >
          <span className="text-muted-foreground">
            Nu se preia nimic. Le completezi pe fișa clientului când le afli.
          </span>
        </PickOption>
      </PickList>
    </DecisionRow>
  );
}

function OfficeActivityRow({ state, context }: { state: ItemState; context: ItemsContext }) {
  const name = useId();
  const path = officeActivityPath(state.item.id);
  const choice = officeActivityChoice(state.item, context.changes);
  const sources = suggestionSources(state.item, 'officeHasActivity');
  const points = itemStates(context.proposal, context.changes, 'workplaces')
    .filter((each) => each.included && each.values.isRegisteredOffice !== true)
    .map((each) => `«${itemName('workplaces', each.values)}»`);
  return (
    <DecisionRow
      tone={choice === null ? 'todo' : 'done'}
      top
      wide
      id={anchorOf(path)}
      testId="review-office-activity"
      label={
        <span id={`${name}-label`}>{`${itemName('workplaces', state.values)} · sediu social`}</span>
      }
    >
      <KindLine
        icon={<Sparkles aria-hidden="true" />}
        tone={choice === null ? 'warning' : undefined}
      >
        Documentele numesc {points.length === 1 ? 'punctul' : 'punctele'} de lucru{' '}
        {points.join(', ')} și nu pun la sediul social niciun post, mijloc de stingere sau încăpere.
        Poate fi doar adresa firmei.
      </KindLine>
      <PickList labelledBy={`${name}-label`}>
        <PickOption
          name={name}
          checked={choice === 0}
          onPick={() => context.review.setField(path, { option: 0 })}
          heading={<SuggestionTag />}
          testId="review-office-activity-none"
          action={
            <SourceButton
              sources={sources}
              onOpen={() => context.openSource('Punctele de lucru din documente', sources)}
            />
          }
        >
          La sediul social nu se desfășoară activitate
          <span className="block text-[13px] text-muted-foreground">
            Sediul nu primește fișă SU, mijloace de stingere și nu apare în documentele SU.
          </span>
        </PickOption>
        <PickOption
          name={name}
          checked={choice === 1}
          onPick={() => context.review.setField(path, { option: 1 })}
          heading="Cu activitate"
          testId="review-office-activity-some"
        >
          La sediul social se desfășoară activitate
        </PickOption>
      </PickList>
    </DecisionRow>
  );
}

export function Suggestions({ context }: { context: ItemsContext }) {
  const args = [
    context.proposal,
    context.changes,
    context.blockers,
    context.existingClient,
  ] as const;
  const offices = officeActivityStates(...args);
  const workplaces = suggestionStates(...args);
  if (offices.length === 0 && workplaces.length === 0) return null;
  const open =
    offices.filter((state) => officeActivityChoice(state.item, context.changes) === null).length +
    workplaces.filter((state) => !suggestionsConfirmed(state.item, context.changes)).length;
  return (
    <FieldCard
      title="Sugestii din activitate"
      icon={Sparkles}
      description="Niciun document nu le scrie: le-am propus din echipamentele, deșeurile și activitatea pe care le numesc documentele. Nu se preiau până nu le confirmi."
      pending={
        open === 0
          ? null
          : open === 1
            ? 'Mai ai de confirmat o sugestie'
            : `Mai ai ${open} lucruri de făcut`
      }
      testId="review-suggestions-card"
    >
      {offices.map((state) => (
        <OfficeActivityRow key={`office-${state.item.id}`} state={state} context={context} />
      ))}
      {workplaces.map((state) => (
        <SuggestionsRow key={state.item.id} state={state} context={context} />
      ))}
    </FieldCard>
  );
}
