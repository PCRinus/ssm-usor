import {
  type CountyCode,
  countyNames,
  fireEquipmentKindLabels,
  fireEquipmentKinds,
  type FireExtinguisherNorm,
  fireExtinguisherNormLabels,
  fireExtinguisherNorms,
  fireExtinguishingAgentLabels,
  fireExtinguishingAgents,
  fireInstallationKindLabels,
  fireInstallationKinds,
  responsiblePersonRoles,
  type StaffCategory,
  type WorkplaceKind,
  workplaceKindLabels,
  workplaceKinds,
} from '@ssm-usor/contracts';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { Copy, HardHat, UserRound } from 'lucide-react';
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
  durationBlockerNote,
  employeeRoleLabel,
  flagNote,
  flagsAt,
  itemFieldLabel,
  type ItemList,
  itemName,
  itemSources,
  itemSpellings,
  type ItemState,
  itemStates,
  type LabelledSource,
  roleLabel,
  sameValue,
  type Source,
  unprovenRoles,
} from './review-model';
import {
  EditButton,
  EditedTag,
  LinkButton,
  ReviewCard,
  RowNote,
  SourceButton,
  SpellingPair,
} from './review-parts';

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
  const spelling = (state.item.spelling ?? {}) as Record<string, string>;
  const values: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(next)) {
    const value = blank(raw);
    const before = blank(
      key === 'workplace' || key === 'jobPosition' ? referenceId(original[key]) : original[key]
    );
    const same = Array.isArray(value)
      ? JSON.stringify(value) === JSON.stringify(before)
      : value === before || (value !== null && before !== null && sameValue(value, before));
    // sameValue ignores capitals and diacritics, all that sets the document's spelling apart.
    if (!same || (value !== before && value === spelling[key])) values[key] = value;
  }
  return values;
}

const spellingLabels: Record<string, string> = {
  name: 'Denumire',
  activity: 'Activitate',
  workZone: 'Zona de lucru',
  activities: 'Activități',
  item: 'Articol',
  risk: 'Risc',
  room: 'Încăpere',
  assemblyPoint: 'Punctul de adunare',
  combustibleMaterials: 'Materiale combustibile',
  ignitionSources: 'Surse de aprindere',
  fireRiskEquipment: 'Echipamente și mijloace de lucru',
  specificMeasures: 'Măsuri specifice',
};

function ItemRow({
  state,
  context,
  title,
  details,
  sources = itemSources(state),
  onEdit,
}: {
  state: ItemState;
  context: ItemsContext;
  title: string;
  details: ReactNode[];
  sources?: LabelledSource[];
  onEdit?: () => void;
}) {
  const prefix = `${state.list}.${state.index}`;
  const blockers = context.blockers.filter(
    (blocker) => blocker.path === prefix || blocker.path.startsWith(`${prefix}.`)
  );
  const roles = (state.values.roles as string[] | undefined) ?? [];
  const flags = flagsAt(context.proposal, prefix).filter((flag) => {
    const [, , field, role] = flag.path.split('.');
    return (
      !['missing', 'unknown_reference'].includes(flag.code) &&
      (field !== 'roles' || roles.includes(role ?? ''))
    );
  });
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
        {itemSpellings(state, context.changes).map(({ field, value, written }) => (
          <SpellingPair
            key={field}
            label={spellingLabels[field] ?? itemFieldLabel(field)}
            value={value}
            written={written}
            onKeep={() =>
              context.review.setItem(state.item.id, (current) => ({
                ...current,
                values: { ...current.values, [field]: written },
              }))
            }
          />
        ))}
        {blockers.map((blocker) => {
          const field = blocker.path.split('.')[2];
          return (
            <RowNote key={`${blocker.path}-${blocker.code}`} tone="danger">
              {state.list === 'protectiveEquipment' && field === 'durationMonths'
                ? durationBlockerNote(blocker.code, state.values)
                : blocker.code === 'unknown_reference'
                  ? `Alege ${itemFieldLabel(field ?? 'workplace')}.`
                  : blocker.code === 'invalid'
                    ? `Corectează ${field ? itemFieldLabel(field) : 'datele'}.`
                    : `Lipsește ${field ? itemFieldLabel(field) : 'o dată obligatorie'}.`}
            </RowNote>
          );
        })}
        {flags.map((flag) => (
          <RowNote key={`${flag.path}-${flag.code}`}>
            {flagNote(flag, context.proposal, context.changes)}
          </RowNote>
        ))}
      </div>
      <div className="flex flex-wrap items-start gap-4 sm:justify-end">
        <SourceButton
          sources={sources}
          onOpen={() => context.openSource(title, sources, state.item.otherCompanyName)}
        />
        {onEdit && <EditButton onClick={onEdit} />}
      </div>
    </li>
  );
}

function OtherCompanyBox(props: {
  states: ItemState[];
  context: ItemsContext;
  noun: (state: ItemState) => string;
}) {
  return (
    <OptionalBox
      {...props}
      title="Posibil de la alt client"
      description="Apar doar în pasaje copiate din documentele altei firme. Le preluăm numai dacă le bifezi."
      icon={<Copy className="mt-0.5 size-4" aria-hidden="true" />}
      testId="review-other-company"
    />
  );
}

function OptionalBox({
  states,
  context,
  noun,
  title,
  description,
  icon,
  testId,
  detail,
}: {
  states: ItemState[];
  context: ItemsContext;
  noun: (state: ItemState) => string;
  title: string;
  description: string;
  icon: ReactNode;
  testId: string;
  detail?: (state: ItemState) => string;
}) {
  if (states.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={title}
      data-testid={testId}
      className="mt-2 grid gap-2 rounded-lg border border-dashed bg-muted/30 px-4 py-3"
    >
      <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2.5 gap-y-0.5">
        {icon}
        <span className="text-sm font-medium">{title}</span>
        <span className="col-start-2 text-[13px] text-muted-foreground">{description}</span>
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
                {state.item.otherCompanyName ? (
                  <span className="text-[13px] text-muted-foreground">
                    De la {state.item.otherCompanyName}
                  </span>
                ) : (
                  detail?.(state) && (
                    <span className="text-[13px] text-muted-foreground">{detail(state)}</span>
                  )
                )}
              </span>
              <SourceButton
                sources={state.item.sources}
                onOpen={() =>
                  context.openSource(name, itemSources(state), state.item.otherCompanyName)
                }
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Ticked, an entry kept apart from its post joins the list, whose row is where its post is chosen.
const listed = (state: ItemState) =>
  state.included && (state.proposed || state.untickedReason === 'position_left_out');

function ListCard({
  title,
  list,
  context,
  noun,
  render,
  empty,
  untickedBox,
}: {
  title: (count: number) => string;
  list: ItemList;
  context: ItemsContext;
  noun: (state: ItemState) => string;
  render: (state: ItemState) => ReactNode;
  empty: string;
  untickedBox?: (states: ItemState[]) => ReactNode;
}) {
  const states = itemStates(context.proposal, context.changes, list);
  const kept = states.filter(listed);
  const aside = states.filter((state) => !listed(state));
  return (
    <ReviewCard title={title(kept.length)} testId={`review-list-${list}`}>
      {kept.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y">{kept.map(render)}</ul>
      )}
      {untickedBox?.(
        aside.filter((state) => !state.proposed && state.untickedReason !== 'other_company')
      )}
      <OtherCompanyBox
        states={aside
          .filter((state) => state.untickedReason === 'other_company')
          .concat(aside.filter((state) => state.proposed))}
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

const fireTexts = [
  ['assemblyPoint', 'Punctul de adunare'],
  ['combustibleMaterials', 'Materiale combustibile'],
  ['ignitionSources', 'Surse de aprindere'],
  ['fireRiskEquipment', 'Echipamente și mijloace de lucru'],
  ['specificMeasures', 'Măsuri specifice'],
] as const;

const fireTextFields = fireTexts.map(([field]) => field);

function oneOf<T extends string>(values: readonly T[], value: unknown): T | '' {
  return values.includes(value as T) ? (value as T) : '';
}

function fireSheetDetails(values: Record<string, unknown>): string[] {
  const norm = values.extinguisherNorm as FireExtinguisherNorm | null | undefined;
  const space = [
    values.kind ? (workplaceKindLabels[values.kind as WorkplaceKind] ?? String(values.kind)) : null,
    values.floorAreaM2 != null ? `Suprafața utilă ${String(values.floorAreaM2)} m²` : null,
    norm ? `Norma de dotare: ${fireExtinguisherNormLabels[norm]?.label ?? String(norm)}` : null,
  ].filter(Boolean);
  return [
    space.join(' · '),
    ...fireTexts.flatMap(([field, label]) =>
      text(values[field]) ? [`${label}: ${String(values[field])}`] : []
    ),
  ].filter(Boolean);
}

function workplaceSources(item: ItemState['item']): Source[] {
  const bySource = new Map<string, Source>();
  const fieldSources = (item.fieldSources ?? {}) as Record<string, Source[]>;
  for (const source of [...item.sources, ...Object.values(fieldSources).flat()]) {
    bySource.set(`${source.file}\u0000${source.quote}`, source);
  }
  return [...bySource.values()];
}

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
          kind: oneOf(workplaceKinds, editing.values.kind) || 'fixed_space',
          floorAreaM2: editing.values.floorAreaM2 == null ? '' : String(editing.values.floorAreaM2),
          extinguisherNorm: oneOf(fireExtinguisherNorms, editing.values.extinguisherNorm),
          ...Object.fromEntries(
            fireTextFields.map((field) => [field, String(editing.values[field] ?? '')])
          ),
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
              kind:
                editing.values.kind == null && values.kind === 'fixed_space' ? null : values.kind,
              floorAreaM2: /^[0-9]+$/.test(values.floorAreaM2) ? Number(values.floorAreaM2) : null,
              extinguisherNorm: values.extinguisherNorm || null,
              ...Object.fromEntries(
                fireTextFields.map((field) => [field, values[field].trim() || null])
              ),
            }) as Record<string, string | number | boolean | null>,
          })),
        aside: quoteAside(editing.item.sources, () =>
          context.openSource(String(editing.values.name), workplaceSources(editing.item))
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
                ...fireSheetDetails(state.values),
              ]}
              sources={workplaceSources(state.item)}
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
          staffCategory: (editing.values.staffCategory as StaffCategory | null) ?? '',
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
            values: {
              ...(current.values?.needsProtectiveEquipment === undefined
                ? {}
                : { needsProtectiveEquipment: current.values.needsProtectiveEquipment }),
              ...(changedValues(editing, {
                name: values.name.trim(),
                staffCategory: values.staffCategory,
                workZone: values.workZone.trim() || null,
                activities: values.activities.trim() || null,
                trainingIntervalMonths: values.trainingIntervalMonths
                  ? Number(values.trainingIntervalMonths)
                  : null,
              }) as Record<string, string | number | null>),
            },
          })),
        aside: quoteAside(editing.item.sources, () =>
          context.openSource(String(editing.values.name), itemSources(editing))
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
        untickedBox={(states) => (
          <OptionalBox
            states={states}
            context={context}
            noun={() => 'postul'}
            title="Doar dacă lucrează în firmă cu contract de muncă"
            description="Doar conducerea firmei, fără altă meserie. Un administrator numit prin mandat nu e lucrător și nu are nevoie de post, evaluare sau instruire. Bifează postul dacă cine îl ocupă are contract de muncă."
            icon={<UserRound className="mt-0.5 size-4" aria-hidden="true" />}
            testId="review-management-only"
            detail={(state) => text(state.values.activities) ?? ''}
          />
        )}
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
              <EquipmentDecision key="equipment" state={state} context={context} />,
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

// Only "needs none" is the documents' to decide: the entries decide that a post needs some.
function EquipmentDecision({ state, context }: { state: ItemState; context: ItemsContext }) {
  if (state.item.needsProtectiveEquipment !== false) return null;
  const undecided = state.values.needsProtectiveEquipment === null;
  const decide = (needsProtectiveEquipment: false | null) =>
    context.review.setItem(state.item.id, (current) => {
      const values = { ...current.values };
      if (needsProtectiveEquipment === null) values.needsProtectiveEquipment = null;
      else delete values.needsProtectiveEquipment;
      return { ...current, values };
    });
  return (
    <span className="flex flex-wrap items-baseline gap-x-2" data-testid="review-equipment-decision">
      {undecided
        ? 'Echipamentul de protecție rămâne de stabilit'
        : 'Nu necesită echipament de protecție'}
      <LinkButton className="text-[13px]" onClick={() => decide(undecided ? false : null)}>
        {undecided ? 'Postul nu necesită echipament' : 'Lasă de stabilit'}
      </LinkButton>
    </span>
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
          itemSources(editing.state)
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
  const isLegalRepresentative = (state: ItemState) =>
    state.untickedReason === 'legal_representative';
  const employeeRow = (state: ItemState) => (
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
        !state.proposed && (
          <LinkButton
            className="w-fit text-[13px]"
            onClick={() =>
              context.review.setItem(state.item.id, (current) => ({
                ...current,
                included: false,
              }))
            }
          >
            Nu-l face angajat
          </LinkButton>
        ),
      ]}
      onEdit={() => open(state, employeeFields)}
    />
  );
  const left = employees.filter((state) => !state.included);
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
          const unproven = unprovenRoles(context.proposal, state);
          return (
            <ItemRow
              key={state.item.id}
              state={state}
              context={context}
              title={itemName('responsiblePersons', state.values)}
              details={[
                text(state.values.jobTitle) ?? 'Funcția lipsește',
                roles
                  .map((role) =>
                    unproven.has(role) ? `${roleLabel(role)} (pasaj negăsit)` : roleLabel(role)
                  )
                  .join(', '),
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
          {employees.some((state) => state.included) && (
            <ul className="divide-y">
              {employees.filter((state) => state.included).map(employeeRow)}
            </ul>
          )}
          <OptionalBox
            states={left.filter(isLegalRepresentative)}
            context={context}
            noun={() => 'ca angajat pe'}
            title="Doar dacă lucrează în firmă"
            description="Reprezentantul legal devine angajat numai dacă face parte din personalul firmei. Bifează-l dacă e așa; îi vei scrie apoi data angajării."
            icon={<UserRound className="mt-0.5 size-4" aria-hidden="true" />}
            testId="review-legal-representative"
            detail={(state) =>
              [employeeRoleLabel(state.values.role), text(state.values.jobTitle)]
                .filter(Boolean)
                .join(' · ')
            }
          />
          <OtherCompanyBox
            states={left.filter((state) => !isLegalRepresentative(state))}
            context={context}
            noun={() => 'ca angajat pe'}
          />
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
        untickedBox={(states) => (
          <OptionalBox
            states={states}
            context={context}
            noun={() => 'articolul'}
            title="Pentru posturi pe care nu le preiei"
            description="Se preiau odată cu postul lor. Bifează un articol doar ca să-l muți pe alt post."
            icon={<HardHat className="mt-0.5 size-4" aria-hidden="true" />}
            testId="review-position-left-out"
            detail={(state) =>
              `Postul ${referenceName(context, 'jobPositions', state.values.jobPosition) ?? ''}`
            }
          />
        )}
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
              !state.proposed && (
                <LinkButton
                  className="w-fit text-[13px]"
                  onClick={() =>
                    context.review.setItem(state.item.id, (current) => ({
                      ...current,
                      included: false,
                    }))
                  }
                >
                  Lasă-l cu postul
                </LinkButton>
              ),
            ]}
            onEdit={() => open(state, fields)}
          />
        )}
      />
      {dialog}
    </>
  );
}
