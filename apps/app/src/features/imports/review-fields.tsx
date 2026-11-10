import { zodResolver } from '@hookform/resolvers/zod';
import {
  fireSmokingPolicies,
  fireSmokingPolicyLabels,
  normalizeCui,
  type StaffCategory,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import {
  Building2,
  ClipboardList,
  Copy,
  Equal,
  Flame,
  GitCompare,
  type LucideIcon,
  MapPin,
  Phone,
  Plus,
  Split,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { Controller, type Resolver, useForm, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

import { Segmented } from '@/components/segmented';
import { CaenCombobox } from '@/features/clients/caen-combobox';
import { VatPayerField } from '@/features/clients/client-fields';
import {
  clientFormSchema,
  type ClientFormValues,
  emptyClientForm,
} from '@/features/clients/client-form-schema';
import { CountyCombobox } from '@/features/clients/county-combobox';

import { endSentence } from './import-format';
import { Includable } from './include-switch';
import { DecisionRow, PendingNote, type Tone } from './library/decision-row';
import { phoneDiff } from './phone-diff';
import {
  anafMismatch,
  anafMismatchNote,
  anafVatPayer,
  anchorOf,
  appliesAt,
  type Blocker,
  type Changes,
  type FactDecision,
  fieldGroups,
  fieldInfo,
  fieldSpelling,
  type FieldState,
  flagNote,
  flagsAt,
  formatFieldValue,
  inferenceNote,
  type LabelledSource,
  type Proposal,
  type RegisteredCompany,
  sameCompanyName,
  sameValue,
  type SectionId,
  smokingPlaceAsked,
  smokingPlaceDecision,
  smokingPlacePath,
  valueInForce,
  vatPayerPath,
  yesNoLabels,
} from './review-model';
import {
  AnafTag,
  EditButton,
  EditedTag,
  KindLine,
  PhoneDigits,
  PickList,
  PickOption,
  RowNote,
  SourceButton,
  SourceFileNames,
  SpellingChoice,
  Tag,
} from './review-parts';
import { TrainingImportCard } from './training-import-card';
import type { ImportReview } from './use-import-review';

export type OpenSource = (
  title: string,
  sources: LabelledSource[],
  otherCompanyName?: string | null
) => void;

export type FieldContext = {
  proposal: Proposal;
  changes: Changes;
  review: ImportReview;
  states: Record<string, FieldState>;
  vatPayer: boolean;
  registered: (RegisteredCompany & { vatPayer: boolean }) | null;
  existingClient: boolean;
  existingPositions: { id: string; name: string; staffCategory: StaffCategory }[];
  importId: string;
  openSource: OpenSource;
  blockers: Blocker[];
};

const requiredPaths = new Set(['client.legalName', 'client.cui']);

function fieldValue(path: string, raw: string): string | number | null {
  const text = raw.trim();
  if (text === '') return null;
  if (path === 'client.cui') return normalizeCui(text)?.cui ?? text;
  return text;
}

function fieldProblem(path: string, raw: string) {
  if (raw.trim() === '') return `${fieldInfo[path]?.write ?? 'Scrie o valoare'}.`;
  const checked = formSchema([path]).safeParse({ [fieldKey(path)]: raw });
  return checked.success ? null : (checked.error.issues[0]?.message ?? 'Valoare greșită.');
}

// Exact, so that a member writing the document's capitals or diacritics keeps them.
const sameEntry = (a: string | number, b: string | number) =>
  typeof a === 'number' || typeof b === 'number'
    ? Number(a) === Number(b)
    : String(a).trim() === String(b).trim();

const withoutKeys = (change: Changes['fields'][string] | undefined, ...keys: string[]) =>
  Object.fromEntries(Object.entries(change ?? {}).filter(([key]) => !keys.includes(key)));

function saveVatPayer(context: FieldContext, vatPayer: boolean, cui: string | undefined) {
  const anaf = anafVatPayer(context.registered, cui ?? context.states['client.cui']?.value ?? null);
  context.review.setField(vatPayerPath, vatPayer === anaf ? null : { value: String(vatPayer) });
}

// A value equal to what the documents propose is not stored as the member's.
function saveValue(context: FieldContext, path: string, raw: string) {
  const state = context.states[path];
  if (!state) return;
  const value = fieldValue(path, raw);
  if (state.value !== null && value !== null && sameEntry(state.value, value)) return;
  if (state.value === null && value === null) return;
  const rest = withoutKeys(context.changes.fields[path], 'value', 'option');
  if (state.anaf && value !== null && sameEntry(state.anaf.documents, value)) {
    context.review.setField(path, { option: state.anaf.documentsOption });
  } else if (
    state.proposedValue !== null &&
    value !== null &&
    sameEntry(state.proposedValue, value) &&
    !state.anaf
  ) {
    context.review.setField(path, Object.keys(rest).length ? rest : null);
  } else {
    context.review.setField(path, { ...rest, value });
  }
}

const clientShape = clientFormSchema.shape;

const isClientField = (path: string) =>
  path.startsWith('client.') && Object.hasOwn(clientShape, path.split('.')[1]!);

const formSchema = (paths: string[]) => {
  const clientNames = paths.filter(isClientField).map((path) => path.split('.')[1]!);
  const others = paths.filter((path) => !isClientField(path));
  const picked = clientFormSchema.pick(
    Object.fromEntries(clientNames.map((name) => [name, true])) as Record<
      keyof ClientFormValues,
      true
    >
  );
  return picked.extend(
    Object.fromEntries(
      others.map((path) => [
        fieldKey(path),
        path === 'fireSafety.wasteKinds'
          ? z.string().trim().max(3000, 'Cel mult 3000 de caractere.')
          : z.string().trim().max(240, 'Cel mult 240 de caractere.'),
      ])
    )
  );
};

function fieldKey(path: string) {
  return isClientField(path) ? path.split('.')[1]! : path.replace('.', '__');
}

// Client fields by their own name, the others by `fieldKey`.
type EditValues = ClientFormValues & Record<string, string | boolean>;

const nounOf = (path: string, kind: 'choose' | 'write') =>
  (fieldInfo[path]?.[kind] ?? path).replace(/^\S+\s/, '');

function pendingOf(state: FieldState, context: FieldContext): string | null {
  if (!appliesAt(context.states, state.path)) return null;
  if (
    state.path === smokingPlacePath &&
    smokingPlaceAsked(context.states) &&
    smokingPlaceDecision(state, context.changes.fields[state.path]) === null
  ) {
    return 'de confirmat locul pentru fumat';
  }
  if (state.status === 'choice') return `de ales ${nounOf(state.path, 'choose')}`;
  if (state.anaf?.picked === null) return `de văzut ${nounOf(state.path, 'choose')}`;
  if (state.value === null && requiredPaths.has(state.path) && !context.existingClient) {
    return `de completat ${nounOf(state.path, 'write')}`;
  }
  if (
    context.blockers.some((blocker) => blocker.path === state.path && blocker.code === 'invalid')
  ) {
    return `de corectat ${nounOf(state.path, 'write')}`;
  }
  return null;
}

function pendingLine(states: FieldState[], context: FieldContext) {
  const pending = states.flatMap((state) => pendingOf(state, context) ?? []);
  if (pending.length === 0) return null;
  return pending.length === 1
    ? `Mai ai ${pending[0]}`
    : `Mai ai ${pending.length} lucruri de făcut`;
}

export function FieldCard({
  title,
  icon: Icon,
  description,
  pending,
  testId = 'review-group',
  children,
}: {
  title: string;
  icon: LucideIcon;
  description: ReactNode;
  // Undefined where the card asks nothing of the member.
  pending?: string | null;
  testId?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      data-testid={testId}
      aria-labelledby={`${id}-title`}
      className="overflow-hidden rounded-xl border bg-card shadow-xs"
    >
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3 px-4 py-4 sm:flex-nowrap sm:px-5">
        <span className="flex size-10 shrink-0 items-center justify-center self-start rounded-[10px] bg-secondary sm:self-center">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="grid min-w-0 flex-1 basis-56 gap-0.5">
          <h2 id={`${id}-title`} className="text-base leading-snug font-semibold">
            {title}
          </h2>
          <p className="text-[13px] text-muted-foreground">
            <span className="hidden sm:inline">{description}</span>
            <span className="sm:hidden">
              Textul din fiecare rând e cel care intră în documente.
            </span>
          </p>
        </div>
        {pending !== undefined && (
          <div className="w-full sm:w-auto sm:shrink-0">
            <PendingNote line={pending} testId="review-group-pending" />
          </div>
        )}
      </div>
      <div
        aria-hidden="true"
        className="hidden border-t border-border/70 bg-muted/50 px-5 py-2 text-xs font-semibold text-muted-foreground sm:grid sm:grid-cols-[1.25rem_12rem_minmax(0,1fr)] sm:gap-x-4"
      >
        <span />
        <span>Câmpul</span>
        <span>Ce intră în documente</span>
      </div>
      {children}
    </section>
  );
}

function FieldEditor({
  state,
  context,
  onDone,
}: {
  state: FieldState;
  context: FieldContext;
  onDone: () => void;
}) {
  const formId = useId();
  const path = state.path;
  const key = fieldKey(path);
  const id = `review-input-${key}`;
  const text = state.value === null ? '' : String(state.value);
  const defaults: EditValues = {
    ...emptyClientForm,
    [key]: path === 'client.cui' ? (normalizeCui(text)?.cui ?? text) : text,
  };
  const withVatPayer = path === 'client.cui' && !context.existingClient;
  if (withVatPayer) defaults.vatPayer = context.vatPayer;
  const form = useForm<EditValues>({
    // The schema is picked per field at run time, so its inferred type cannot name the field's key.
    resolver: zodResolver(
      withVatPayer ? formSchema([path]).extend({ vatPayer: z.boolean() }) : formSchema([path])
    ) as unknown as Resolver<EditValues>,
    defaultValues: defaults,
  });
  const clientForm: UseFormReturn<ClientFormValues> = form;
  const error = form.formState.errors[key];
  const describedBy = error ? `${id}-error` : `${id}-hint`;
  const onSubmit = form.handleSubmit((values) => {
    saveValue(context, path, String(values[key] ?? ''));
    if (withVatPayer) {
      const typed = normalizeCui(values.cui);
      saveVatPayer(context, values.vatPayer || Boolean(typed?.vatPrefix), typed?.cui);
    }
    onDone();
  });
  const yesNo = yesNoLabels[path];
  const options: (readonly [string, string])[] | null = yesNo
    ? (Object.entries(yesNo) as [string, string][])
    : path === 'fireSafety.smokingPolicy'
      ? fireSmokingPolicies.map((policy) => [policy, fireSmokingPolicyLabels[policy]] as const)
      : null;
  const comboProps = {
    id,
    onBlur: () => undefined,
    invalid: Boolean(error),
    describedBy,
  };
  const hint =
    path === 'fireSafety.wasteKinds'
      ? 'Desparte tipurile de deșeuri cu punct și virgulă.'
      : path === 'client.cui'
        ? 'Cu sau fără prefixul RO, de exemplu RO1590082.'
        : 'Ce salvezi aici intră în documente în locul valorii din import.';

  return (
    <DecisionRow
      tone="editing"
      top
      wide
      id={anchorOf(path)}
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
        onSubmit={(event) => void onSubmit(event)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onDone();
        }}
      >
        {options ? (
          <NativeSelect
            id={id}
            className="w-full"
            autoFocus
            aria-describedby={describedBy}
            {...form.register(key)}
          >
            <NativeSelectOption value="">Nespecificat</NativeSelectOption>
            {options.map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : path === 'client.countyCode' || path === 'client.caenCode' ? (
          <Controller
            control={form.control}
            name={key}
            render={({ field }) => {
              const props = {
                ...comboProps,
                value: String(field.value ?? ''),
                onChange: field.onChange,
                onBlur: field.onBlur,
              };
              return path === 'client.countyCode' ? (
                <CountyCombobox {...props} />
              ) : (
                <CaenCombobox {...props} />
              );
            }}
          />
        ) : (
          <Input
            id={id}
            data-testid={id}
            className={undefined}
            autoFocus
            inputMode={undefined}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            {...form.register(key)}
          />
        )}
        {error && (
          <span id={`${id}-error`} role="alert" className="text-[13px] text-destructive">
            {error.message}
          </span>
        )}
        <span id={`${id}-hint`} className="text-[13px] text-muted-foreground">
          {hint}
        </span>
        {withVatPayer && (
          <VatPayerField
            form={clientForm}
            busy={false}
            id="review-input-vatPayer"
            testId="review-input-vatPayer"
          />
        )}
      </form>
    </DecisionRow>
  );
}

function rowActions(
  state: FieldState,
  context: FieldContext,
  onEdit?: () => void,
  sources: LabelledSource[] = state.sources
) {
  return (
    <>
      <SourceButton
        sources={sources}
        onOpen={() => context.openSource(state.label, sources, state.otherCompanyName)}
      />
      {onEdit && <EditButton onClick={onEdit} />}
    </>
  );
}

function ChoiceRow({ state, context }: { state: FieldState; context: FieldContext }) {
  const name = useId();
  const change = context.changes.fields[state.path];
  const isOther = change?.value !== undefined;
  const [other, setOther] = useState(isOther ? String(change?.value ?? '') : '');
  const [otherOpen, setOtherOpen] = useState(isOther);
  const [otherError, setOtherError] = useState<string | null>(null);
  const decided = change?.option !== undefined || isOther;
  const person =
    state.path === 'client.legalRepresentativeName' || state.path === 'client.contactName';
  const phones =
    state.path === 'client.contactPhone'
      ? phoneDiff(state.own.map((index) => String(state.options[index]!.value)))
      : null;
  return (
    <DecisionRow
      tone={decided ? 'done' : 'todo'}
      top
      wide
      id={anchorOf(state.path)}
      testId="review-choice"
      label={<span id={`${name}-label`}>{state.label}</span>}
    >
      <KindLine icon={<Split aria-hidden="true" />} tone={decided ? undefined : 'warning'}>
        Documentele dau {state.own.length} variante. Alege-o pe cea de acum.
      </KindLine>
      {phones?.some((runs) => runs.some((run) => run.changed)) && (
        <RowNote testId="review-phone-differs">Numerele diferă prin cifrele marcate.</RowNote>
      )}
      <PickList labelledBy={`${name}-label`}>
        {state.own.map((index, position) => {
          const option = state.options[index]!;
          const value = formatFieldValue(state.path, option.value, context.vatPayer);
          return (
            <PickOption
              key={index}
              name={name}
              checked={!otherOpen && change?.option === index}
              onPick={() => {
                setOtherOpen(false);
                context.review.setField(state.path, { option: index });
              }}
              heading={<SourceFileNames sources={option.sources} />}
              action={
                <SourceButton
                  sources={option.sources}
                  onOpen={() => context.openSource(value, option.sources)}
                />
              }
            >
              {phones ? <PhoneDigits runs={phones[position]!} /> : value}
            </PickOption>
          );
        })}
        <PickOption
          name={name}
          checked={otherOpen}
          inDocuments={isOther}
          onPick={() => setOtherOpen(true)}
          heading={person ? 'Altă persoană' : 'Altă valoare'}
          below={
            otherOpen && (
              <form
                className="grid gap-1.5"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  const problem = fieldProblem(state.path, other);
                  setOtherError(problem);
                  if (problem) return;
                  context.review.setField(state.path, { value: fieldValue(state.path, other) });
                }}
              >
                <span className="flex flex-wrap gap-2">
                  <Input
                    aria-label={state.label}
                    data-testid="review-other-value"
                    className="max-w-sm"
                    autoFocus={!isOther}
                    aria-invalid={Boolean(otherError)}
                    aria-describedby={otherError ? `${name}-other-error` : undefined}
                    value={other}
                    onChange={(event) => setOther(event.target.value)}
                  />
                  <Button type="submit" variant="outline">
                    Folosește
                  </Button>
                </span>
                {otherError && (
                  <span id={`${name}-other-error`} className="text-[13px] text-destructive">
                    {otherError}
                  </span>
                )}
              </form>
            )
          }
        >
          {!otherOpen && (
            <span className="text-muted-foreground">
              O scrii tu, dacă niciuna nu mai e valabilă.
            </span>
          )}
        </PickOption>
      </PickList>
    </DecisionRow>
  );
}

function factProblem(noun: string, raw: string) {
  const text = raw.trim();
  if (text === '') return `Scrie ${noun}.`;
  if (text.length < 2) return 'Scrie cel puțin 2 caractere.';
  if (text.length > 240) return 'Cel mult 240 de caractere.';
  return null;
}

export type FactOption = { option: number; value: string; sources: LabelledSource[] };

export function FactRow({
  id,
  label,
  noun,
  options,
  decision,
  onKeep,
  onWrite,
  onEmpty,
  openSource,
  below,
  note = 'Apare pe ce se afișează la locul de muncă, iar dosarele îl preiau des neschimbat de la alt client. Păstrează-l doar dacă e cel real.',
}: {
  id: string;
  label: string;
  noun: string;
  note?: string;
  options: FactOption[];
  decision: FactDecision;
  onKeep: (option: number) => void;
  onWrite: (value: string) => void;
  onEmpty: () => void;
  openSource: OpenSource;
  below?: ReactNode;
}) {
  const name = useId();
  const written = decision?.kind === 'other' ? decision.value : '';
  const [other, setOther] = useState(written);
  const [otherOpen, setOtherOpen] = useState(decision?.kind === 'other');
  const [otherError, setOtherError] = useState<string | null>(null);
  const done = decision !== null;
  return (
    <DecisionRow
      tone={done ? 'done' : 'todo'}
      top
      wide
      id={id}
      testId="review-fact"
      label={<span id={`${name}-label`}>{label}</span>}
    >
      <KindLine icon={<MapPin aria-hidden="true" />} tone={done ? undefined : 'warning'}>
        {note}
      </KindLine>
      <PickList labelledBy={`${name}-label`}>
        {options.map((option) => (
          <PickOption
            key={option.option}
            name={name}
            checked={!otherOpen && decision?.kind === 'keep' && decision.option === option.option}
            onPick={() => {
              setOtherOpen(false);
              onKeep(option.option);
            }}
            heading={<SourceFileNames sources={option.sources} />}
            testId="review-fact-keep"
            action={
              <SourceButton
                sources={option.sources}
                onOpen={() => openSource(`${label}: ${option.value}`, option.sources)}
              />
            }
          >
            {option.value}
          </PickOption>
        ))}
        <PickOption
          name={name}
          checked={otherOpen}
          inDocuments={decision?.kind === 'other'}
          onPick={() => setOtherOpen(true)}
          heading="Altă valoare"
          testId="review-fact-other"
          below={
            otherOpen && (
              <form
                className="grid gap-1.5"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  const problem = factProblem(noun, other);
                  setOtherError(problem);
                  if (!problem) onWrite(other.trim());
                }}
              >
                <span className="flex flex-wrap gap-2">
                  <Input
                    aria-label={label}
                    data-testid="review-fact-value"
                    className="max-w-sm"
                    autoFocus={decision?.kind !== 'other'}
                    aria-invalid={Boolean(otherError)}
                    aria-describedby={otherError ? `${name}-other-error` : undefined}
                    value={other}
                    onChange={(event) => setOther(event.target.value)}
                  />
                  <Button type="submit" variant="outline">
                    Folosește
                  </Button>
                </span>
                {otherError && (
                  <span id={`${name}-other-error`} className="text-[13px] text-destructive">
                    {otherError}
                  </span>
                )}
              </form>
            )
          }
        >
          {!otherOpen && (
            <span className="text-muted-foreground">
              O scrii tu, dacă documentele nu o dau pe cea reală.
            </span>
          )}
        </PickOption>
        <PickOption
          name={name}
          checked={!otherOpen && decision?.kind === 'empty'}
          inDocuments={false}
          onPick={() => {
            setOtherOpen(false);
            onEmpty();
          }}
          heading="Lasă necompletat"
          testId="review-fact-empty"
        >
          <span className="text-muted-foreground">
            Nu se preia. Îl completezi pe fișa clientului când îl afli.
          </span>
        </PickOption>
      </PickList>
      {below}
    </DecisionRow>
  );
}

function SmokingPlaceRow({ state, context }: { state: FieldState; context: FieldContext }) {
  const change = context.changes.fields[state.path];
  const rest = withoutKeys(change, 'option', 'value', 'included');
  const spelling = fieldSpelling(state, change);
  return (
    <FactRow
      id={anchorOf(state.path)}
      label={state.label}
      noun="locul pentru fumat"
      options={state.own.map((index) => ({
        option: index,
        value: formatFieldValue(state.path, state.options[index]!.value),
        sources: state.options[index]!.sources,
      }))}
      decision={smokingPlaceDecision(state, change)}
      onKeep={(option) => {
        const written = state.options[option]?.spelling;
        const keepsWritten = written !== undefined && change?.value === written;
        context.review.setField(state.path, {
          ...rest,
          option,
          ...(keepsWritten ? { value: written } : {}),
        });
      }}
      onWrite={(value) => context.review.setField(state.path, { ...rest, value })}
      onEmpty={() => context.review.setField(state.path, { ...rest, value: null })}
      openSource={context.openSource}
      below={
        spelling && (
          <SpellingChoice
            label={state.label}
            corrected={spelling.corrected}
            written={spelling.written}
            keptWritten={spelling.keptWritten}
            onPick={(keep) => {
              const others = withoutKeys(change, 'value');
              context.review.setField(
                state.path,
                keep
                  ? { ...others, value: spelling.written }
                  : Object.keys(others).length
                    ? others
                    : null
              );
            }}
          />
        )
      }
    />
  );
}

function AnafRow({
  state,
  context,
  onEdit,
}: {
  state: FieldState;
  context: FieldContext;
  onEdit: () => void;
}) {
  const name = useId();
  const anaf = state.anaf!;
  const cui = context.registered?.cui ?? '';
  const documentsSources = state.options[anaf.documentsOption]?.sources ?? [];
  const pickAnaf = () => context.review.setField(state.path, { value: anaf.name });
  return (
    <DecisionRow
      tone={anaf.picked === null ? 'todo' : 'done'}
      top
      wide
      id={anchorOf(state.path)}
      testId="review-anaf-choice"
      label={<span id={`${name}-label`}>{state.label}</span>}
      actions={rowActions(state, context, onEdit, documentsSources)}
    >
      <KindLine
        icon={<TriangleAlert aria-hidden="true" />}
        tone={anaf.picked === null ? 'warning' : undefined}
      >
        Documentele dau altă denumire decât ANAF pentru CUI-ul {cui}
      </KindLine>
      <PickList labelledBy={`${name}-label`}>
        <PickOption
          name={name}
          checked={anaf.picked !== 'documents'}
          onPick={pickAnaf}
          heading={`La ANAF, pentru CUI ${cui}`}
          testId="review-anaf-pick"
        >
          {anaf.name}
        </PickOption>
        <PickOption
          name={name}
          checked={anaf.picked === 'documents'}
          onPick={() => context.review.setField(state.path, { option: anaf.documentsOption })}
          heading="În documente"
          testId="review-documents-pick"
        >
          {String(anaf.documents)}
        </PickOption>
      </PickList>
      {anaf.picked === null && (
        <RowNote>
          Am ales denumirea de la ANAF: e cea mai nouă și cea valabilă legal. Dacă ai dreptate cu
          documentele, verifică întâi CUI-ul.
        </RowNote>
      )}
    </DecisionRow>
  );
}

function MissingRow({
  state,
  context,
  onEdit,
}: {
  state: FieldState;
  context: FieldContext;
  onEdit: () => void;
}) {
  const yesNo = yesNoLabels[state.path];
  const required = requiredPaths.has(state.path);
  return (
    <DecisionRow
      tone={required ? 'todo' : 'optional'}
      wide
      id={anchorOf(state.path)}
      testId="review-row"
      label={state.label}
      actions={
        yesNo ? (
          <Segmented
            name={`${anchorOf(state.path)}-yes-no`}
            label={state.label}
            options={[
              { value: 'true', label: yesNo.true },
              { value: 'false', label: yesNo.false },
            ]}
            value={null}
            disabled={false}
            testIdPrefix="review-yes-no"
            onPick={(value) => context.review.setField(state.path, { value })}
          />
        ) : (
          <>
            <SourceButton
              sources={state.sources}
              onOpen={() => context.openSource(state.label, state.sources)}
            />
            <Button
              type="button"
              variant={required ? 'default' : 'outline'}
              data-testid="review-complete"
              onClick={onEdit}
            >
              <Plus aria-hidden="true" />
              Completează
            </Button>
          </>
        )
      }
    >
      <span className={required ? 'font-medium text-destructive' : 'text-muted-foreground'}>
        {required
          ? 'Lipsește din documente. E obligatoriu pentru crearea clientului.'
          : yesNo
            ? 'Opțional. Alege doar dacă ai această informație.'
            : 'Opțional. Completează doar dacă ai această informație.'}
      </span>
    </DecisionRow>
  );
}

function FieldRow({
  state,
  context,
  editing,
  onEdit,
  onDone,
}: {
  state: FieldState;
  context: FieldContext;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
}) {
  if (!appliesAt(context.states, state.path)) {
    return <NotApplicableRow state={state} context={context} />;
  }
  if (state.path === smokingPlacePath && smokingPlaceAsked(context.states)) {
    return <SmokingPlaceRow state={state} context={context} />;
  }
  if (editing) return <FieldEditor state={state} context={context} onDone={onDone} />;
  if (state.own.length > 1) return <ChoiceRow state={state} context={context} />;
  if (state.anaf) return <AnafRow state={state} context={context} onEdit={onEdit} />;
  if (state.status === 'missing' && (!context.existingClient || state.comparison === 'none')) {
    return <MissingRow state={state} context={context} onEdit={onEdit} />;
  }
  return <ValueRow state={state} context={context} onEdit={onEdit} />;
}

function ValueRow({
  state,
  context,
  onEdit,
}: {
  state: FieldState;
  context: FieldContext;
  onEdit: () => void;
}) {
  const change = context.changes.fields[state.path];
  const flags = flagsAt(context.proposal, state.path).filter(
    (flag) => flag.code !== 'missing' && flag.code !== 'legal_name_differs'
  );
  const registered = context.registered;
  const mismatch =
    requiredPaths.has(state.path) && !context.states['client.legalName']?.anaf
      ? anafMismatch(context.proposal, context.changes, registered)
      : null;
  const anafName =
    state.path === 'client.legalName' &&
    registered &&
    state.value !== null &&
    sameCompanyName(registered.legalName, String(state.value));
  const spelling = fieldSpelling(state, change);
  const inferred =
    state.edited || state.status !== 'value' || state.option === null
      ? null
      : inferenceNote(state.path, state.options[state.option]?.inferred);
  const anafCui =
    state.path === 'client.cui' &&
    registered &&
    !mismatch &&
    state.value !== null &&
    sameValue(registered.cui, String(state.value).replace(/^RO/i, ''));
  const edited = state.edited && !spelling?.keptWritten;
  const unticked = state.status === 'unticked';
  const ownValue = state.own.length > 0;
  const excludable = unticked || (!ownValue && change?.included === true);
  const tone: Tone = unticked
    ? 'info'
    : spelling
      ? 'spelling'
      : mismatch || flags.length > 0
        ? 'warning'
        : 'done';

  const row = (toggle?: ReactNode) => (
    <DecisionRow
      tone={tone}
      top={Boolean(spelling) || unticked}
      wide
      id={anchorOf(state.path)}
      testId="review-row"
      label={state.label}
      actions={rowActions(state, context, unticked ? undefined : onEdit)}
      toggle={toggle}
    >
      {unticked ? (
        <>
          <span className="text-muted-foreground wrap-anywhere">
            {formatFieldValue(
              state.path,
              state.options[state.own[0] ?? 0]?.value,
              context.vatPayer
            )}
          </span>
          {!ownValue && (
            <RowNote>
              <Copy className="mr-1 inline size-3.5" aria-hidden="true" />
              Posibil de la alt client: apare doar în pasaje copiate de la{' '}
              {endSentence(
                state.otherCompanyName ?? state.options[0]?.otherCompanyName ?? 'altă firmă'
              )}{' '}
              Valoarea se preia numai dacă o incluzi.
            </RowNote>
          )}
        </>
      ) : spelling ? (
        <SpellingChoice
          label={state.label}
          corrected={spelling.corrected}
          written={spelling.written}
          keptWritten={spelling.keptWritten}
          onPick={(keep) => {
            const rest = withoutKeys(change, 'value');
            context.review.setField(
              state.path,
              keep ? { ...rest, value: spelling.written } : Object.keys(rest).length ? rest : null
            );
          }}
        />
      ) : state.value === null ? (
        <span className="text-muted-foreground">Necompletat</span>
      ) : (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium wrap-anywhere">
            {formatFieldValue(state.path, state.value, context.vatPayer)}
          </span>
          {anafName && <AnafTag>Confirmat la ANAF</AnafTag>}
          {anafCui && !registered.inactive && <AnafTag>Firmă activă la ANAF</AnafTag>}
          {anafCui && registered.inactive && <Tag tone="warning">Firmă inactivă la ANAF</Tag>}
          {edited && <EditedTag />}
          {state.otherCompanyName && <Tag tone="info">De la {state.otherCompanyName}</Tag>}
        </span>
      )}
      {inferred && <RowNote testId="review-inferred">{inferred}</RowNote>}
      {edited && state.proposedValue !== null && (
        <RowNote>
          Din documente: {formatFieldValue(state.path, state.proposedValue, context.vatPayer)}
        </RowNote>
      )}
      {mismatch && (
        <RowNote tone="warning" testId="review-anaf-mismatch">
          {anafMismatchNote(mismatch)}
        </RowNote>
      )}
      {flags.map((flag) => (
        <RowNote key={`${flag.path}-${flag.code}`}>
          {flagNote(flag, context.proposal, context.changes)}
        </RowNote>
      ))}
    </DecisionRow>
  );
  if (!excludable) return row();
  return (
    <Includable
      id={`include-${state.path}`}
      name={state.label}
      included={!unticked}
      proposed={ownValue}
      agreement="feminine"
      testId="review-include-field"
      collapsedClassName="border-t border-border/70 px-4 py-3 sm:px-5"
      onChange={(included) =>
        context.review.setField(state.path, included === ownValue ? null : { included })
      }
    >
      {row}
    </Includable>
  );
}

function NotApplicableRow({ state, context }: { state: FieldState; context: FieldContext }) {
  const proposed = state.value ?? state.own.map((index) => state.options[index]?.value).join('; ');
  const forbidden =
    valueInForce(context.states['fireSafety.smokingPolicy']) === 'forbidden_everywhere';
  return (
    <DecisionRow
      tone="info"
      wide
      id={anchorOf(state.path)}
      testId="review-row"
      label={state.label}
      actions={rowActions(state, context)}
    >
      {proposed !== '' && (
        <span className="text-muted-foreground wrap-anywhere">
          {formatFieldValue(state.path, proposed)}
        </span>
      )}
      <RowNote testId="review-not-applicable">
        {forbidden
          ? 'Nu se aplică: fumatul e interzis peste tot, așa că locul nu se preia.'
          : 'Se preia doar dacă fumatul e permis în locurile amenajate.'}
      </RowNote>
    </DecisionRow>
  );
}

const groupLooks: Record<string, { icon: LucideIcon; description: string }> = {
  'Date firmă': { icon: Building2, description: 'Se preiau la crearea clientului.' },
  'Reprezentant legal': { icon: UserRound, description: 'Semnează documentele clientului.' },
  'Persoană de contact': { icon: Phone, description: 'Se trece pe fișa clientului.' },
  'Reguli de apărare împotriva incendiilor': {
    icon: Flame,
    description: 'Intră în documentele SU ale clientului.',
  },
};

function FieldRows({ states, context }: { states: FieldState[]; context: FieldContext }) {
  const [editing, setEditing] = useState<string | null>(null);
  return states.map((state) => (
    <FieldRow
      key={state.path}
      state={state}
      context={context}
      editing={editing === state.path}
      onEdit={() => setEditing(state.path)}
      onDone={() => setEditing(null)}
    />
  ));
}

export function FieldGroupCard({
  title,
  paths,
  context,
}: {
  title: string;
  paths: string[];
  context: FieldContext;
}) {
  const states = paths.map((path) => context.states[path]!);
  const look = groupLooks[title] ?? { icon: ClipboardList, description: '' };
  return (
    <FieldCard
      title={title}
      icon={look.icon}
      description={look.description}
      pending={pendingLine(states, context)}
    >
      <FieldRows states={states} context={context} />
    </FieldCard>
  );
}

export function ExistingFieldGroups({
  paths,
  context,
}: {
  paths: string[];
  context: FieldContext;
}) {
  const all = paths.map((path) => context.states[path]!);
  const isChoice = (state: FieldState) => state.own.length > 1;
  const choices = all.filter((state) => isChoice(state) && appliesAt(context.states, state.path));
  const states = all.filter(
    (state) => appliesAt(context.states, state.path) && !choices.includes(state)
  );
  const notApplicable = all.filter((state) => !appliesAt(context.states, state.path));
  const added = states.filter(
    (state) =>
      state.comparison === 'added' ||
      state.status === 'unticked' ||
      (state.comparison === 'none' && state.status !== 'choice')
  );
  const differs = states.filter(
    (state) => state.comparison === 'kept' || state.comparison === 'replaced'
  );
  const same = states.filter((state) => state.comparison === 'same');
  return (
    <>
      {choices.length > 0 && (
        <FieldCard
          title="De ales"
          icon={Split}
          description="Documentele dau mai multe variante pentru aceeași dată."
          pending={pendingLine(choices, context)}
          testId="review-choices"
        >
          {choices.map((state) =>
            state.path === smokingPlacePath ? (
              <SmokingPlaceRow key={state.path} state={state} context={context} />
            ) : (
              <ChoiceRow key={state.path} state={state} context={context} />
            )
          )}
        </FieldCard>
      )}
      {added.length > 0 && (
        <FieldCard
          testId="review-added"
          title={`Se adaugă · ${added.length}`}
          icon={Plus}
          description="Clientul nu are încă aceste date. Le preluăm din documente."
        >
          <FieldRows states={added} context={context} />
        </FieldCard>
      )}
      {differs.length > 0 && (
        <FieldCard
          testId="review-differs"
          title={`Diferă de aplicație · ${differs.length}`}
          icon={GitCompare}
          description="Clientul are deja o valoare, iar documentele scriu alta. Păstrăm valoarea ta dacă nu alegi altfel."
        >
          {differs.map((state) => (
            <DifferRow key={state.path} state={state} context={context} />
          ))}
        </FieldCard>
      )}
      {same.length + notApplicable.length > 0 && (
        <FieldCard
          testId="review-same"
          title={`Rămân la fel · ${same.length + notApplicable.length}`}
          icon={Equal}
          description="Aceleași în aplicație și în documente, sau doar în aplicație. Nu le schimbăm."
        >
          {same.map((state) => (
            <DecisionRow
              key={state.path}
              tone="done"
              wide
              id={anchorOf(state.path)}
              testId="review-row"
              label={state.label}
              actions={rowActions(state, context)}
            >
              <span className="font-medium">
                {formatFieldValue(state.path, state.existing, context.vatPayer)}
              </span>
              <RowNote>
                {state.value === null ? 'Doar în aplicație' : 'La fel în documente'}
              </RowNote>
            </DecisionRow>
          ))}
          {notApplicable.map((state) => (
            <NotApplicableRow key={state.path} state={state} context={context} />
          ))}
        </FieldCard>
      )}
    </>
  );
}

function DifferRow({ state, context }: { state: FieldState; context: FieldContext }) {
  const name = useId();
  const change = context.changes.fields[state.path];
  const replaced = state.comparison === 'replaced';
  const phones =
    state.path === 'client.contactPhone'
      ? phoneDiff([String(state.existing ?? ''), String(state.value ?? '')])
      : null;
  return (
    <DecisionRow
      tone="done"
      top
      wide
      id={anchorOf(state.path)}
      testId="review-differs-row"
      label={<span id={`${name}-label`}>{state.label}</span>}
    >
      <PickList labelledBy={`${name}-label`}>
        <PickOption
          name={name}
          checked={!replaced}
          onPick={() => {
            const rest = withoutKeys(change, 'replace');
            context.review.setField(state.path, Object.keys(rest).length ? rest : null);
          }}
          heading="În aplicație"
          testId="review-keep-app"
        >
          {phones ? (
            <PhoneDigits runs={phones[0]!} />
          ) : (
            formatFieldValue(state.path, state.existing, context.vatPayer)
          )}
        </PickOption>
        <PickOption
          name={name}
          checked={replaced}
          onPick={() => context.review.setField(state.path, { ...change, replace: true })}
          heading="În documente"
          testId="review-use-documents"
          action={
            <SourceButton
              sources={state.sources}
              onOpen={() => context.openSource(state.label, state.sources)}
            />
          }
        >
          {phones ? (
            <PhoneDigits runs={phones[1]!} />
          ) : (
            formatFieldValue(state.path, state.value, context.vatPayer)
          )}
        </PickOption>
      </PickList>
      {phones?.some((runs) => runs.some((run) => run.changed)) && (
        <RowNote testId="review-phone-differs">Numerele diferă prin cifrele marcate.</RowNote>
      )}
    </DecisionRow>
  );
}

export function FieldsSection({ section, context }: { section: SectionId; context: FieldContext }) {
  if (section === 'training') {
    return (
      <>
        <TrainingImportCard domain="ssm" context={context} />
        <TrainingImportCard domain="su" context={context} />
      </>
    );
  }
  const groups = fieldGroups.filter((group) => group.section === section);
  if (context.existingClient) {
    return <ExistingFieldGroups paths={groups.flatMap((group) => group.paths)} context={context} />;
  }
  return groups.map((group) => (
    <FieldGroupCard key={group.title} title={group.title} paths={group.paths} context={context} />
  ));
}
