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
import { Pencil } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';

import { DatePicker } from '@/components/date-picker';
import { Field } from '@/components/form-field';

import { EditedTag, Tag } from '../review-parts';
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
  const pageId = field.options.find((option) => option.value === field.value)?.pageIds[0];
  const keys = fieldDecisionKeys(name);
  const own = decisions.filter((decision) => keys.includes(decision.key));
  return (
    <div
      id={`field-${name}`}
      tabIndex={-1}
      data-testid="person-field"
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest('button, a')) onEdit(name);
      }}
      className="-mx-1.5 grid scroll-mt-24 cursor-pointer grid-cols-[minmax(0,8.75rem)_minmax(0,1fr)_auto] items-start gap-3 rounded-md border-t px-1.5 py-2.5 text-sm outline-none first:border-t-0 hover:bg-secondary/50 focus-visible:bg-secondary/60"
    >
      <dt className="text-muted-foreground">{fieldTitles[name]}</dt>
      <dd className="grid min-w-0 gap-1">
        <span className="flex flex-wrap items-center gap-2 wrap-anywhere">
          {field.choice ? (
            <span className="text-muted-foreground">De ales mai sus</span>
          ) : (
            (shown ?? <span className="text-muted-foreground">—</span>)
          )}
          {field.edited && <EditedTag />}
        </span>
        {own.map((decision) => (
          <Tag key={decision.key} tone="destructive" className="w-fit whitespace-normal">
            {decision.label}
          </Tag>
        ))}
        {extra}
      </dd>
      {pageId ? (
        <PhotoNumber
          pages={pages}
          pageId={pageId}
          about={`${fieldTitles[name]}: ${shown ?? 'necompletat'}`}
        />
      ) : (
        <span />
      )}
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
      <div className="flex min-h-9 items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        <EditIcon label={editLabels[group]} onClick={() => setEditing('all')} />
      </div>
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
  return (
    <div className="grid gap-y-5 px-5 py-4 lg:grid-cols-3 lg:divide-x lg:[&>*]:px-5 lg:[&>*:first-child]:pl-0 lg:[&>*:last-child]:pr-0">
      {(Object.keys(groups) as FieldGroup[]).map((group) => (
        <FieldGroupBlock
          key={group}
          context={context}
          person={person}
          group={group}
          decisions={decisions}
          onChange={onChange}
          notes={notes}
        />
      ))}
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
  education: 160,
  qualification: 160,
  jobTitle: 160,
  commuteRoute: 1000,
};

export function FieldInput({
  id,
  name,
  value,
  onChange,
  invalid,
  describedBy,
  autoFocus,
  className,
}: {
  id: string;
  name: FieldName;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
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
  return (
    <Input
      id={id}
      value={value}
      inputMode={name === 'commuteMinutes' || name === 'cnp' ? 'numeric' : undefined}
      maxLength={lengthLimits[name]}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      autoFocus={autoFocus}
      className={className}
      onChange={(event) => onChange(event.target.value)}
    />
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
  const mark = (name: FieldName) =>
    !isExisting(context, person) && requiredForNewField(name) ? 'required' : 'optional';

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-lg"
        data-testid="person-fields-dialog"
        onOpenAutoFocus={(event) => {
          const field = focus && document.getElementById(`person-field-${focus}`);
          if (!field) return;
          event.preventDefault();
          field.focus();
        }}
      >
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Ce scrii aici se preia la crearea lucrătorului, în locul valorii citite de pe fișă.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="mt-4 grid gap-4 sm:grid-cols-2">
            {names.map((name) => {
              const id = `person-field-${name}`;
              const problem = problems[name];
              return (
                <Field
                  key={name}
                  id={id}
                  label={fieldTitles[name]}
                  mark={mark(name)}
                  error={problem ? { type: 'validate', message: problem } : undefined}
                >
                  <FieldInput
                    id={id}
                    name={name}
                    value={values[name]}
                    invalid={Boolean(problem)}
                    describedBy={problem ? `${id}-error` : undefined}
                    onChange={(next) => set(name, next)}
                  />
                </Field>
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
  return (
    <div
      className="grid gap-y-5 px-5 py-4 lg:grid-cols-3 lg:divide-x lg:[&>*]:px-5 lg:[&>*:first-child]:pl-0 lg:[&>*:last-child]:pr-0"
      data-testid="person-existing"
    >
      {added.length > 0 && (
        <div className="grid min-w-0 content-start gap-2">
          <div className="flex min-h-9 items-center justify-between gap-2">
            <h3 className="text-[15px] font-semibold">
              Se adaugă <span className="font-normal text-muted-foreground">{added.length}</span>
            </h3>
            <EditIcon
              label="Modifică ce se adaugă"
              onClick={() => {
                setFocus(undefined);
                setEditing('added');
              }}
            />
          </div>
          <p className="text-sm text-muted-foreground">
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
      )}
      {differs.length > 0 && (
        <div className="grid min-w-0 content-start gap-2">
          <div className="flex min-h-9 items-center justify-between gap-2">
            <h3 className="text-[15px] font-semibold">
              Diferă de aplicație{' '}
              <span className="font-normal text-muted-foreground">{differs.length}</span>
            </h3>
            <EditIcon
              label="Modifică ce diferă de aplicație"
              onClick={() => {
                setFocus(undefined);
                setEditing('differs');
              }}
            />
          </div>
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
          <p className="text-sm text-muted-foreground">
            Lucrătorul are deja o valoare, iar fișa scrie alta. Păstrăm valoarea ta dacă nu alegi
            altfel.
          </p>
          <dl>
            {differs.map(({ name, field }) => {
              const sheet = sheetValue(name, field);
              const pageId = field.options.find((option) => option.value === sheet)?.pageIds[0];
              return (
                <div
                  key={name}
                  id={`field-${name}`}
                  tabIndex={-1}
                  className="grid scroll-mt-24 grid-cols-[minmax(0,8.75rem)_minmax(0,1fr)_auto] items-start gap-3 border-t py-2.5 text-sm outline-none first:border-t-0 focus-visible:bg-secondary/60"
                  data-testid="person-existing-differs"
                >
                  <dt className="text-muted-foreground">{fieldTitles[name]}</dt>
                  <dd className="grid gap-1">
                    {field.replaced ? (
                      <>
                        <span>
                          Devine {showValue(name, sheet)} <Tag tone="info">De pe fișă</Tag>
                        </span>
                        <span className="text-muted-foreground">
                          În aplicație: {showValue(name, field.app)}
                        </span>
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="w-fit px-0"
                          onClick={() =>
                            onChange((current) => withField(current, person.id, name, null))
                          }
                        >
                          Păstrează valoarea din aplicație
                        </Button>
                      </>
                    ) : (
                      <>
                        <span>
                          Rămâne {showValue(name, field.app)}{' '}
                          <span className="text-muted-foreground">(din aplicație)</span>{' '}
                          <Tag tone="muted">Păstrăm valoarea ta</Tag>
                        </span>
                        <span className="text-muted-foreground">
                          Pe fișă: {showValue(name, sheet)}
                        </span>
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="w-fit px-0"
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
                  </dd>
                  {pageId ? (
                    <PhotoNumber
                      pages={pages}
                      pageId={pageId}
                      about={`${fieldTitles[name]}: ${showValue(name, sheet) ?? 'necompletat'}`}
                    />
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
          </dl>
        </div>
      )}
      {same.length > 0 && (
        <div className="grid min-w-0 content-start gap-1">
          <h3 className="text-[15px] font-semibold">
            Rămân la fel <span className="font-normal text-muted-foreground">{same.length}</span>
          </h3>
          <p className="text-sm text-muted-foreground">
            {same.map(({ name }) => fieldTitles[name]).join(', ')}: la fel pe fișă și în aplicație.
          </p>
        </div>
      )}
    </div>
  );
}

function EditIcon({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Pencil aria-hidden="true" />
    </Button>
  );
}
