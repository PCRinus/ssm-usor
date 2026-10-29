import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CountyCode,
  countyNames,
  fireSmokingPolicies,
  fireSmokingPolicyLabels,
  normalizeCui,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { Input } from '@ssm-usor/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Check, Copy, Split } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Field } from '@/components/form-field';
import {
  ContactFields,
  RegisteredOfficeFields,
  RegistrationFields,
} from '@/features/clients/client-fields';
import {
  clientFormSchema,
  type ClientFormValues,
  emptyClientForm,
} from '@/features/clients/client-form-schema';

import { endSentence } from './import-format';
import {
  anafMismatch,
  anafMismatchNote,
  anchorOf,
  type Changes,
  fieldGroups,
  fieldInfo,
  type FieldState,
  flagNote,
  flagsAt,
  formatFieldValue,
  integerPaths,
  intervalOfNotApplicable,
  type LabelledSource,
  type Proposal,
  type RegisteredCompany,
  sameCompanyName,
  sameValue,
  type SectionId,
  sourceFilesCount,
  yesNoLabels,
} from './review-model';
import {
  AnafTag,
  EditButton,
  EditedTag,
  LinkButton,
  ReviewCard,
  RowNote,
  SourceButton,
  SummaryRow,
  Tag,
} from './review-parts';
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
  registered: RegisteredCompany | null;
  existingClient: boolean;
  openSource: OpenSource;
};

function shown(state: FieldState, vatPayer: boolean) {
  return formatFieldValue(state.path, state.value, vatPayer);
}

function fieldValue(path: string, raw: string): string | number | null {
  const text = raw.trim();
  if (text === '') return null;
  if (integerPaths.has(path)) return Number(text);
  if (path === 'client.cui') return normalizeCui(text)?.cui ?? text;
  return text;
}

function fieldProblem(path: string, raw: string) {
  if (raw.trim() === '') return `${fieldInfo[path]?.write ?? 'Scrie o valoare'}.`;
  const checked = formSchema([path]).safeParse({ [fieldKey(path)]: raw });
  return checked.success ? null : (checked.error.issues[0]?.message ?? 'Valoare greșită.');
}

// A value equal to what the documents propose is not stored as the member's.
function saveValues(context: FieldContext, values: Record<string, string>) {
  for (const [path, raw] of Object.entries(values)) {
    const state = context.states[path];
    if (!state) continue;
    const value = fieldValue(path, raw);
    if (state.value !== null && value !== null && sameValue(state.value, value)) continue;
    if (state.value === null && value === null) continue;
    const current = context.changes.fields[path] ?? {};
    const rest = Object.fromEntries(
      Object.entries(current).filter(([key]) => key !== 'value' && key !== 'option')
    );
    if (state.proposedValue !== null && value !== null && sameValue(state.proposedValue, value)) {
      context.review.setField(path, Object.keys(rest).length ? rest : null);
    } else {
      context.review.setField(path, { ...rest, value });
    }
  }
}

export function ChoiceBlock({ state, context }: { state: FieldState; context: FieldContext }) {
  const name = useId();
  const change = context.changes.fields[state.path];
  const own = state.own;
  const isOther = change?.value !== undefined;
  const [other, setOther] = useState(isOther ? String(change?.value ?? '') : '');
  const [otherOpen, setOtherOpen] = useState(isOther);
  const [otherError, setOtherError] = useState<string | null>(null);
  const decided = change?.option !== undefined || isOther;
  const info = fieldInfo[state.path];
  const person =
    state.path === 'client.legalRepresentativeName' || state.path === 'client.contactName';
  return (
    <section
      id={anchorOf(state.path)}
      data-testid="review-choice"
      className="grid scroll-mt-32 gap-3 rounded-xl border border-warning-border bg-warning/40 px-5 py-4"
      aria-labelledby={`${name}-title`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Split className="size-4 text-warning-foreground" aria-hidden="true" />
        <h2 id={`${name}-title`} className="text-base font-semibold">
          {info?.choose ?? state.label}
        </h2>
        {decided && (
          <Tag tone="success" icon={<Check aria-hidden="true" />}>
            Ales de tine
          </Tag>
        )}
      </div>
      <p className="text-sm">Documentele dau {own.length} variante. Alege-o pe cea de acum.</p>
      <div role="radiogroup" aria-labelledby={`${name}-title`} className="grid gap-2">
        {own.map((index) => {
          const option = state.options[index]!;
          const files = sourceFilesCount(option.sources);
          return (
            <label
              key={index}
              className="grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)] items-start gap-3 rounded-lg border bg-card px-3 py-2.5 sm:grid-cols-[1rem_minmax(0,1fr)_auto]"
            >
              <input
                type="radio"
                name={name}
                className="mt-1 accent-primary"
                checked={change?.option === index}
                onChange={() => {
                  setOtherOpen(false);
                  context.review.setField(state.path, { option: index });
                }}
              />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">
                  {formatFieldValue(state.path, option.value, context.vatPayer)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {files === 1 ? 'Într-un fișier' : `În ${files} fișiere`}
                </span>
              </span>
              <span className="col-start-2 sm:col-start-auto">
                <SourceButton
                  sources={option.sources}
                  onOpen={() =>
                    context.openSource(
                      formatFieldValue(state.path, option.value, context.vatPayer),
                      option.sources
                    )
                  }
                />
              </span>
            </label>
          );
        })}
        <label className="grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)] items-start gap-3 rounded-lg border bg-card px-3 py-2.5">
          <input
            type="radio"
            name={name}
            className="mt-1 accent-primary"
            checked={otherOpen}
            onChange={() => setOtherOpen(true)}
          />
          <span className="grid gap-2">
            <span className="text-sm font-medium">{person ? 'Altă persoană' : 'Altă valoare'}</span>
            {otherOpen && (
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
                    className="h-9 max-w-xs"
                    inputMode={integerPaths.has(state.path) ? 'numeric' : undefined}
                    aria-invalid={Boolean(otherError)}
                    aria-describedby={otherError ? `${name}-other-error` : undefined}
                    value={other}
                    onChange={(event) => setOther(event.target.value)}
                  />
                  <Button type="submit" size="sm" variant="outline">
                    Folosește
                  </Button>
                </span>
                {otherError && (
                  <span id={`${name}-other-error`} className="text-[13px] text-destructive">
                    {otherError}
                  </span>
                )}
              </form>
            )}
          </span>
        </label>
      </div>
    </section>
  );
}

function FieldRow({
  state,
  context,
  onEdit,
}: {
  state: FieldState;
  context: FieldContext;
  onEdit?: () => void;
}) {
  const flags = flagsAt(context.proposal, state.path).filter(
    (flag) => flag.code !== 'missing' && flag.code !== 'legal_name_differs'
  );
  const required = state.path === 'client.legalName' || state.path === 'client.cui';
  const registered = context.registered;
  const mismatch = required ? anafMismatch(context.proposal, context.changes, registered) : null;
  const anafName =
    state.path === 'client.legalName' &&
    registered &&
    state.value !== null &&
    sameCompanyName(registered.legalName, String(state.value));
  const anafCui =
    state.path === 'client.cui' &&
    registered &&
    !mismatch &&
    state.value !== null &&
    sameValue(registered.cui, String(state.value).replace(/^RO/i, ''));
  return (
    <SummaryRow
      id={anchorOf(state.path)}
      label={state.label}
      actions={
        <>
          <SourceButton
            sources={state.sources}
            onOpen={() => context.openSource(state.label, state.sources, state.otherCompanyName)}
          />
          {onEdit && <EditButton onClick={onEdit} />}
        </>
      }
    >
      {state.status === 'unticked' ? (
        <>
          <label className="flex items-start gap-2">
            <Checkbox
              className="mt-0.5"
              data-testid="review-include-field"
              checked={false}
              onCheckedChange={() => context.review.setField(state.path, { included: true })}
              aria-label={`Preia ${state.label.toLowerCase()}`}
            />
            <span className="text-muted-foreground">
              {formatFieldValue(
                state.path,
                state.options[state.own[0] ?? 0]?.value,
                context.vatPayer
              )}
            </span>
          </label>
          <RowNote>
            <Copy className="mr-1 inline size-3.5" aria-hidden="true" />
            Posibil de la alt client: apare doar în pasaje copiate de la{' '}
            {endSentence(
              state.otherCompanyName ?? state.options[0]?.otherCompanyName ?? 'altă firmă'
            )}{' '}
            Îl preluăm numai dacă îl bifezi.
          </RowNote>
        </>
      ) : state.status === 'choice' ? (
        <RowNote>Alege mai sus una dintre variantele din documente.</RowNote>
      ) : state.value === null ? (
        <span className={required ? 'font-medium text-destructive' : 'text-muted-foreground'}>
          {required ? 'Lipsește, e obligatoriu' : 'Lipsește din documente'}
        </span>
      ) : (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium wrap-anywhere">{shown(state, context.vatPayer)}</span>
          {anafName && <AnafTag>Confirmat la ANAF</AnafTag>}
          {anafCui && !registered.inactive && <AnafTag>Firmă activă la ANAF</AnafTag>}
          {anafCui && registered.inactive && <Tag tone="warning">Firmă inactivă la ANAF</Tag>}
          {state.edited && <EditedTag />}
          {state.otherCompanyName && <Tag tone="info">De la {state.otherCompanyName}</Tag>}
        </span>
      )}
      {state.edited && state.proposedValue !== null && (
        <RowNote>
          Propus din documente:{' '}
          {formatFieldValue(state.path, state.proposedValue, context.vatPayer)}
        </RowNote>
      )}
      {state.status !== 'unticked' && context.changes.fields[state.path]?.included === true && (
        <LinkButton
          className="w-fit text-[13px]"
          onClick={() => context.review.setField(state.path, null)}
        >
          Nu-l prelua
        </LinkButton>
      )}
      {state.value === 'true' &&
        intervalOfNotApplicable[state.path] &&
        context.states[intervalOfNotApplicable[state.path]!]?.value != null && (
          <RowNote tone="danger">
            Documentele dau și o periodicitate. Păstrează doar una dintre ele.
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
    </SummaryRow>
  );
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
        integerPaths.has(path)
          ? z
              .string()
              .trim()
              .regex(/^([0-9]{1,4})?$/, 'Scrie un număr întreg.')
          : path === 'fireSafety.wasteKinds'
            ? z.string().trim().max(3000, 'Cel mult 3000 de caractere.')
            : z.string().trim().max(240, 'Cel mult 240 de caractere.'),
      ])
    )
  );
};

function fieldKey(path: string) {
  return isClientField(path) ? path.split('.')[1]! : path.replace('.', '__');
}

function GroupForm({
  paths,
  context,
  onDone,
}: {
  paths: string[];
  context: FieldContext;
  onDone: () => void;
}) {
  const defaults: Record<string, string> = { ...emptyClientForm } as unknown as Record<
    string,
    string
  >;
  for (const path of paths) {
    const value = context.states[path]?.value;
    defaults[fieldKey(path)] = value === null || value === undefined ? '' : String(value);
  }
  const form = useForm<Record<string, string>>({
    resolver: zodResolver(formSchema(paths)) as never,
    defaultValues: defaults,
  });
  const clientForm = form as unknown as Parameters<typeof RegistrationFields>[0]['form'];
  const has = (...names: string[]) => names.every((name) => paths.includes(`client.${name}`));
  const errors = form.formState.errors;
  const onSubmit = form.handleSubmit((values) => {
    saveValues(
      context,
      Object.fromEntries(paths.map((path) => [path, values[fieldKey(path)] ?? '']))
    );
    onDone();
  });
  const plain = paths.filter((path) => !covered(path, has));
  return (
    <form
      data-testid="review-group-form"
      className="grid gap-5 pt-3 sm:grid-cols-2"
      noValidate
      onSubmit={(event) => void onSubmit(event)}
    >
      {plain.map((path) => {
        const key = fieldKey(path);
        const id = `review-input-${key}`;
        const error = errors[key];
        const info = fieldInfo[path];
        const yesNo = yesNoLabels[path];
        if (path === 'client.countyCode' || path === 'fireSafety.smokingPolicy' || yesNo) {
          const options = yesNo
            ? (Object.entries(yesNo) as [string, string][])
            : path === 'client.countyCode'
              ? (Object.entries(countyNames) as [CountyCode, string][])
              : fireSmokingPolicies.map(
                  (policy) => [policy, fireSmokingPolicyLabels[policy]] as const
                );
          return (
            <Field
              key={path}
              id={id}
              label={info?.label ?? path}
              error={error}
              className="sm:col-span-2"
            >
              <NativeSelect id={id} className="w-full" {...form.register(key)}>
                <NativeSelectOption value="">Nespecificat</NativeSelectOption>
                {options.map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          );
        }
        return (
          <Field
            key={path}
            id={id}
            label={info?.label ?? path}
            mark={path === 'client.legalName' || path === 'client.cui' ? 'required' : 'optional'}
            hint={
              path === 'fireSafety.wasteKinds'
                ? 'Desparte tipurile de deșeuri cu punct și virgulă.'
                : undefined
            }
            error={error}
            className={integerPaths.has(path) ? undefined : 'sm:col-span-2'}
          >
            <Input
              id={id}
              data-testid={id}
              inputMode={integerPaths.has(path) ? 'numeric' : undefined}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : undefined}
              {...form.register(key)}
            />
          </Field>
        );
      })}
      {has('caenCode', 'tradeRegisterNumber') && (
        <RegistrationFields form={clientForm} busy={false} />
      )}
      {has('countyCode', 'locality', 'addressLine') && (
        <RegisteredOfficeFields form={clientForm} busy={false} />
      )}
      {has('contactName', 'contactEmail', 'contactPhone') && (
        <ContactFields form={clientForm} busy={false} />
      )}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" data-testid="review-group-save">
          Salvează
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Renunță
        </Button>
      </div>
    </form>
  );
}

const covered = (path: string, has: (...names: string[]) => boolean) => {
  if (!path.startsWith('client.')) return false;
  const name = path.split('.')[1]!;
  if (['caenCode', 'tradeRegisterNumber'].includes(name))
    return has('caenCode', 'tradeRegisterNumber');
  if (['countyCode', 'locality', 'addressLine'].includes(name))
    return has('countyCode', 'locality', 'addressLine');
  if (['contactName', 'contactEmail', 'contactPhone'].includes(name))
    return has('contactName', 'contactEmail', 'contactPhone');
  return false;
};

export function FieldGroupCard({
  title,
  paths,
  context,
}: {
  title: string;
  paths: string[];
  context: FieldContext;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <ReviewCard
      title={title}
      testId="review-group"
      description={
        editing
          ? 'Completate cu valorile propuse. Ce salvezi aici se preia la crearea clientului.'
          : undefined
      }
    >
      {editing ? (
        <GroupForm paths={paths} context={context} onDone={() => setEditing(false)} />
      ) : (
        <dl className="divide-y">
          {paths.map((path) => (
            <FieldRow
              key={path}
              state={context.states[path]!}
              context={context}
              onEdit={
                context.states[path]!.status === 'unticked' ? undefined : () => setEditing(true)
              }
            />
          ))}
        </dl>
      )}
    </ReviewCard>
  );
}

export function ExistingFieldGroups({
  paths,
  context,
}: {
  paths: string[];
  context: FieldContext;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const states = paths.map((path) => context.states[path]!);
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
  const group = (
    testId: string,
    title: string,
    text: string,
    rows: FieldState[],
    render: (state: FieldState) => ReactNode
  ) =>
    rows.length > 0 && (
      <ReviewCard testId={testId} title={`${title} · ${rows.length}`} description={text}>
        <dl className="divide-y">{rows.map(render)}</dl>
      </ReviewCard>
    );
  return (
    <>
      {group(
        'review-added',
        'Se adaugă',
        'Clientul nu are încă aceste date. Le preluăm din documente.',
        added,
        (state) =>
          editing === state.path ? (
            <div key={state.path} className="py-3">
              <GroupForm paths={[state.path]} context={context} onDone={() => setEditing(null)} />
            </div>
          ) : (
            <FieldRow
              key={state.path}
              state={state}
              context={context}
              onEdit={state.status === 'unticked' ? undefined : () => setEditing(state.path)}
            />
          )
      )}
      {group(
        'review-differs',
        'Diferă de aplicație',
        'Clientul are deja o valoare, iar documentele scriu alta. Păstrăm valoarea ta dacă nu alegi altfel.',
        differs,
        (state) => (
          <DifferRow key={state.path} state={state} context={context} />
        )
      )}
      {group(
        'review-same',
        'Rămân la fel',
        'Aceleași în aplicație și în documente, sau doar în aplicație. Nu le schimbăm.',
        same,
        (state) => (
          <SummaryRow
            key={state.path}
            id={anchorOf(state.path)}
            label={state.label}
            actions={
              <SourceButton
                sources={state.sources}
                onOpen={() => context.openSource(state.label, state.sources)}
              />
            }
          >
            <span className="font-medium">
              {formatFieldValue(state.path, state.existing, context.vatPayer)}
            </span>
            <RowNote>{state.value === null ? 'Doar în aplicație' : 'La fel în documente'}</RowNote>
          </SummaryRow>
        )
      )}
    </>
  );
}

function DifferRow({ state, context }: { state: FieldState; context: FieldContext }) {
  const change = context.changes.fields[state.path] ?? {};
  const documents = formatFieldValue(state.path, state.value, context.vatPayer);
  const app = formatFieldValue(state.path, state.existing, context.vatPayer);
  const file = state.sources[0]?.file.split('/').at(-1);
  return (
    <SummaryRow
      id={anchorOf(state.path)}
      label={state.label}
      testId="review-differs-row"
      actions={
        <SourceButton
          sources={state.sources}
          onOpen={() => context.openSource(state.label, state.sources)}
        />
      }
    >
      {state.comparison === 'kept' ? (
        <>
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">
              Rămâne {app}{' '}
              <span className="font-normal text-muted-foreground">(din aplicație)</span>
            </span>
            <Tag tone="muted">Păstrăm valoarea ta</Tag>
          </span>
          <RowNote>
            În documente: {documents}
            {file ? `, din ${file}` : ''}
          </RowNote>
          <LinkButton
            className="w-fit text-left"
            data-testid="review-use-documents"
            onClick={() => context.review.setField(state.path, { ...change, replace: true })}
          >
            Folosește valoarea din documente: {documents}
          </LinkButton>
        </>
      ) : (
        <>
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{documents}</span>
            <Tag tone="info">Ales de tine din documente</Tag>
          </span>
          <RowNote>În aplicație: {app}</RowNote>
          <LinkButton
            className="w-fit text-left"
            data-testid="review-keep-app"
            onClick={() => {
              const rest = Object.fromEntries(
                Object.entries(change).filter(([key]) => key !== 'replace')
              );
              context.review.setField(state.path, Object.keys(rest).length ? rest : null);
            }}
          >
            Păstrează valoarea din aplicație: {app}
          </LinkButton>
        </>
      )}
    </SummaryRow>
  );
}

export function FieldsSection({ section, context }: { section: SectionId; context: FieldContext }) {
  const groups = fieldGroups.filter((group) => group.section === section);
  const paths = groups.flatMap((group) => group.paths);
  const choices = paths.filter((path) => (context.states[path]?.own.length ?? 0) > 1);
  return (
    <>
      {choices.map((path) => (
        <ChoiceBlock key={path} state={context.states[path]!} context={context} />
      ))}
      {context.existingClient ? (
        <ExistingFieldGroups
          paths={paths.filter((path) => !choices.includes(path))}
          context={context}
        />
      ) : (
        groups.map((group) => (
          <FieldGroupCard
            key={group.title}
            title={group.title}
            paths={group.paths.filter((path) => !choices.includes(path))}
            context={context}
          />
        ))
      )}
    </>
  );
}
