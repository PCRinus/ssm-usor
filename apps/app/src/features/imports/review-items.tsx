import {
  type CountyCode,
  countyNames,
  fireEquipmentKindLabels,
  fireEquipmentKinds,
  fireExtinguishingAgentLabels,
  fireExtinguishingAgents,
  fireInstallationKindLabels,
  fireInstallationKinds,
  responsiblePersonRoles,
  type StaffCategory,
} from '@ssm-usor/contracts';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { Copy } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { WorkplaceDialog, type WorkplaceDraft } from '@/features/clients/workplace-dialog';
import { emptyWorkplaceForm, type WorkplaceFormValues } from '@/features/clients/workplace-schema';
import {
  JobPositionDialog,
  type JobPositionDraft,
} from '@/features/job-positions/job-position-dialog';
import {
  emptyJobPositionForm,
  type JobPositionFormValues,
  staffCategoryShortLabels,
} from '@/features/job-positions/job-position-schema';
import { allocationLabels } from '@/features/protective-equipment/equipment-schema';

import { type ItemDialogField, ItemEditDialog } from './item-edit-dialog';
import type { FieldContext } from './review-fields';
import {
  allocationLabel,
  anchorOf,
  type Blocker,
  employeeRoleLabel,
  flagNotes,
  flagsAt,
  itemFieldLabel,
  type ItemList,
  itemName,
  type ItemState,
  itemStates,
  roleLabel,
  sameValue,
  type Source,
} from './review-model';
import { EditButton, EditedTag, ReviewCard, RowNote, SourceButton } from './review-parts';

type ItemsContext = FieldContext & { blockers: Blocker[] };

const text = (value: unknown) =>
  value === null || value === undefined || value === '' ? null : String(value);

function referenceName(
  context: ItemsContext,
  list: 'workplaces' | 'jobPositions',
  value: unknown
): string | null {
  if (value && typeof value === 'object') {
    const reference = value as { name: string | null; id: string | null };
    if (reference.id) {
      const match = itemStates(context.proposal, context.changes, list).find(
        (state) => state.item.id === reference.id
      );
      if (match) return itemName(list, match.values);
    }
    return reference.name;
  }
  if (typeof value === 'string') {
    const match = itemStates(context.proposal, context.changes, list).find(
      (state) => state.item.id === value
    );
    return match ? itemName(list, match.values) : null;
  }
  return null;
}

const referenceId = (value: unknown) =>
  value && typeof value === 'object'
    ? ((value as { id: string | null }).id ?? '')
    : typeof value === 'string'
      ? value
      : '';

const blank = (value: unknown) => (value === '' || value === undefined ? null : value);

function changedValues(state: ItemState, next: Record<string, unknown>) {
  const original = state.item as Record<string, unknown>;
  const values: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(next)) {
    const value = blank(raw);
    const before = blank(
      key === 'workplace' || key === 'jobPosition' ? referenceId(original[key]) : original[key]
    );
    const same = Array.isArray(value)
      ? JSON.stringify(value) === JSON.stringify(before)
      : value === before || (value !== null && before !== null && sameValue(value, before));
    if (!same) values[key] = value;
  }
  return values;
}

function ItemRow({
  state,
  context,
  title,
  details,
  onEdit,
}: {
  state: ItemState;
  context: ItemsContext;
  title: string;
  details: ReactNode[];
  onEdit?: () => void;
}) {
  const prefix = `${state.list}.${state.index}`;
  const blockers = context.blockers.filter(
    (blocker) => blocker.path === prefix || blocker.path.startsWith(`${prefix}.`)
  );
  const flags = flagsAt(context.proposal, prefix).filter(
    (flag) => !['missing', 'unknown_reference'].includes(flag.code)
  );
  return (
    <li
      id={anchorOf(`${state.list}.${state.item.id}`)}
      data-testid="review-item"
      className="grid scroll-mt-32 gap-x-6 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto]"
    >
      <div className="grid min-w-0 gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium wrap-anywhere">{title}</span>
          {state.edited && <EditedTag />}
        </span>
        {details.filter(Boolean).map((detail, index) => (
          <span key={index} className="text-[13px] text-muted-foreground wrap-anywhere">
            {detail}
          </span>
        ))}
        {blockers.map((blocker) => {
          const field = blocker.path.split('.')[2];
          return (
            <RowNote key={`${blocker.path}-${blocker.code}`} tone="danger">
              {blocker.code === 'unknown_reference'
                ? `Alege ${itemFieldLabel(field ?? 'workplace')}.`
                : blocker.code === 'invalid'
                  ? `Corectează ${field ? itemFieldLabel(field) : 'datele'}.`
                  : `Lipsește ${field ? itemFieldLabel(field) : 'o dată obligatorie'}.`}
            </RowNote>
          );
        })}
        {flags.map((flag) => (
          <RowNote key={`${flag.path}-${flag.code}`}>
            {flag.detail ?? flagNotes[flag.code] ?? flag.code}
          </RowNote>
        ))}
      </div>
      <div className="flex flex-wrap items-start gap-4 sm:justify-end">
        <SourceButton
          sources={state.item.sources}
          onOpen={() => context.openSource(title, state.item.sources, state.item.otherCompanyName)}
        />
        {onEdit && <EditButton onClick={onEdit} />}
      </div>
    </li>
  );
}

function OtherCompanyBox({
  states,
  context,
  noun,
}: {
  states: ItemState[];
  context: ItemsContext;
  noun: (state: ItemState) => string;
}) {
  if (states.length === 0) return null;
  return (
    <div
      role="group"
      aria-label="Posibil de la alt client"
      data-testid="review-other-company"
      className="mt-2 grid gap-2 rounded-lg border border-dashed bg-muted/30 px-4 py-3"
    >
      <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2.5 gap-y-0.5">
        <Copy className="mt-0.5 size-4" aria-hidden="true" />
        <span className="text-sm font-medium">Posibil de la alt client</span>
        <span className="col-start-2 text-[13px] text-muted-foreground">
          Apar doar în pasaje copiate din documentele altei firme. Le preluăm numai dacă le bifezi.
        </span>
      </div>
      <ul className="grid gap-1">
        {states.map((state) => {
          const name = itemName(state.list, state.values);
          return (
            <li
              key={state.item.id}
              id={anchorOf(`${state.list}.${state.item.id}`)}
              className="grid grid-cols-[1rem_minmax(0,1fr)_auto] items-start gap-2.5 py-1"
            >
              <Checkbox
                className="mt-0.5"
                data-testid="review-include-item"
                checked={state.included}
                aria-label={`Preia ${noun(state)} ${name}`}
                onCheckedChange={(checked) =>
                  context.review.setItem(state.item.id, (current) => ({
                    ...current,
                    included: checked === true,
                  }))
                }
              />
              <span className="grid text-sm">
                <span className="font-medium">{name}</span>
                {state.item.otherCompanyName && (
                  <span className="text-[13px] text-muted-foreground">
                    De la {state.item.otherCompanyName}
                  </span>
                )}
              </span>
              <SourceButton
                sources={state.item.sources}
                onOpen={() =>
                  context.openSource(name, state.item.sources, state.item.otherCompanyName)
                }
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ListCard({
  title,
  list,
  context,
  noun,
  render,
  empty,
}: {
  title: (count: number) => string;
  list: ItemList;
  context: ItemsContext;
  noun: (state: ItemState) => string;
  render: (state: ItemState) => ReactNode;
  empty: string;
}) {
  const states = itemStates(context.proposal, context.changes, list);
  const kept = states.filter((state) => state.proposed && state.included);
  const others = states.filter((state) => !state.proposed);
  return (
    <ReviewCard title={title(kept.length)} testId={`review-list-${list}`}>
      {kept.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y">{kept.map(render)}</ul>
      )}
      <OtherCompanyBox
        states={others.concat(states.filter((state) => state.proposed && !state.included))}
        context={context}
        noun={noun}
      />
    </ReviewCard>
  );
}

const quoteAside = (sources: Source[], openSource: () => void) => {
  const first = sources[0];
  if (!first) return null;
  return (
    <figure className="grid gap-1.5 rounded-lg bg-muted/50 p-3 text-sm sm:col-span-2">
      <figcaption className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>Propus din {first.file.split('/').at(-1)}</span>
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={openSource}
        >
          Vezi contextul
        </button>
      </figcaption>
      <blockquote className="border-l-2 border-primary/40 pl-3 italic">„{first.quote}”</blockquote>
    </figure>
  );
};

const plural = (count: number, one: string, many: string) =>
  count === 1 ? `Un ${one}` : `${count} ${many}`;

export function WorkplacesSection({ context }: { context: ItemsContext }) {
  const [editing, setEditing] = useState<ItemState | null>(null);
  const draft: WorkplaceDraft | null = editing
    ? {
        values: {
          ...emptyWorkplaceForm,
          name: String(editing.values.name ?? ''),
          isRegisteredOffice: Boolean(editing.values.isRegisteredOffice),
          countyCode: String(editing.values.countyCode ?? ''),
          locality: String(editing.values.locality ?? ''),
          addressLine: String(editing.values.addressLine ?? ''),
          activity: String(editing.values.activity ?? ''),
        },
        onSave: (values: WorkplaceFormValues) =>
          context.review.setItem(editing.item.id, (current) => ({
            ...current,
            values: changedValues(editing, {
              name: values.name.trim(),
              isRegisteredOffice: values.isRegisteredOffice,
              countyCode: values.countyCode || null,
              locality: values.locality.trim() || null,
              addressLine: values.addressLine.trim() || null,
              activity: values.activity.trim() || null,
            }) as Record<string, string | boolean | null>,
          })),
        aside: quoteAside(editing.item.sources, () =>
          context.openSource(String(editing.values.name), editing.item.sources)
        ),
      }
    : null;
  return (
    <>
      <ListCard
        title={(count) => plural(count, 'punct de lucru', 'puncte de lucru')}
        list="workplaces"
        context={context}
        noun={() => 'punctul de lucru'}
        empty="Documentele nu numesc niciun punct de lucru."
        render={(state) => {
          const address = [
            text(state.values.addressLine),
            text(state.values.locality),
            state.values.countyCode
              ? `jud. ${countyNames[state.values.countyCode as CountyCode] ?? state.values.countyCode}`
              : null,
          ]
            .filter(Boolean)
            .join(', ');
          const rooms = (state.values.rooms as string[] | undefined) ?? [];
          return (
            <ItemRow
              key={state.item.id}
              state={state}
              context={context}
              title={`${itemName('workplaces', state.values)}${state.values.isRegisteredOffice ? ' · sediu social' : ''}`}
              details={[
                address || 'Fără adresă în documente',
                rooms.length > 0 ? `Încăperi: ${rooms.join(', ')}` : null,
              ]}
              onEdit={() => setEditing(state)}
            />
          );
        }}
      />
      <WorkplaceDialog clientId="" editing={null} draft={draft} onClose={() => setEditing(null)} />
    </>
  );
}

export function JobPositionsSection({ context }: { context: ItemsContext }) {
  const [editing, setEditing] = useState<ItemState | null>(null);
  const draft: JobPositionDraft | null = editing
    ? {
        values: {
          ...emptyJobPositionForm,
          name: String(editing.values.name ?? ''),
          staffCategory: (editing.values.staffCategory as StaffCategory | null) ?? 'execution',
          workZone: String(editing.values.workZone ?? ''),
          activities: String(editing.values.activities ?? ''),
          trainingIntervalMonths:
            editing.values.trainingIntervalMonths === null ||
            editing.values.trainingIntervalMonths === undefined
              ? ''
              : String(editing.values.trainingIntervalMonths),
        },
        onSave: (values: JobPositionFormValues) =>
          context.review.setItem(editing.item.id, (current) => ({
            ...current,
            values: changedValues(editing, {
              name: values.name.trim(),
              staffCategory: values.staffCategory,
              workZone: values.workZone.trim() || null,
              activities: values.activities.trim() || null,
              trainingIntervalMonths: values.trainingIntervalMonths
                ? Number(values.trainingIntervalMonths)
                : null,
            }) as Record<string, string | number | null>,
          })),
        aside: quoteAside(editing.item.sources, () =>
          context.openSource(String(editing.values.name), editing.item.sources)
        ),
      }
    : null;
  return (
    <>
      <ListCard
        title={(count) => plural(count, 'post', 'posturi')}
        list="jobPositions"
        context={context}
        noun={() => 'postul'}
        empty="Documentele nu numesc niciun post de lucru."
        render={(state) => (
          <ItemRow
            key={state.item.id}
            state={state}
            context={context}
            title={itemName('jobPositions', state.values)}
            details={[
              text(state.values.activities),
              state.values.staffCategory
                ? staffCategoryShortLabels[state.values.staffCategory as StaffCategory]
                : 'Categoria de personal lipsește',
            ]}
            onEdit={() => setEditing(state)}
          />
        )}
      />
      <JobPositionDialog
        clientId=""
        editing={null}
        draft={draft}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

function referenceOptions(context: ItemsContext, list: 'workplaces' | 'jobPositions') {
  return itemStates(context.proposal, context.changes, list)
    .filter((state) => state.included)
    .map((state) => ({ value: state.item.id, label: itemName(list, state.values) }));
}

function useItemDialog(context: ItemsContext) {
  const [editing, setEditing] = useState<{ state: ItemState; fields: ItemDialogField[] } | null>(
    null
  );
  const dialog = editing && (
    <ItemEditDialog
      title={`Modifică: ${itemName(editing.state.list, editing.state.values)}`}
      fields={editing.fields}
      values={editing.state.values}
      aside={quoteAside(editing.state.item.sources, () =>
        context.openSource(
          itemName(editing.state.list, editing.state.values),
          editing.state.item.sources
        )
      )}
      onClose={() => setEditing(null)}
      onSave={(next) =>
        context.review.setItem(editing.state.item.id, (current) => ({
          ...current,
          values: changedValues(editing.state, next) as Record<
            string,
            string | number | boolean | null | string[]
          >,
        }))
      }
    />
  );
  return {
    open: (state: ItemState, fields: ItemDialogField[]) => setEditing({ state, fields }),
    dialog,
  };
}

export function ResponsibleSection({ context }: { context: ItemsContext }) {
  const { open, dialog } = useItemDialog(context);
  const workplaces = referenceOptions(context, 'workplaces');
  const personFields: ItemDialogField[] = [
    { name: 'fullName', label: 'Nume', kind: 'text', required: true },
    { name: 'jobTitle', label: 'Funcția', kind: 'text', required: true },
    {
      name: 'roles',
      label: 'Roluri',
      kind: 'roles',
      options: responsiblePersonRoles.map((role) => ({ value: role, label: roleLabel(role) })),
    },
    {
      name: 'workplace',
      label: 'Punctul de lucru',
      kind: 'reference',
      options: [{ value: '', label: 'Toate punctele de lucru' }, ...workplaces],
    },
  ];
  const employeeFields: ItemDialogField[] = [
    { name: 'lastName', label: 'Nume', kind: 'text', required: true },
    { name: 'firstName', label: 'Prenume', kind: 'text', required: true },
    { name: 'jobTitle', label: 'Funcția', kind: 'text', required: true },
    { name: 'hiredAt', label: 'Data angajării', kind: 'date', required: true },
    { name: 'cnp', label: 'CNP', kind: 'text' },
    { name: 'birthDate', label: 'Data nașterii', kind: 'date' },
  ];
  const employees = itemStates(context.proposal, context.changes, 'employees');
  return (
    <>
      <ListCard
        title={(count) => (count === 1 ? 'O persoană' : `${count} persoane`)}
        list="responsiblePersons"
        context={context}
        noun={() => 'persoana'}
        empty="Documentele nu numesc niciun responsabil."
        render={(state) => {
          const roles = (state.values.roles as string[] | undefined) ?? [];
          return (
            <ItemRow
              key={state.item.id}
              state={state}
              context={context}
              title={itemName('responsiblePersons', state.values)}
              details={[
                text(state.values.jobTitle) ?? 'Funcția lipsește',
                roles.map(roleLabel).join(', '),
                referenceName(context, 'workplaces', state.values.workplace) ??
                  'Toate punctele de lucru',
              ]}
              onEdit={() => open(state, personFields)}
            />
          );
        }}
      />
      {employees.length > 0 && (
        <ReviewCard
          title="Devin angajați"
          description="Doar cei pe care un rol îi cere angajați. Ceilalți angajați îi imporți după, din fișele de instruire."
          testId="review-list-employees"
        >
          <ul className="divide-y">
            {employees
              .filter((state) => state.included)
              .map((state) => (
                <ItemRow
                  key={state.item.id}
                  state={state}
                  context={context}
                  title={itemName('employees', state.values)}
                  details={[
                    [employeeRoleLabel(state.values.role), text(state.values.jobTitle)]
                      .filter(Boolean)
                      .join(' · '),
                    state.values.hiredAt
                      ? `Angajat din ${String(state.values.hiredAt).split('-').reverse().join('.')}`
                      : null,
                  ]}
                  onEdit={() => open(state, employeeFields)}
                />
              ))}
          </ul>
        </ReviewCard>
      )}
      {dialog}
    </>
  );
}

export function FireMeansSection({ context }: { context: ItemsContext }) {
  const { open, dialog } = useItemDialog(context);
  const workplaces = referenceOptions(context, 'workplaces');
  const equipmentFields: ItemDialogField[] = [
    {
      name: 'kind',
      label: 'Felul',
      kind: 'select',
      required: true,
      options: fireEquipmentKinds.map((kind) => ({
        value: kind,
        label: fireEquipmentKindLabels[kind],
      })),
    },
    {
      name: 'agent',
      label: 'Agentul de stingere',
      kind: 'select',
      options: [
        { value: '', label: 'Nespecificat' },
        ...fireExtinguishingAgents.map((agent) => ({
          value: agent,
          label: fireExtinguishingAgentLabels[agent],
        })),
      ],
    },
    { name: 'capacity', label: 'Capacitatea (kg sau l)', kind: 'number' },
    { name: 'count', label: 'Bucăți', kind: 'number' },
    { name: 'room', label: 'Încăperea', kind: 'text' },
    { name: 'wheeled', label: 'Pe roți', kind: 'checkbox' },
    {
      name: 'workplace',
      label: 'Punctul de lucru',
      kind: 'reference',
      required: true,
      options: workplaces,
    },
  ];
  const installationFields: ItemDialogField[] = [
    {
      name: 'kind',
      label: 'Felul',
      kind: 'select',
      required: true,
      options: fireInstallationKinds.map((kind) => ({
        value: kind,
        label: fireInstallationKindLabels[kind],
      })),
    },
    { name: 'description', label: 'Descriere', kind: 'text' },
    {
      name: 'workplace',
      label: 'Punctul de lucru',
      kind: 'reference',
      required: true,
      options: workplaces,
    },
  ];
  return (
    <>
      <ListCard
        title={(count) => (count === 1 ? 'Un mijloc de stingere' : `${count} mijloace de stingere`)}
        list="fireEquipment"
        context={context}
        noun={() => 'mijlocul'}
        empty="Documentele nu numesc mijloace de stingere."
        render={(state) => (
          <ItemRow
            key={state.item.id}
            state={state}
            context={context}
            title={`${itemName('fireEquipment', state.values)}${state.values.count && Number(state.values.count) > 1 ? ` · ${state.values.count} bucăți` : ''}`}
            details={[
              [
                referenceName(context, 'workplaces', state.values.workplace),
                text(state.values.room),
              ]
                .filter(Boolean)
                .join(' · '),
            ]}
            onEdit={() => open(state, equipmentFields)}
          />
        )}
      />
      <ListCard
        title={(count) => (count === 1 ? 'O instalație' : `${count} instalații`)}
        list="fireInstallations"
        context={context}
        noun={() => 'instalația'}
        empty="Documentele nu numesc instalații PSI."
        render={(state) => (
          <ItemRow
            key={state.item.id}
            state={state}
            context={context}
            title={itemName('fireInstallations', state.values)}
            details={[
              text(state.values.description),
              referenceName(context, 'workplaces', state.values.workplace),
            ]}
            onEdit={() => open(state, installationFields)}
          />
        )}
      />
      {dialog}
    </>
  );
}

export function EquipmentSection({ context }: { context: ItemsContext }) {
  const { open, dialog } = useItemDialog(context);
  const positions = referenceOptions(context, 'jobPositions');
  const fields: ItemDialogField[] = [
    { name: 'item', label: 'Articolul', kind: 'text', required: true },
    { name: 'risk', label: 'Riscul', kind: 'text', required: true },
    { name: 'jobPosition', label: 'Postul', kind: 'reference', required: true, options: positions },
    { name: 'quantity', label: 'Cantitatea', kind: 'number' },
    { name: 'durationMonths', label: 'Durata (luni)', kind: 'number' },
    {
      name: 'allocation',
      label: 'Alocarea',
      kind: 'select',
      options: [
        { value: '', label: 'Nespecificată' },
        ...Object.entries(allocationLabels).map(([value, label]) => ({ value, label })),
      ],
    },
  ];
  return (
    <>
      <ListCard
        title={(count) => (count === 1 ? 'Un articol' : `${count} articole`)}
        list="protectiveEquipment"
        context={context}
        noun={() => 'articolul'}
        empty="Documentele nu numesc echipament de protecție."
        render={(state) => (
          <ItemRow
            key={state.item.id}
            state={state}
            context={context}
            title={itemName('protectiveEquipment', state.values)}
            details={[
              referenceName(context, 'jobPositions', state.values.jobPosition),
              [
                text(state.values.risk) ?? 'Riscul lipsește',
                state.values.quantity ? `${state.values.quantity} buc.` : null,
                state.values.durationMonths ? `${state.values.durationMonths} luni` : null,
                state.values.allocation ? allocationLabel(String(state.values.allocation)) : null,
              ]
                .filter(Boolean)
                .join(' · '),
            ]}
            onEdit={() => open(state, fields)}
          />
        )}
      />
      {dialog}
    </>
  );
}
