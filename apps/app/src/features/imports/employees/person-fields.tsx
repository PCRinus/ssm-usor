import { bloodGroups, rhFactors } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { cn } from '@ssm-usor/ui/lib/utils';
import {
  type ComponentProps,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { DatePicker } from '@/components/date-picker';
import { Field } from '@/components/form-field';
import { EditAction } from '@/components/section-card';

import { PendingNote, StatusDot, type Tone } from '../library/decision-row';
import { rowTones } from '../library/row-tones';
import { EditedTag, RowNote, Tag } from '../review-parts';
import {
  type Changes,
  type Decision,
  effectiveCnp,
  type FieldName,
  fieldTitles,
  type FieldValue,
  isExisting,
  pagesOf,
  type Person,
  requiredForNewField,
  type ResolvedField,
  resolveField,
  type ReviewContext,
  withField,
} from './employee-review-model';
import { dialogRowsFor } from './person-dialog-rows';
import { PhotoNumber } from './person-photos';
import {
  compareWithApp,
  dateFields,
  fieldProblem,
  rhLabels,
  showValue,
  typedValue,
} from './person-values';
import { withFields } from './review-changes';
import { fieldTarget } from './spot-targets';

type Update = (mutate: (current: Changes) => Changes) => void;

const groups = {
  personal: {
    title: 'Date personale',
    names: [
      'lastName',
      'firstName',
      'cnp',
      'birthDate',
      'birthPlace',
      'homeAddress',
      'residenceAddress',
      'education',
      'qualification',
    ],
  },
  employment: {
    title: 'Angajare',
    names: ['jobTitle', 'hiredAt', 'employeeNumber', 'leftOn'],
  },
  medical: {
    title: 'Medical și alte date',
    names: ['bloodGroup', 'rhFactor', 'commuteRoute', 'commuteMinutes'],
  },
} as const satisfies Record<string, { title: string; names: readonly FieldName[] }>;

export type FieldGroup = keyof typeof groups;

function shownField(context: ReviewContext, person: Person, name: FieldName): ResolvedField {
  const field = resolveField(context, person, name);
  return name === 'cnp' ? { ...field, value: effectiveCnp(context, person) } : field;
}

const editLabels: Record<FieldGroup, string> = {
  personal: 'Modifică datele personale',
  employment: 'Modifică datele de angajare',
  medical: 'Modifică datele medicale și celelalte',
};

const fieldDecisionKeys = (name: FieldName) => [
  `missing-${name}`,
  `invalid-${name}`,
  `duplicate-${name}`,
  ...(name === 'birthDate' ? ['birthDate'] : []),
];

type RowTone = Extract<Tone, 'done' | 'todo' | 'optional'>;

const ownDecisions = (name: FieldName, decisions: Decision[]) => {
  const keys = fieldDecisionKeys(name);
  return decisions.filter((decision) => keys.includes(decision.key));
};

const toneOf = (name: FieldName, field: ResolvedField, own: Decision[]): RowTone =>
  own.length > 0 || field.choice
    ? 'todo'
    : showValue(name, field.value) === null
      ? 'optional'
      : 'done';

const rowsShown = (context: ReviewContext, person: Person): FieldName[] => {
  if (!isExisting(context, person)) return Object.values(groups).flatMap((group) => group.names);
  const { added, differs } = compareWithApp(context, person);
  return [...added, ...differs].map(({ name }) => name);
};

export function DataPending({
  context,
  person,
  decisions,
}: {
  context: ReviewContext;
  person: Person;
  decisions: Decision[];
}) {
  const open = rowsShown(context, person).filter(
    (name) =>
      toneOf(name, shownField(context, person, name), ownDecisions(name, decisions)) === 'todo'
  ).length;
  return <PendingNote line={open > 0 ? `${open} de hotărât` : null} testId="person-data-pending" />;
}

// A border would curl along the rounded fill of a hovered or flagged row, so the hairline is a
// pseudo-element that stops at the content's edges and gives way beside a filled row.
const rowClass = cn(
  'relative -mx-2 grid scroll-mt-24 grid-cols-[1.25rem_minmax(0,5.75rem)_minmax(0,1fr)_1.75rem] items-start gap-x-2.5 rounded-md px-2 py-2.5 text-sm outline-none sm:grid-cols-[1.25rem_minmax(0,7rem)_minmax(0,1fr)_1.75rem] sm:gap-x-3',
  "not-first:before:absolute not-first:before:inset-x-2 not-first:before:top-0 not-first:before:h-px not-first:before:bg-border/70 not-first:before:content-['']",
  'focus-visible:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:before:hidden [:focus-visible+&]:before:hidden',
  'data-[tone=todo]:before:hidden [[data-tone=todo]+&]:before:hidden'
);

function DataRow({
  name,
  tone,
  chip,
  testId,
  onEdit,
  children,
}: {
  name: FieldName;
  tone: RowTone;
  chip?: ReactNode;
  testId: string;
  onEdit?: (name: FieldName) => void;
  children: ReactNode;
}) {
  return (
    <div
      id={`field-${name}`}
      tabIndex={-1}
      data-testid={testId}
      data-tone={tone}
      onClick={
        onEdit &&
        ((event) => {
          if (!(event.target as HTMLElement).closest('button, a')) onEdit(name);
        })
      }
      className={cn(
        rowClass,
        rowTones[tone],
        onEdit && 'cursor-pointer hover:before:hidden [:hover+&]:before:hidden',
        onEdit && tone !== 'todo' && 'hover:bg-secondary/50'
      )}
    >
      <dt className="col-span-2 grid grid-cols-subgrid items-start">
        <StatusDot tone={tone} className="mt-0 sm:mt-0" />
        <span className="font-medium">{fieldTitles[name]}</span>
      </dt>
      <dd className="col-span-2 grid grid-cols-subgrid items-start">
        <div className="grid min-w-0 gap-1">{children}</div>
        <span className="-mt-0.5 justify-self-end">{chip}</span>
      </dd>
    </div>
  );
}

// A value the member wrote over sheets that disagree came from none of them.
const sheetOptionOf = (field: ResolvedField) =>
  field.options.find((option) => option.value === field.value) ??
  (field.edited && field.options.length === 1 ? field.options[0] : undefined);

function FieldRow({
  context,
  person,
  name,
  field,
  decisions,
  extra,
  onEdit,
}: {
  context: ReviewContext;
  person: Person;
  name: FieldName;
  field: ResolvedField;
  decisions: Decision[];
  extra?: ReactNode;
  onEdit: (name: FieldName) => void;
}) {
  const pages = pagesOf(context, person.id);
  const shown = showValue(name, field.value);
  const pageId = field.choice ? undefined : sheetOptionOf(field)?.pageIds[0];
  const own = ownDecisions(name, decisions);
  const missing = own.some((decision) => decision.key === `missing-${name}`);
  const fromSheet =
    field.edited && field.options.every((option) => option.value !== field.value)
      ? field.options.map((option) => showValue(name, option.value)).join('; ')
      : '';
  return (
    <DataRow
      name={name}
      tone={toneOf(name, field, own)}
      testId="person-field"
      onEdit={onEdit}
      chip={
        pageId && (
          <PhotoNumber
            pages={pages}
            pageId={pageId}
            about={`${fieldTitles[name]}: ${shown ?? 'necompletat'}`}
            spot={fieldTarget(name)}
          />
        )
      }
    >
      {field.choice ? (
        <span className="text-muted-foreground">De ales mai sus</span>
      ) : missing ? (
        <span className="font-medium text-destructive" data-testid="person-field-missing">
          Lipsește de pe fișe. E obligatoriu pentru crearea lucrătorului.
        </span>
      ) : shown === null ? (
        <span className="text-muted-foreground">Necompletat</span>
      ) : (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium wrap-anywhere">{shown}</span>
          {field.edited && <EditedTag />}
        </span>
      )}
      {fromSheet && (
        <RowNote testId="person-field-sheet">
          <span className="wrap-anywhere">De pe fișă: {fromSheet}</span>
        </RowNote>
      )}
      <DecisionTags decisions={own.filter(({ key }) => key !== `missing-${name}`)} />
      {extra}
    </DataRow>
  );
}

function DecisionTags({ decisions }: { decisions: Decision[] }) {
  return decisions.map((decision) => (
    <Tag key={decision.key} tone="destructive" className="w-fit whitespace-normal">
      {decision.label}
    </Tag>
  ));
}

function GroupHeading({
  title,
  label,
  onEdit,
}: {
  title: ReactNode;
  label?: string;
  onEdit?: () => void;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-2">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {onEdit && <EditAction aria-label={label} title={label} onClick={onEdit} />}
    </div>
  );
}

function FieldGroupBlock({
  context,
  person,
  group,
  decisions,
  onChange,
  notes,
}: {
  context: ReviewContext;
  person: Person;
  group: FieldGroup;
  decisions: Decision[];
  onChange: Update;
  notes?: Partial<Record<FieldName, ReactNode>>;
}) {
  const [editing, setEditing] = useState<FieldName | 'all' | null>(null);
  const { title, names } = groups[group];
  return (
    <div
      className="grid min-w-0 scroll-mt-24 content-start gap-1"
      id={group}
      data-testid={`person-fields-${group}`}
    >
      <GroupHeading title={title} label={editLabels[group]} onEdit={() => setEditing('all')} />
      <dl>
        {names.map((name) => (
          <FieldRow
            key={name}
            context={context}
            person={person}
            name={name}
            field={shownField(context, person, name)}
            decisions={decisions}
            extra={notes?.[name]}
            onEdit={setEditing}
          />
        ))}
      </dl>
      {editing && (
        <FieldsDialog
          context={context}
          person={person}
          title={title}
          names={names}
          focus={editing === 'all' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={(values) => onChange((current) => withFields(current, person.id, values))}
        />
      )}
    </div>
  );
}

export function PersonData({
  context,
  person,
  decisions,
  onChange,
  notes,
}: {
  context: ReviewContext;
  person: Person;
  decisions: Decision[];
  onChange: Update;
  notes?: Partial<Record<FieldName, ReactNode>>;
}) {
  const [first, ...rest] = (Object.keys(groups) as FieldGroup[]).map((group) => (
    <FieldGroupBlock
      key={group}
      context={context}
      person={person}
      group={group}
      decisions={decisions}
      onChange={onChange}
      notes={notes}
    />
  ));
  return <TwoColumns first={first} rest={rest} />;
}

function TwoColumns({
  first,
  rest,
  testId,
}: {
  first: ReactNode;
  rest: ReactNode[];
  testId?: string;
}) {
  return (
    <div className="@container px-4 pt-2 pb-4 sm:px-5" data-testid={testId}>
      <div className="grid gap-y-4 @3xl:grid-cols-2 @3xl:gap-x-12">
        {first}
        {rest.length > 0 && <div className="grid min-w-0 content-start gap-y-4">{rest}</div>}
      </div>
    </div>
  );
}

const lengthLimits: Partial<Record<FieldName, number>> = {
  cnp: 13,
  lastName: 100,
  firstName: 100,
  employeeNumber: 40,
  birthPlace: 160,
  homeAddress: 240,
  residenceAddress: 240,
  education: 160,
  qualification: 160,
  jobTitle: 160,
  commuteRoute: 1000,
};

const wrappingFields = new Set<FieldName>([
  'homeAddress',
  'residenceAddress',
  'jobTitle',
  'commuteRoute',
]);

// Enter saves and a pasted line break becomes a space: these values print inside sentences and
// table cells of the generated documents.
const oneLine = (value: string) => value.replace(/\s*[\r\n]+\s*/g, ' ');

function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}

function OneLineTextarea({
  onChange,
  ...props
}: Omit<ComponentProps<typeof Textarea>, 'onChange' | 'size'> & {
  onChange: (value: string) => void;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);
  // Rewriting a controlled value moves the caret to the end, so it is put back where the typed or
  // pasted text ended.
  useLayoutEffect(() => {
    if (caret.current === null || !box.current) return;
    box.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });
  return (
    <Textarea
      {...props}
      ref={box}
      size="line"
      onKeyDown={submitOnEnter}
      onChange={(event) => {
        const written = event.target.value;
        const value = oneLine(written);
        if (value !== written) {
          caret.current = oneLine(written.slice(0, event.target.selectionEnd)).length;
        }
        onChange(value);
      }}
    />
  );
}

export function FieldInput({
  id,
  name,
  value,
  onChange,
  invalid,
  describedBy,
  autoFocus,
  multiline,
  className,
}: {
  id: string;
  name: FieldName;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
  multiline?: boolean;
  className?: string;
}) {
  if (dateFields.has(name)) {
    return (
      <DatePicker
        id={id}
        value={value}
        invalid={invalid}
        describedBy={describedBy}
        className={className}
        onChange={onChange}
      />
    );
  }
  if (name === 'bloodGroup' || name === 'rhFactor') {
    const options = name === 'bloodGroup' ? bloodGroups : rhFactors;
    return (
      <NativeSelect
        id={id}
        value={value}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        autoFocus={autoFocus}
        className={className}
        onChange={(event) => onChange(event.target.value)}
      >
        <NativeSelectOption value="">—</NativeSelectOption>
        {options.map((option) => (
          <NativeSelectOption key={option} value={option}>
            {name === 'rhFactor' ? `Rh ${rhLabels[option]}` : option}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    );
  }
  if (multiline && wrappingFields.has(name)) {
    return (
      <OneLineTextarea
        id={id}
        value={value}
        maxLength={lengthLimits[name]}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        autoFocus={autoFocus}
        className={className}
        onChange={onChange}
      />
    );
  }
  const unitId = `${id}-unit`;
  const input = (
    <Input
      id={id}
      value={value}
      inputMode={name === 'commuteMinutes' || name === 'cnp' ? 'numeric' : undefined}
      maxLength={lengthLimits[name]}
      aria-invalid={invalid}
      aria-describedby={
        name === 'commuteMinutes' ? [unitId, describedBy].filter(Boolean).join(' ') : describedBy
      }
      autoFocus={autoFocus}
      className={name === 'commuteMinutes' ? 'pr-12' : className}
      onChange={(event) => onChange(event.target.value)}
    />
  );
  if (name !== 'commuteMinutes') return input;
  return (
    <div className={cn('relative', className)}>
      {input}
      {/* aria-describedby still reads hidden text, so the unit is announced once, with the field. */}
      <span
        id={unitId}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground"
      >
        min
      </span>
    </div>
  );
}

function FieldsDialog({
  context,
  person,
  title,
  names,
  focus,
  onClose,
  onSave,
}: {
  context: ReviewContext;
  person: Person;
  title: string;
  names: readonly FieldName[];
  focus?: FieldName;
  onClose: () => void;
  onSave: (values: Partial<Record<FieldName, FieldValue | null>>) => void;
}) {
  const initial = Object.fromEntries(
    names.map((name) => {
      const value = shownField(context, person, name).value;
      return [name, value === null ? '' : String(value)];
    })
  ) as Record<FieldName, string>;
  const [values, setValues] = useState(initial);
  const problems = Object.fromEntries(
    names.map((name) => [name, fieldProblem(name, values[name], initial[name])])
  ) as Record<FieldName, string | null>;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (names.some((name) => problems[name])) return;
    const changed: Partial<Record<FieldName, FieldValue | null>> = {};
    for (const name of names) {
      if (values[name] === initial[name]) continue;
      changed[name] = typedValue(name, values[name]);
    }
    onSave(changed);
    onClose();
  }

  const set = (name: FieldName, value: string) =>
    setValues((current) => ({ ...current, [name]: value }));
  const mark = (name: FieldName) => {
    if (!isExisting(context, person) && requiredForNewField(name)) return 'required';
    // The worker is created without a route, but their SSM sheet cannot be drawn up without one.
    return name === 'commuteRoute' ? undefined : 'optional';
  };

  function field(name: FieldName, subgrid?: 'always' | 'sm') {
    const id = `person-field-${name}`;
    const problem = problems[name];
    return (
      <Field
        key={name}
        id={id}
        label={fieldTitles[name]}
        mark={mark(name)}
        subgrid={subgrid}
        error={problem ? { type: 'validate', message: problem } : undefined}
      >
        <FieldInput
          id={id}
          name={name}
          value={values[name]}
          invalid={Boolean(problem)}
          describedBy={problem ? `${id}-error` : undefined}
          multiline
          onChange={(next) => set(name, next)}
        />
      </Field>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-lg"
        data-testid="person-fields-dialog"
        onOpenAutoFocus={(event) => {
          const target = focus && document.getElementById(`person-field-${focus}`);
          if (!target) return;
          event.preventDefault();
          target.focus();
        }}
      >
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Ce scrii aici înlocuiește valoarea citită de pe fișă.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="mt-4 grid gap-4">
            {dialogRowsFor(names).map((row) => {
              if ('full' in row) return field(row.full);
              if ('half' in row) {
                return (
                  <div key={row.half} className="grid gap-x-4 sm:grid-cols-2">
                    {field(row.half)}
                  </div>
                );
              }
              const subgrid = row.onPhone === 'paired' ? 'always' : 'sm';
              return (
                <div
                  key={row.pair.join('-')}
                  className={
                    subgrid === 'always'
                      ? 'grid grid-cols-2 gap-x-4'
                      : 'grid gap-x-4 gap-y-4 sm:grid-cols-2 sm:gap-y-0'
                  }
                >
                  {row.pair.map((name) => field(name, subgrid))}
                </div>
              );
            })}
          </DialogBody>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Renunță
            </Button>
            <Button type="submit" data-testid="person-fields-save">
              Salvează
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExistingComparison({
  context,
  person,
  decisions,
  onChange,
}: {
  context: ReviewContext;
  person: Person;
  decisions: Decision[];
  onChange: Update;
}) {
  const [editing, setEditing] = useState<'added' | 'differs' | null>(null);
  const [focus, setFocus] = useState<FieldName | undefined>();
  if (!isExisting(context, person)) return null;
  const { added, differs, same } = compareWithApp(context, person);
  const pages = pagesOf(context, person.id);
  const sheetValue = (name: FieldName, field: ResolvedField) =>
    context.changes.people[person.id]?.fields?.[name]?.value ?? field.options[0]?.value ?? null;
  const count = (value: number) => (
    <span className="font-normal text-muted-foreground">{value}</span>
  );
  const blocks: ReactNode[] = [];
  if (added.length > 0) {
    blocks.push(
      <div key="added" className="grid min-w-0 content-start gap-1">
        <GroupHeading
          title={<>Se adaugă {count(added.length)}</>}
          label="Modifică ce se adaugă"
          onEdit={() => {
            setFocus(undefined);
            setEditing('added');
          }}
        />
        <p className="pb-1 text-[13px] text-muted-foreground">
          Lucrătorul nu are încă aceste date în aplicație. Le preluăm de pe fișă.
        </p>
        <dl>
          {added.map(({ name }) => (
            <FieldRow
              key={name}
              context={context}
              person={person}
              name={name}
              field={shownField(context, person, name)}
              decisions={decisions}
              onEdit={(name) => {
                setFocus(name);
                setEditing('added');
              }}
            />
          ))}
        </dl>
        {editing === 'added' && (
          <FieldsDialog
            context={context}
            person={person}
            title="Se adaugă"
            names={added.map(({ name }) => name)}
            focus={focus}
            onClose={() => setEditing(null)}
            onSave={(values) => onChange((current) => withFields(current, person.id, values))}
          />
        )}
      </div>
    );
  }
  if (differs.length > 0) {
    blocks.push(
      <div key="differs" className="grid min-w-0 content-start gap-1">
        <GroupHeading
          title={<>Diferă de aplicație {count(differs.length)}</>}
          label="Modifică ce diferă de aplicație"
          onEdit={() => {
            setFocus(undefined);
            setEditing('differs');
          }}
        />
        {editing === 'differs' && (
          <FieldsDialog
            context={context}
            person={person}
            title="Diferă de aplicație"
            names={differs.map(({ name }) => name)}
            onClose={() => setEditing(null)}
            onSave={(values) => onChange((current) => withFields(current, person.id, values))}
          />
        )}
        <p className="pb-1 text-[13px] text-muted-foreground">
          Lucrătorul are deja o valoare, iar fișa scrie alta. Păstrăm valoarea ta dacă nu alegi
          altfel.
        </p>
        <dl>
          {differs.map(({ name, field }) => {
            const sheet = sheetValue(name, field);
            const pageId = field.options.find((option) => option.value === sheet)?.pageIds[0];
            const own = ownDecisions(name, decisions);
            return (
              <DataRow
                key={name}
                name={name}
                tone={toneOf(name, shownField(context, person, name), own)}
                testId="person-existing-differs"
                chip={
                  pageId && (
                    <PhotoNumber
                      pages={pages}
                      pageId={pageId}
                      about={`${fieldTitles[name]}: ${showValue(name, sheet) ?? 'necompletat'}`}
                      spot={fieldTarget(name)}
                    />
                  )
                }
              >
                {field.replaced ? (
                  <>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium wrap-anywhere">
                        Devine {showValue(name, sheet)}
                      </span>
                      <Tag tone="info">De pe fișă</Tag>
                    </span>
                    <RowNote>
                      <span className="wrap-anywhere">
                        În aplicație: {showValue(name, field.app)}
                      </span>
                    </RowNote>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto w-fit px-0 py-0.5"
                      onClick={() =>
                        onChange((current) => withField(current, person.id, name, null))
                      }
                    >
                      Păstrează valoarea din aplicație
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium wrap-anywhere">
                        Rămâne {showValue(name, field.app)}{' '}
                        <span className="font-normal text-muted-foreground">(din aplicație)</span>
                      </span>
                      <Tag tone="muted">Păstrăm valoarea ta</Tag>
                    </span>
                    <RowNote>
                      <span className="wrap-anywhere">Pe fișă: {showValue(name, sheet)}</span>
                    </RowNote>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto w-fit px-0 py-0.5"
                      data-testid="person-existing-take-sheet"
                      onClick={() =>
                        onChange((current) =>
                          withField(current, person.id, name, {
                            ...(field.options[0] ? { option: field.options[0].index } : {}),
                            replace: true,
                          })
                        )
                      }
                    >
                      Folosește valoarea de pe fișă
                    </Button>
                  </>
                )}
                <DecisionTags decisions={own} />
              </DataRow>
            );
          })}
        </dl>
      </div>
    );
  }
  if (same.length > 0) {
    blocks.push(
      <div key="same" className="grid min-w-0 content-start gap-1">
        <GroupHeading title={<>Rămân la fel {count(same.length)}</>} />
        <p className="text-sm text-muted-foreground">
          {same.map(({ name }) => fieldTitles[name]).join(', ')}: la fel pe fișă și în aplicație.
        </p>
      </div>
    );
  }
  const [first, ...rest] = blocks;
  return <TwoColumns first={first} rest={rest} testId="person-existing" />;
}
