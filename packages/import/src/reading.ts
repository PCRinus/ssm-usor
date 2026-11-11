import {
  equipmentAllocations,
  fireEquipmentKinds,
  fireExtinguisherNorms,
  fireExtinguishingAgents,
  fireInstallationKinds,
  responsiblePersonRoles,
  romanianCounties,
  staffCategories,
  workplaceKinds,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import { substanceNameAllowed, substanceParts, workplaceValueAllowed } from './checks';
import { inferValues, officeWithoutActivity } from './inference';
import { contained, cuiDigits, foldName, foldText, sameAddress, similar, streetKey } from './match';
import { countedOnce } from './means-count';
import {
  clientFieldNames,
  type Field,
  fireSafetyIntegerFieldNames,
  fireSafetySubstancesFieldNames,
  fireSafetyTextFieldNames,
  fireSafetyYesNoFieldNames,
  importedEmployeeRoles,
  type JobPositionFactFieldName,
  jobPositionFactFieldNames,
  type Option,
  type Proposal,
  proposalSchema,
  type ProposedJobPosition,
  type ProposedResponsiblePerson,
  type Source,
  type SuggestedWorkplaceFieldName,
  suggestedWorkplaceFieldNames,
  trainingScheduleFieldNames,
  trainingScheduleYesNoFieldNames,
  type WorkplaceFireFieldName,
  workplaceFireFieldNames,
  yesNoValues,
} from './proposal';
import { correctProposalSpelling } from './spelling';
import { answerFormat, months, wireMonths } from './wire';

export const factFields = [
  ...clientFieldNames.map((name) => `client.${name}`),
  ...trainingScheduleFieldNames.map((name) => `trainingSchedule.${name}`),
  ...trainingScheduleYesNoFieldNames.map((name) => `trainingSchedule.${name}`),
  ...fireSafetyIntegerFieldNames.map((name) => `fireSafety.${name}`),
  ...fireSafetyTextFieldNames.map((name) => `fireSafety.${name}`),
  ...fireSafetyYesNoFieldNames.map((name) => `fireSafety.${name}`),
  ...fireSafetySubstancesFieldNames.map((name) => `fireSafety.${name}`),
] as [string, ...string[]];

const integerFacts = new Set([
  ...trainingScheduleFieldNames.map((name) => `trainingSchedule.${name}`),
  ...fireSafetyIntegerFieldNames.map((name) => `fireSafety.${name}`),
]);

const yesNoFacts = new Set([
  ...trainingScheduleYesNoFieldNames.map((name) => `trainingSchedule.${name}`),
  ...fireSafetyYesNoFieldNames.map((name) => `fireSafety.${name}`),
]);

const quoted = {
  file: z.string(),
  quote: z.string(),
  otherCompany: z.string().nullable(),
};

// What the model returns, before the wire form's flattening. Single values are one list keyed
// by field, which keeps the grammar small and lets documents that disagree give one entry each.
export const readingSchema = z.object({
  facts: z.array(z.object({ field: z.enum(factFields), value: z.string(), ...quoted })),
  workplaces: z.array(
    z.object({
      name: z.string(),
      county: z.string().nullable(),
      locality: z.string().nullable(),
      addressLine: z.string().nullable(),
      isRegisteredOffice: z.boolean(),
      activity: z.string().nullable(),
      rooms: z.array(z.string()),
      ...quoted,
    })
  ),
  // A workplace's fire-safety values come from other documents than its address, so each has
  // its own passage, as the facts do.
  workplaceFacts: z.array(
    z.object({
      workplace: z.string(),
      field: z.enum(workplaceFireFieldNames),
      value: z.string(),
      ...quoted,
    })
  ),
  // Drafted from the client's activity where no document states the value (ADR 041): each cites
  // the passages it was drawn from, so a draft has no single quote holding it.
  workplaceSuggestions: z.array(
    z.object({
      workplace: z.string(),
      field: z.enum(suggestedWorkplaceFieldNames),
      value: z.string(),
      sources: z.array(z.object({ file: z.string(), quote: z.string() })),
    })
  ),
  jobPositions: z.array(
    z.object({
      name: z.string(),
      trainingIntervalMonths: months(z.int()).nullable(),
      workZone: z.string().nullable(),
      managementOnly: z.boolean(),
      // An enum, since a boolean on the wire cannot be unknown.
      needsProtectiveEquipment: z.enum(yesNoValues).nullable(),
      ...quoted,
    })
  ),
  // A post's category and activities come from other decisions than its name (the training
  // decision, the risk assessment), so each has its own passage.
  jobPositionFacts: z.array(
    z.object({
      jobPosition: z.string(),
      field: z.enum(jobPositionFactFieldNames),
      value: z.string(),
      ...quoted,
    })
  ),
  // A person's roles come from several decisions, so each role has its own passage, and the
  // person's own passage gives the name and the post.
  responsiblePersons: z.array(
    z.object({
      fullName: z.string(),
      jobTitle: z.string().nullable(),
      roles: z.array(
        z.object({ role: z.enum(responsiblePersonRoles), file: z.string(), quote: z.string() })
      ),
      workplace: z.string().nullable(),
      ...quoted,
    })
  ),
  fireEquipment: z.array(
    z.object({
      workplace: z.string().nullable(),
      room: z.string().nullable(),
      kind: z.enum(fireEquipmentKinds),
      agent: z.enum(fireExtinguishingAgents).nullable(),
      capacity: z.int().nullable(),
      wheeled: z.boolean(),
      count: z.int().nullable(),
      ...quoted,
    })
  ),
  fireInstallations: z.array(
    z.object({
      workplace: z.string().nullable(),
      kind: z.enum(fireInstallationKinds),
      description: z.string().nullable(),
      ...quoted,
    })
  ),
  substances: z.array(z.object({ name: z.string(), ...quoted })),
  protectiveEquipment: z.array(
    z.object({
      jobPositions: z.array(z.string()),
      risk: z.string().nullable(),
      item: z.string(),
      quantity: z.int().nullable(),
      durationMonths: months(z.int()).nullable(),
      allocation: z.enum(equipmentAllocations).nullable(),
      ...quoted,
    })
  ),
  employees: z.array(
    z.object({
      role: z.enum(importedEmployeeRoles),
      lastName: z.string().nullable(),
      firstName: z.string().nullable(),
      cnp: z.string().nullable(),
      birthDate: z.string().nullable(),
      jobTitle: z.string().nullable(),
      hiredAt: z.string().nullable(),
      ...quoted,
    })
  ),
  notes: z.array(z.string()),
});

export type Reading = z.infer<typeof readingSchema>;

export const readingAnswer = answerFormat('client_import', readingSchema);

export function fromWire(wire: unknown): Proposal {
  return toProposal(readingAnswer.parse(wire));
}

interface Quoted {
  file: string;
  quote: string;
  otherCompany: string | null;
}

// Models copy more of a file's header than its path, and a scan's reading kept on its file
// may hold an older label's "(image follows)"; a page's "(pagina N)" stays, since it names it.
function cleanFile(file: string) {
  return file
    .trim()
    .replace(/^=+\s*FILE:\s*/i, '')
    .replace(/\s*=+$/, '')
    .replace(/\s*\(image follows\)$/i, '')
    .trim();
}

const sourceOf = (entry: Source): Source => ({ file: cleanFile(entry.file), quote: entry.quote });

const traced = (entry: Quoted) => ({
  sources: [sourceOf(entry)],
  otherCompanyName: entry.otherCompany,
});

interface Traced {
  sources: Source[];
  otherCompanyName: string | null;
}

function mergeTraced(into: Traced, from: Traced) {
  mergeSources(into.sources, from.sources);
  if (from.otherCompanyName === null) into.otherCompanyName = null;
}

function fillGaps<T extends object>(into: T, from: T) {
  for (const key of Object.keys(from) as (keyof T)[]) {
    if (into[key] === null) into[key] = from[key];
  }
}

// Readings give the same thing once each; the first reading, the documents', keeps its words.
function joined<T extends Traced>(
  items: T[],
  same: (a: T, b: T) => boolean,
  merge: (into: T, from: T) => void
) {
  const kept: T[] = [];
  for (const item of items) {
    const known = kept.find((each) => same(each, item));
    if (!known) {
      kept.push(item);
      continue;
    }
    mergeTraced(known, item);
    merge(known, item);
  }
  return kept;
}

// Joining widens a name, which can then hold an entry kept apart before, so it runs until
// nothing joins.
function joinedSubstances<T extends Traced & { name: string }>(items: T[]) {
  const within = (a: Set<string>, b: Set<string>) =>
    a.size > 0 && [...a].every((part) => b.has(part));
  let kept = items;
  for (;;) {
    const next = joined(
      kept,
      (a, b) => {
        if (foldText(a.name) === foldText(b.name)) return true;
        const [partsA, partsB] = [substanceParts(a.name), substanceParts(b.name)];
        return within(partsA, partsB) || within(partsB, partsA);
      },
      (into, from) => {
        const [intoParts, fromParts] = [
          substanceParts(into.name).size,
          substanceParts(from.name).size,
        ];
        if (
          fromParts > intoParts ||
          (fromParts === intoParts && nonAsciiCount(from.name) > nonAsciiCount(into.name))
        ) {
          into.name = from.name;
        }
      }
    );
    if (next.length === kept.length) return next;
    kept = next;
  }
}

const employeeName = (employee: { lastName: string | null; firstName: string | null }) =>
  foldName([employee.lastName, employee.firstName].filter(Boolean).join(' '));

function countyCode(written: string) {
  const compact = written.trim().toUpperCase();
  const byCode = romanianCounties.find((county) => county.code === compact);
  if (byCode) return byCode.code;
  const folded = foldText(written)
    .replace(/^(judetul|judet|jud|municipiul|mun)\s+/, '')
    .trim();
  if (/^(bucuresti|sector(ul)? [1-6])( |$)/.test(folded)) return 'B';
  return romanianCounties.find((county) => foldText(county.name) === folded)?.code ?? written;
}

function yesNo(written: string) {
  const folded = foldText(written);
  if (['true', 'da', 'yes'].includes(folded)) return 'true';
  if (['false', 'nu', 'no'].includes(folded)) return 'false';
  return null;
}

function wasteKinds(written: string) {
  const kinds = uniqueFolded(written.split(/[;\n]+/).map((kind) => kind.trim()));
  return kinds.length === 0 ? null : kinds.join('; ');
}

function factValue(field: string, value: string): string | number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (field.endsWith('IntervalMonths')) return wireMonths(trimmed);
  if (integerFacts.has(field)) {
    const digits = trimmed.match(/\d+/)?.[0];
    return digits === undefined ? null : Number(digits);
  }
  if (yesNoFacts.has(field)) return yesNo(trimmed);
  if (field === 'client.cui') return cuiDigits(trimmed) ?? trimmed;
  if (field === 'client.countyCode') return countyCode(trimmed);
  if (field === 'fireSafety.wasteKinds') return wasteKinds(trimmed);
  // "listed" stands on the substances named, never on a sentence that some are used.
  if (field === 'fireSafety.substancesState') return foldText(trimmed) === 'none' ? 'none' : null;
  return trimmed;
}

// "1.250,5 mp" is 1251: Romanian groups thousands with a point or a space and writes a decimal
// comma.
function floorArea(written: string) {
  const grouped = written.match(/\d{1,3}(?:[.\s]\d{3})+(?:,\d+)?/)?.[0];
  const number = grouped ? grouped.replace(/[.\s]/g, '') : written.match(/\d+(?:[.,]\d+)?/)?.[0];
  return number === undefined ? null : Math.round(Number(number.replace(',', '.')));
}

function workplaceKind(written: string) {
  if ((workplaceKinds as readonly string[]).includes(written)) return written;
  return /santier|mobil/.test(foldText(written)) ? 'mobile_site' : written;
}

function workplaceFactValue(field: WorkplaceFireFieldName, value: string): string | number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (field === 'floorAreaM2') return floorArea(trimmed);
  if (field === 'kind') return workplaceKind(trimmed);
  if (field === 'extinguisherNorm') {
    const code = trimmed.toLowerCase();
    return (fireExtinguisherNorms as readonly string[]).includes(code) ? code : trimmed;
  }
  return trimmed;
}

function staffCategory(written: string) {
  if ((staffCategories as readonly string[]).includes(written)) return written;
  const folded = foldText(written);
  if (folded.includes('executie') || folded.includes('execution')) return 'execution';
  // Fire-safety themes add auxiliary staff (cleaning, guarding), whose physical work is execution.
  if (folded.includes('auxiliar')) return 'execution';
  if (folded.includes('tehnic') || folded.includes('technical')) return 'technical_administrative';
  return null;
}

function jobPositionFactValue(field: JobPositionFactFieldName, value: string) {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return field === 'staffCategory' ? staffCategory(trimmed) : trimmed;
}

function sameValue(a: string | number, b: string | number) {
  return typeof a === 'number' || typeof b === 'number' ? a === b : foldText(a) === foldText(b);
}

function nonAsciiCount(value: string | number) {
  return typeof value === 'number' ? 0 : (value.match(/[^\p{ASCII}]/gu)?.length ?? 0);
}

function mergeSources(into: Source[], from: Source[]) {
  for (const source of from) {
    if (!into.some((known) => known.file === source.file && known.quote === source.quote)) {
      into.push(source);
    }
  }
}

const phoneDigits = (value: string | number) =>
  String(value)
    .replace(/\D/g, '')
    .replace(/^(0040|40)(?=\d{9}$)/, '0');

const sameBy =
  (key: (value: string | number) => string) => (a: string | number, b: string | number) =>
    key(a) === '' || key(b) === '' ? sameValue(a, b) : key(a) === key(b);

const sameFactValue: Record<string, (a: string | number, b: string | number) => boolean> = {
  'client.legalName': sameBy((value) => foldName(String(value))),
  'client.addressLine': sameBy((value) => streetKey(String(value))),
  'client.contactPhone': sameBy(phoneDigits),
};

function addOption<T extends string | number>(
  options: Option<T>[],
  option: Option<T>,
  same: (a: T, b: T) => boolean = sameValue
) {
  const known = options.find((each) => same(each.value, option.value));
  if (!known) {
    options.push({ ...option, sources: [...option.sources] });
    return;
  }
  mergeSources(known.sources, option.sources);
  if (option.otherCompanyName === null) known.otherCompanyName = null;
  // Of two spellings that differ only in diacritics, the one with them is the correct Romanian;
  // otherwise the first spelling stays.
  if (
    sameValue(known.value, option.value) &&
    nonAsciiCount(option.value) > nonAsciiCount(known.value)
  ) {
    known.value = option.value;
  }
}

// "Smoking is forbidden on the premises" beside "allowed in the marked place at the gate" is one
// rule, which the smoking decision's designated places already writes whole ("În afara acestor
// locuri, fumatul este interzis…"). Without a place read, the two stay a choice.
function joinSmokingRules(fireSafety: Record<string, Field<string | number>>) {
  const policies = fireSafety.smokingPolicy!.options;
  const designated = policies.find((option) => option.value === 'designated_places');
  const forbidden = policies.find((option) => option.value === 'forbidden_everywhere');
  const placed = fireSafety.smokingPlace!.options.some(
    (option) => option.otherCompanyName === null
  );
  if (!designated || !forbidden || !placed) return;
  if (designated.otherCompanyName !== null || forbidden.otherCompanyName !== null) return;
  mergeSources(designated.sources, forbidden.sources);
  policies.splice(policies.indexOf(forbidden), 1);
}

function emptyFields<const K extends string>(names: readonly K[]) {
  return Object.fromEntries(names.map((name) => [name, { options: [] }])) as unknown as Record<
    K,
    Field<string | number>
  >;
}

function isoDate(written: string | null) {
  if (written === null) return null;
  const iso = written.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const romanian = written.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  const [year, month, day] = iso
    ? [iso[1], iso[2], iso[3]]
    : romanian
      ? [romanian[3], romanian[2]!.padStart(2, '0'), romanian[1]!.padStart(2, '0')]
      : [];
  if (!year) return null;
  const date = `${year}-${month}-${day}`;
  return z.iso.date().safeParse(date).success ? date : null;
}

interface Named {
  id: string;
  name: string;
}

const onlyId = (items: Named[]) => {
  const ids = new Set(items.map((item) => item.id));
  return ids.size === 1 ? [...ids][0]! : null;
};

// A workplace is also found by a prefix ("Sediul" for "Sediu"); a position only by its name,
// since "Ospătar" must not land on "Ospătar șef". An item may be listed under several names.
function resolve(name: string | null, items: Named[], byPrefix = false): string | null {
  if (name === null) return null;
  const exact = items.find((item) => foldName(item.name) === foldName(name));
  if (exact) return exact.id;
  const close = items.filter((item) => similar(item.name, name) >= 0.8);
  if (close.length > 0) return onlyId(close);
  if (!byPrefix) return null;
  return onlyId(items.filter((item) => contained(item.name, name) >= 0.75));
}

const named = (value: string | null) => value !== null && value.trim() !== '';

function uniqueFolded(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = foldText(value);
    if (key === '' || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const noFireValues = () => ({
  ...(Object.fromEntries(workplaceFireFieldNames.map((field) => [field, null])) as Record<
    WorkplaceFireFieldName,
    null
  >),
  fieldSources: {} as Record<string, Source[]>,
});

const readWorkplace = (workplace: Reading['workplaces'][number]) => ({
  ...traced(workplace),
  name: workplace.name,
  countyCode: workplace.county === null ? null : countyCode(workplace.county),
  locality: workplace.locality,
  addressLine: workplace.addressLine,
  isRegisteredOffice: workplace.isRegisteredOffice,
  activity: workplace.activity,
  rooms: workplace.rooms,
  ...noFireValues(),
  spelling: {} as Record<string, string>,
  officeHasActivity: true,
  suggested: {} as Record<string, Source[]>,
});

type ReadWorkplace = ReturnType<typeof readWorkplace>;

interface Valued {
  id: string;
  otherCompanyName: string | null;
  fieldSources: Record<string, Source[]>;
}

interface ValueFact extends Quoted {
  name: string;
  field: string;
  value: string | number | null;
}

// A value only another company's passages give is left for the member to write, since an
// item's values have no tick of their own, unless the item is that company's as a whole.
function fillValues(
  items: Valued[],
  facts: ValueFact[],
  itemOf: (name: string) => string | null
): string[] {
  const unplaced: string[] = [];
  for (const fact of facts) {
    if (fact.value === null) continue;
    const item = items.find((each) => each.id === itemOf(fact.name));
    if (fact.otherCompany !== null && (item?.otherCompanyName ?? null) === null) continue;
    if (!item) {
      if (!unplaced.some((name) => foldText(name) === foldText(fact.name))) {
        unplaced.push(fact.name.trim() || 'fără nume');
      }
      continue;
    }
    const values = item as unknown as Record<string, string | number | null>;
    const known = values[fact.field] ?? null;
    if (known !== null && !sameValue(known, fact.value)) continue;
    if (known === null) values[fact.field] = fact.value;
    item.fieldSources[fact.field] ??= [];
    mergeSources(item.fieldSources[fact.field]!, traced(fact).sources);
  }
  return unplaced;
}

type ReadPosition = Reading['jobPositions'][number] & {
  staffCategory?: string | null;
  activities?: string | null;
};

// A scan's page read before a post's category and activities had passages of their own gives
// them on the post, from its passage.
const inlinePositionFacts = (reading: Reading): Reading['jobPositionFacts'] =>
  (reading.jobPositions as ReadPosition[]).flatMap((position) =>
    jobPositionFactFieldNames.flatMap((field) => {
      const value = position[field];
      return typeof value === 'string'
        ? [
            {
              jobPosition: position.name,
              field,
              value,
              file: position.file,
              quote: position.quote,
              otherCompany: position.otherCompany,
            },
          ]
        : [];
    })
  );

type ReadRole = Reading['responsiblePersons'][number]['roles'][number];

// A scan's page read before roles had passages of their own lists bare roles, which stand on
// the person's passage.
const roleOf = (
  person: Reading['responsiblePersons'][number],
  entry: ReadRole | ReadRole['role']
): ReadRole =>
  typeof entry === 'string' ? { role: entry, file: person.file, quote: person.quote } : entry;

type Roles = Pick<ProposedResponsiblePerson, 'roles' | 'roleSources'>;

function addRoles(into: Roles, from: Roles) {
  into.roles = [...new Set([...into.roles, ...from.roles])];
  for (const [role, sources] of Object.entries(from.roleSources)) {
    into.roleSources[role] ??= [];
    mergeSources(into.roleSources[role]!, sources);
  }
}

interface Suggestion {
  workplaceId: string;
  field: SuggestedWorkplaceFieldName;
  value: string | number;
  sources: Source[];
}

// After the spelling is corrected: a draft is the model's own wording, with no document's
// spelling to keep beside it.
function applySuggestions(proposal: Proposal, suggestions: Suggestion[]) {
  for (const suggestion of suggestions) {
    const workplace = proposal.workplaces.find((each) => each.id === suggestion.workplaceId);
    if (!workplace || workplace.otherCompanyName !== null) continue;
    if (suggestion.field === 'extinguisherNorm' && workplace.kind === 'mobile_site') continue;
    const values = workplace as unknown as Record<string, string | number | null>;
    const known = workplace.suggested[suggestion.field];
    if (known) {
      if (sameValue(values[suggestion.field]!, suggestion.value)) {
        mergeSources(known, suggestion.sources);
      }
      continue;
    }
    if (values[suggestion.field] !== null) continue;
    values[suggestion.field] = suggestion.value;
    workplace.suggested[suggestion.field] = [...suggestion.sources];
  }
  return proposal;
}

export function toProposal(...readings: Reading[]): Proposal {
  const facts = readings.flatMap((reading) => reading.facts);
  const groups = {
    client: emptyFields(clientFieldNames),
    trainingSchedule: emptyFields([
      ...trainingScheduleFieldNames,
      ...trainingScheduleYesNoFieldNames,
    ]),
    fireSafety: emptyFields([
      ...fireSafetyIntegerFieldNames,
      ...fireSafetyTextFieldNames,
      ...fireSafetyYesNoFieldNames,
      ...fireSafetySubstancesFieldNames,
    ]),
  } as Record<string, Record<string, Field<string | number>>>;
  for (const fact of facts) {
    const value = factValue(fact.field, fact.value);
    if (value === null) continue;
    const [group, name] = fact.field.split('.') as [string, string];
    addOption(groups[group]![name]!.options, { value, ...traced(fact) }, sameFactValue[fact.field]);
  }
  joinSmokingRules(groups.fireSafety!);

  const list = <T>(pick: (reading: Reading) => T[]) => readings.flatMap(pick);

  // A workplace is an address, so the same address read from a scan joins the documents' one,
  // and the scan's name for it still finds it.
  const aliases = new Map<object, string[]>();
  const otherOfficeAddresses: string[] = [];
  const joinWorkplace = (into: ReadWorkplace, from: ReadWorkplace) => {
    fillGaps(into, from);
    aliases.set(into, [...(aliases.get(into) ?? []), from.name, ...(aliases.get(from) ?? [])]);
    into.isRegisteredOffice ||= from.isRegisteredOffice;
    into.rooms = uniqueFolded([...into.rooms, ...from.rooms]);
  };
  const atAddresses = joined(
    list((reading) => reading.workplaces)
      .filter((workplace) => named(workplace.name))
      .map(readWorkplace),
    sameAddress,
    joinWorkplace
  );
  // A client has one registered office, so two that documents place at different addresses are
  // one, the first kept, with the other address left for the member to check.
  const joinedWorkplaces = joined(
    atAddresses,
    (a, b) => a.isRegisteredOffice && b.isRegisteredOffice,
    (into, from) => {
      if (from.addressLine !== null && into.addressLine !== null) {
        otherOfficeAddresses.push(from.addressLine);
      }
      joinWorkplace(into, from);
    }
  );
  const workplaces = joinedWorkplaces.map((workplace, index) => ({
    id: `workplace-${index + 1}`,
    ...workplace,
  }));
  const workplaceNames = joinedWorkplaces.flatMap((workplace, index) =>
    [workplace.name, ...(aliases.get(workplace) ?? [])].map((name) => ({
      id: workplaces[index]!.id,
      name,
    }))
  );
  const onlyWorkplace = workplaces.length === 1 ? workplaces[0]!.id : null;
  const unplaced = fillValues(
    workplaces,
    // A scan's page read before the field existed has none.
    list((reading) => reading.workplaceFacts ?? []).map((fact) => ({
      ...fact,
      name: fact.workplace,
      value: workplaceFactValue(fact.field, fact.value),
    })),
    (name) => (named(name) ? (resolve(name, workplaceNames, true) ?? onlyWorkplace) : onlyWorkplace)
  );
  let withdrawnSuggestions = 0;
  const suggestions = list((reading) => reading.workplaceSuggestions ?? []).flatMap(
    (suggestion): Suggestion[] => {
      const workplaceId = named(suggestion.workplace)
        ? (resolve(suggestion.workplace, workplaceNames, true) ?? onlyWorkplace)
        : onlyWorkplace;
      const value = workplaceFactValue(suggestion.field, suggestion.value);
      if (workplaceId === null || value === null) return [];
      const sources = suggestion.sources
        .filter((source) => source.file.trim() !== '' && source.quote.trim() !== '')
        .map(sourceOf);
      if (sources.length === 0 || !workplaceValueAllowed(suggestion.field, value)) {
        withdrawnSuggestions++;
        return [];
      }
      return [{ workplaceId, field: suggestion.field, value, sources }];
    }
  );
  const workplaceReference = (name: string | null, unnamed: string | null = null) => ({
    name,
    id: name === null ? unnamed : resolve(name, workplaceNames, true),
  });

  const jobPositions = joined(
    list((reading) => reading.jobPositions)
      .filter((position) => named(position.name))
      .map((position) => ({
        ...traced(position),
        name: position.name,
        staffCategory: null as ProposedJobPosition['staffCategory'],
        trainingIntervalMonths: position.trainingIntervalMonths,
        workZone: position.workZone,
        activities: null as string | null,
        // A scan's page read before the field existed has none.
        managementOnly: position.managementOnly === true,
        needsProtectiveEquipment:
          position.needsProtectiveEquipment === 'true'
            ? true
            : position.needsProtectiveEquipment === 'false'
              ? false
              : null,
        fieldSources: {} as Record<string, Source[]>,
        spelling: {} as Record<string, string>,
        inferred: {} as ProposedJobPosition['inferred'],
      })),
    (a, b) => foldText(a.name) === foldText(b.name),
    (into, from) => {
      fillGaps(into, from);
      into.managementOnly &&= from.managementOnly;
    }
  ).map((position, index) => ({ id: `position-${index + 1}`, ...position }));
  const unplacedPositions = fillValues(
    jobPositions,
    readings
      .flatMap((reading) => [...inlinePositionFacts(reading), ...(reading.jobPositionFacts ?? [])])
      .map((fact) => ({
        ...fact,
        name: fact.jobPosition,
        value: jobPositionFactValue(fact.field, fact.value),
      })),
    (name) => resolve(name, jobPositions)
  );

  const responsiblePersons = joined(
    list((reading) => reading.responsiblePersons)
      .filter((person) => named(person.fullName) && person.roles.length > 0)
      .map((person) => {
        const roles: Roles = { roles: [], roleSources: {} };
        for (const entry of person.roles) {
          const { role, ...source } = roleOf(person, entry);
          addRoles(roles, { roles: [role], roleSources: { [role]: [sourceOf(source)] } });
        }
        return {
          ...traced(person),
          fullName: person.fullName,
          jobTitle: person.jobTitle,
          ...roles,
          workplace: person.workplace,
        };
      }),
    (a, b) => foldName(a.fullName) === foldName(b.fullName),
    (into, from) => {
      fillGaps(into, from);
      addRoles(into, from);
    }
  ).map((person, index) => ({
    id: `person-${index + 1}`,
    ...person,
    workplace: workplaceReference(person.workplace),
  }));

  // Means no document ties to a workplace go to the only one where activity can take place,
  // whatever the member later answers for the office (ADR 041, amended 2026-11-11).
  const inactiveOffice = officeWithoutActivity(workplaces, [
    ...list((reading) => reading.fireEquipment).map((each) => workplaceReference(each.workplace)),
    ...list((reading) => reading.fireInstallations).map((each) =>
      workplaceReference(each.workplace)
    ),
    ...responsiblePersons.map((person) => person.workplace),
  ])?.office;
  const active = workplaces.filter(
    (workplace) => workplace.otherCompanyName === null && workplace !== inactiveOffice
  );
  const meansWorkplace = onlyWorkplace ?? (active.length === 1 ? active[0]!.id : null);

  const { fireEquipment, fireEquipmentCounts } = countedOnce(
    list((reading) => reading.fireEquipment).map((equipment) => ({
      ...traced(equipment),
      workplace: workplaceReference(equipment.workplace, meansWorkplace),
      room: equipment.room,
      kind: equipment.kind,
      agent: equipment.agent,
      capacity: equipment.capacity,
      wheeled: equipment.wheeled,
      count: equipment.count,
      spelling: {},
    }))
  );
  const roomsOf = (ids: string[]) =>
    fireEquipment
      .filter((equipment) => ids.includes(equipment.id) && equipment.room !== null)
      .map((equipment) => equipment.room!);
  const counted = new Set(
    fireEquipmentCounts.flatMap((count) => count.options.flatMap((option) => option.equipmentIds))
  );
  for (const workplace of workplaces) {
    const rooms = roomsOf(
      fireEquipment
        .filter(
          (equipment) => equipment.workplace.id === workplace.id && !counted.has(equipment.id)
        )
        .map((equipment) => equipment.id)
    );
    // Only one option of a count is written, so a room only some options name may not exist.
    for (const count of fireEquipmentCounts) {
      if (count.workplace.id !== workplace.id) continue;
      const [first, ...others] = count.options.map((option) => roomsOf(option.equipmentIds));
      rooms.push(
        ...first!.filter((room) =>
          others.every((other) => other.some((each) => foldText(each) === foldText(room)))
        )
      );
    }
    workplace.rooms = uniqueFolded([...workplace.rooms, ...rooms]);
  }

  let ppeCount = 0;
  // A table naming several positions applies to each of them.
  const protectiveEquipment = list((reading) => reading.protectiveEquipment)
    .filter((entry) => named(entry.item))
    .flatMap((entry) => {
      const names = uniqueFolded(entry.jobPositions);
      return (names.length > 0 ? names : [null]).map((name) => ({
        id: `equipment-entry-${++ppeCount}`,
        ...traced(entry),
        jobPosition: { name, id: resolve(name, jobPositions) },
        risk: entry.risk,
        item: entry.item,
        quantity: entry.quantity,
        durationMonths: entry.durationMonths,
        allocation: entry.allocation,
        spelling: {},
      }));
    });
  // The entries are what the post receives, whatever another passage says of it.
  for (const position of jobPositions) {
    if (protectiveEquipment.some((entry) => entry.jobPosition.id === position.id)) {
      position.needsProtectiveEquipment = true;
    }
  }

  const substances = joinedSubstances(
    // A scan's page read before the field existed has none.
    list((reading) => reading.substances ?? [])
      .filter((substance) => substanceNameAllowed(substance.name))
      .map((substance) => ({
        ...traced(substance),
        name: substance.name.trim(),
        spelling: {} as Record<string, string>,
      }))
  ).map((substance, index) => ({ id: `substance-${index + 1}`, ...substance }));
  if (substances.length > 0) {
    const own = substances.filter((substance) => substance.otherCompanyName === null);
    const giving = own.length > 0 ? own : substances;
    const sources: Source[] = [];
    for (const substance of giving) mergeSources(sources, substance.sources);
    addOption(groups.fireSafety!.substancesState!.options, {
      value: 'listed',
      sources,
      otherCompanyName: own.length > 0 ? null : substances[0]!.otherCompanyName,
    });
  }

  const proposal: Proposal = {
    client: groups.client as Proposal['client'],
    trainingSchedule: groups.trainingSchedule as Proposal['trainingSchedule'],
    fireSafety: groups.fireSafety as Proposal['fireSafety'],
    workplaces,
    jobPositions,
    responsiblePersons,
    fireEquipment,
    fireEquipmentCounts,
    fireInstallations: list((reading) => reading.fireInstallations).map((installation, index) => ({
      id: `installation-${index + 1}`,
      ...traced(installation),
      workplace: workplaceReference(installation.workplace, meansWorkplace),
      kind: installation.kind,
      description: installation.description,
    })),
    protectiveEquipment,
    employees: joined(
      list((reading) => reading.employees).map((employee) => ({
        ...traced(employee),
        role: employee.role,
        lastName: employee.lastName,
        firstName: employee.firstName,
        cnp: employee.cnp === null ? null : employee.cnp.replace(/[\s.-]/g, ''),
        birthDate: isoDate(employee.birthDate),
        jobTitle: employee.jobTitle,
        hiredAt: isoDate(employee.hiredAt),
      })),
      (a, b) =>
        a.role === b.role &&
        (a.cnp === null || b.cnp === null
          ? employeeName(a) !== '' && employeeName(a) === employeeName(b)
          : a.cnp === b.cnp),
      fillGaps
    ).map((employee, index) => ({ id: `employee-${index + 1}`, ...employee })),
    substances,
    notes: [
      ...list((reading) => reading.notes).filter((note) => note.trim() !== ''),
      ...otherOfficeAddresses.map(
        (address) =>
          `Documentele dau sediul social și la adresa «${address}», care nu a fost preluată.`
      ),
      ...unplaced.map(
        (name) =>
          `Datele SU ale locului de muncă «${name}» nu se potrivesc cu niciun punct de lucru și nu au fost preluate.`
      ),
      ...unplacedPositions.map(
        (name) =>
          `Categoria și activitățile postului «${name}» nu se potrivesc cu niciun post și nu au fost preluate.`
      ),
    ],
    ...(withdrawnSuggestions > 0 ? { withdrawnSuggestions } : {}),
    flags: [],
  };
  return proposalSchema.parse(
    applySuggestions(correctProposalSpelling(inferValues(proposal)), suggestions)
  );
}
