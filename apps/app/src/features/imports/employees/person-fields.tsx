import { bloodGroups, isValidCnp, rhFactors } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Card } from '@ssm-usor/ui/components/card';
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
import { type FormEvent, type ReactNode, useState } from 'react';

import { DatePicker } from '@/components/date-picker';
import { Field } from '@/components/form-field';

import { EditedTag, Tag } from '../review-parts';
import {
  type Changes,
  effectiveCnp,
  type FieldName,
  fieldTitles,
  type FieldValue,
  isExisting,
  pagesOf,
  type Person,
  type ResolvedField,
  resolveField,
  type ReviewContext,
  withField,
  withPersonChange,
} from './employee-review-model';
import { compareWithApp, dateFields, rhLabels, showValue } from './person-values';
import { PageButton } from './photo-column';

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

function withFields(
  changes: Changes,
  personId: string,
  values: Partial<Record<FieldName, FieldValue | null>>
) {
  const written = Object.entries(values).reduce(
    (current, [name, value]) => withField(current, personId, name as FieldName, { value }),
    changes
  );
  // A CNP written over the offered correction is the one confirming takes.
  return 'cnp' in values
    ? withPersonChange(written, personId, (change) => ({ ...change, cnpCorrection: undefined }))
    : written;
}

function FieldRow({
  context,
  person,
  name,
  field,
  extra,
}: {
  context: ReviewContext;
  person: Person;
  name: FieldName;
  field: ResolvedField;
  extra?: ReactNode;
}) {
  const pages = pagesOf(context, person.id);
  const shown = showValue(name, field.value);
  const pageId = field.options.find((option) => option.value === field.value)?.pageIds[0];
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-start gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{fieldTitles[name]}</dt>
      <dd className="grid gap-1">
        <span className="flex flex-wrap items-center gap-2">
          {shown ?? <span className="text-muted-foreground">—</span>}
          {field.edited && <EditedTag />}
        </span>
        {extra}
      </dd>
      {pageId ? <PageButton pages={pages} pageId={pageId} /> : <span />}
    </div>
  );
}

export function FieldsCard({
  context,
  person,
  group,
  onChange,
  notes,
}: {
  context: ReviewContext;
  person: Person;
  group: FieldGroup;
  onChange: Update;
  notes?: Partial<Record<FieldName, ReactNode>>;
}) {
  const [editing, setEditing] = useState(false);
  const { title, names } = groups[group];
  return (
    <Card className="gap-1 px-5 py-4" id={group} data-testid={`person-fields-${group}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <Button type="button" variant="link" size="sm" onClick={() => setEditing(true)}>
          Schimbă<span className="sr-only"> {title.toLowerCase()}</span>
        </Button>
      </div>
      <dl className="divide-y">
        {names.map((name) => (
          <FieldRow
            key={name}
            context={context}
            person={person}
            name={name}
            field={shownField(context, person, name)}
            extra={notes?.[name]}
          />
        ))}
      </dl>
      {editing && (
        <FieldsDialog
          context={context}
          person={person}
          title={title}
          names={names}
          onClose={() => setEditing(false)}
          onSave={(values) => onChange((current) => withFields(current, person.id, values))}
        />
      )}
    </Card>
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

function FieldsDialog({
  context,
  person,
  title,
  names,
  onClose,
  onSave,
}: {
  context: ReviewContext;
  person: Person;
  title: string;
  names: readonly FieldName[];
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
  const minutes = values.commuteMinutes;
  const minutesInvalid =
    names.includes('commuteMinutes') &&
    minutes !== '' &&
    !(/^\d+$/.test(minutes) && Number(minutes) >= 1 && Number(minutes) <= 600);
  const cnpInvalid =
    names.includes('cnp') &&
    values.cnp !== initial.cnp &&
    values.cnp.trim() !== '' &&
    !isValidCnp(values.cnp.trim());

  function submit(event: FormEvent) {
    event.preventDefault();
    if (minutesInvalid || cnpInvalid) return;
    const changed: Partial<Record<FieldName, FieldValue | null>> = {};
    for (const name of names) {
      if (values[name] === initial[name]) continue;
      const text = values[name].trim();
      changed[name] = text === '' ? null : name === 'commuteMinutes' ? Number(text) : text;
    }
    onSave(changed);
    onClose();
  }

  const set = (name: FieldName, value: string) =>
    setValues((current) => ({ ...current, [name]: value }));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="person-fields-dialog">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Ce scrii aici se preia la crearea angajatului, în locul valorii citite de pe fișă.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="mt-4 grid gap-4 sm:grid-cols-2">
            {names.map((name) => {
              const id = `person-field-${name}`;
              const label = fieldTitles[name];
              if (dateFields.has(name)) {
                return (
                  <Field key={name} id={id} label={label} mark="optional">
                    <DatePicker id={id} value={values[name]} onChange={(next) => set(name, next)} />
                  </Field>
                );
              }
              if (name === 'bloodGroup' || name === 'rhFactor') {
                const options = name === 'bloodGroup' ? bloodGroups : rhFactors;
                return (
                  <Field key={name} id={id} label={label} mark="optional">
                    <NativeSelect
                      id={id}
                      value={values[name]}
                      onChange={(event) => set(name, event.target.value)}
                    >
                      <NativeSelectOption value="">—</NativeSelectOption>
                      {options.map((option) => (
                        <NativeSelectOption key={option} value={option}>
                          {name === 'rhFactor' ? `Rh ${rhLabels[option]}` : option}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                );
              }
              return (
                <Field
                  key={name}
                  id={id}
                  label={label}
                  mark="optional"
                  error={
                    name === 'commuteMinutes' && minutesInvalid
                      ? { type: 'range', message: 'Scrie un număr de minute între 1 și 600.' }
                      : name === 'cnp' && cnpInvalid
                        ? {
                            type: 'validate',
                            message: 'CNP-ul nu e valid. Verifică cele 13 cifre.',
                          }
                        : undefined
                  }
                >
                  <Input
                    id={id}
                    value={values[name]}
                    inputMode={name === 'commuteMinutes' || name === 'cnp' ? 'numeric' : undefined}
                    maxLength={lengthLimits[name]}
                    onChange={(event) => set(name, event.target.value)}
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
  onChange,
}: {
  context: ReviewContext;
  person: Person;
  onChange: Update;
}) {
  const [editing, setEditing] = useState(false);
  if (!isExisting(person)) return null;
  const { added, differs, same } = compareWithApp(context, person);
  const pages = pagesOf(context, person.id);
  const sheetValue = (name: FieldName, field: ResolvedField) =>
    context.changes.people[person.id]?.fields?.[name]?.value ?? field.options[0]?.value ?? null;
  return (
    <div className="grid scroll-mt-32 gap-4" id="existing" data-testid="person-existing">
      {added.length > 0 && (
        <Card className="gap-2 px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">
              Se adaugă <span className="font-normal text-muted-foreground">{added.length}</span>
            </h2>
            <Button type="button" variant="link" size="sm" onClick={() => setEditing(true)}>
              Schimbă<span className="sr-only"> ce se adaugă</span>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Angajatul nu are încă aceste date în aplicație. Le preluăm de pe fișă.
          </p>
          <dl className="divide-y">
            {added.map(({ name }) => (
              <FieldRow
                key={name}
                context={context}
                person={person}
                name={name}
                field={shownField(context, person, name)}
              />
            ))}
          </dl>
          {editing && (
            <FieldsDialog
              context={context}
              person={person}
              title="Se adaugă"
              names={added.map(({ name }) => name)}
              onClose={() => setEditing(false)}
              onSave={(values) => onChange((current) => withFields(current, person.id, values))}
            />
          )}
        </Card>
      )}
      {differs.length > 0 && (
        <Card className="gap-2 px-5 py-4">
          <h2 className="text-base font-semibold">
            Diferă de aplicație{' '}
            <span className="font-normal text-muted-foreground">{differs.length}</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            Angajatul are deja o valoare, iar fișa scrie alta. Păstrăm valoarea ta dacă nu alegi
            altfel.
          </p>
          <dl className="divide-y">
            {differs.map(({ name, field }) => {
              const sheet = sheetValue(name, field);
              const pageId = field.options.find((option) => option.value === sheet)?.pageIds[0];
              return (
                <div
                  key={name}
                  className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-start gap-3 py-2 text-sm"
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
                  {pageId ? <PageButton pages={pages} pageId={pageId} /> : <span />}
                </div>
              );
            })}
          </dl>
        </Card>
      )}
      {same.length > 0 && (
        <Card className="gap-1 px-5 py-4">
          <h2 className="text-base font-semibold">
            Rămân la fel <span className="font-normal text-muted-foreground">{same.length}</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            {same.map(({ name }) => fieldTitles[name]).join(', ')}: la fel pe fișă și în aplicație.
          </p>
        </Card>
      )}
    </div>
  );
}
