import {
  equipmentAllocations,
  fireEquipmentKinds,
  fireExtinguishingAgents,
  fireInstallationKinds,
  normalizeCui,
  responsiblePersonRoles,
  romanianCounties,
  staffCategories,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import { contained, foldName, foldText, similar } from './match';
import {
  clientFieldNames,
  type Field,
  fireSafetyIntegerFieldNames,
  fireSafetyTextFieldNames,
  importedEmployeeRoles,
  type Option,
  type Proposal,
  proposalSchema,
  type Source,
  trainingScheduleFieldNames,
} from './proposal';
import { answerFormat } from './wire';

export const factFields = [
  ...clientFieldNames.map((name) => `client.${name}`),
  ...trainingScheduleFieldNames.map((name) => `trainingSchedule.${name}`),
  ...fireSafetyIntegerFieldNames.map((name) => `fireSafety.${name}`),
  ...fireSafetyTextFieldNames.map((name) => `fireSafety.${name}`),
] as [string, ...string[]];

const integerFacts = new Set([
  ...trainingScheduleFieldNames.map((name) => `trainingSchedule.${name}`),
  ...fireSafetyIntegerFieldNames.map((name) => `fireSafety.${name}`),
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
  jobPositions: z.array(
    z.object({
      name: z.string(),
      staffCategory: z.enum(staffCategories).nullable(),
      trainingIntervalMonths: z.int().nullable(),
      workZone: z.string().nullable(),
      activities: z.string().nullable(),
      ...quoted,
    })
  ),
  responsiblePersons: z.array(
    z.object({
      fullName: z.string(),
      jobTitle: z.string().nullable(),
      roles: z.array(z.enum(responsiblePersonRoles)),
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
  protectiveEquipment: z.array(
    z.object({
      jobPositions: z.array(z.string()),
      risk: z.string().nullable(),
      item: z.string(),
      quantity: z.int().nullable(),
      durationMonths: z.int().nullable(),
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

const traced = (entry: Quoted) => ({
  sources: [{ file: cleanFile(entry.file), quote: entry.quote }],
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

const addressWords = new Set(['str', 'strada', 'nr', 'numar', 'numarul']);

function streetKey(addressLine: string | null) {
  if (addressLine === null) return '';
  return foldText(addressLine)
    .split(' ')
    .filter((word) => word !== '' && !addressWords.has(word))
    .join(' ');
}

const sameAddress = (
  a: { locality: string | null; addressLine: string | null },
  b: { locality: string | null; addressLine: string | null }
) =>
  streetKey(a.addressLine) !== '' &&
  streetKey(a.addressLine) === streetKey(b.addressLine) &&
  (a.locality === null || b.locality === null || foldText(a.locality) === foldText(b.locality));

const employeeName = (employee: { lastName: string | null; firstName: string | null }) =>
  foldName([employee.lastName, employee.firstName].filter(Boolean).join(' '));

function countyCode(written: string) {
  const compact = written.trim().toUpperCase();
  const byCode = romanianCounties.find((county) => county.code === compact);
  if (byCode) return byCode.code;
  const folded = foldText(written)
    .replace(/^(judetul|judet|jud|municipiul)\s+/, '')
    .trim();
  if (folded === 'bucuresti' || folded.startsWith('bucuresti ')) return 'B';
  return romanianCounties.find((county) => foldText(county.name) === folded)?.code ?? written;
}

function factValue(field: string, value: string): string | number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (integerFacts.has(field)) {
    const digits = trimmed.match(/\d+/)?.[0];
    return digits === undefined ? null : Number(digits);
  }
  if (field === 'client.cui') return normalizeCui(trimmed)?.cui ?? trimmed;
  if (field === 'client.countyCode') return countyCode(trimmed);
  return trimmed;
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

function addOption<T extends string | number>(options: Option<T>[], option: Option<T>) {
  const same = options.find((known) => sameValue(known.value, option.value));
  if (!same) {
    options.push({ ...option, sources: [...option.sources] });
    return;
  }
  mergeSources(same.sources, option.sources);
  if (option.otherCompanyName === null) same.otherCompanyName = null;
  // Of two spellings that differ only in diacritics, the one with them is the correct Romanian.
  if (nonAsciiCount(option.value) > nonAsciiCount(same.value)) same.value = option.value;
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

/** Several readings, such as the documents' and each scan's, give one proposal. */
export function toProposal(...readings: Reading[]): Proposal {
  const facts = readings.flatMap((reading) => reading.facts);
  const groups = {
    client: emptyFields(clientFieldNames),
    trainingSchedule: emptyFields(trainingScheduleFieldNames),
    fireSafety: emptyFields([...fireSafetyIntegerFieldNames, ...fireSafetyTextFieldNames]),
  } as Record<string, Record<string, Field<string | number>>>;
  for (const fact of facts) {
    const value = factValue(fact.field, fact.value);
    if (value === null) continue;
    const [group, name] = fact.field.split('.') as [string, string];
    addOption(groups[group]![name]!.options, { value, ...traced(fact) });
  }

  const list = <T>(pick: (reading: Reading) => T[]) => readings.flatMap(pick);

  // A workplace is an address, so the same address read from a scan joins the documents' one,
  // and the scan's name for it still finds it.
  const aliases = new Map<object, string[]>();
  const joinedWorkplaces = joined(
    list((reading) => reading.workplaces)
      .filter((workplace) => named(workplace.name))
      .map((workplace) => ({
        ...traced(workplace),
        name: workplace.name,
        countyCode: workplace.county === null ? null : countyCode(workplace.county),
        locality: workplace.locality,
        addressLine: workplace.addressLine,
        isRegisteredOffice: workplace.isRegisteredOffice,
        activity: workplace.activity,
        rooms: workplace.rooms,
      })),
    sameAddress,
    (into, from) => {
      fillGaps(into, from);
      aliases.set(into, [...(aliases.get(into) ?? []), from.name]);
      into.isRegisteredOffice ||= from.isRegisteredOffice;
      into.rooms = uniqueFolded([...into.rooms, ...from.rooms]);
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
  const workplaceReference = (name: string | null, defaultToOnly: boolean) => ({
    name,
    id:
      name === null ? (defaultToOnly ? onlyWorkplace : null) : resolve(name, workplaceNames, true),
  });

  const jobPositions = joined(
    list((reading) => reading.jobPositions)
      .filter((position) => named(position.name))
      .map((position) => ({
        ...traced(position),
        name: position.name,
        staffCategory: position.staffCategory,
        trainingIntervalMonths: position.trainingIntervalMonths,
        workZone: position.workZone,
        activities: position.activities,
      })),
    (a, b) => foldText(a.name) === foldText(b.name),
    fillGaps
  ).map((position, index) => ({ id: `position-${index + 1}`, ...position }));

  const fireEquipment = list((reading) => reading.fireEquipment).map((equipment, index) => ({
    id: `equipment-${index + 1}`,
    ...traced(equipment),
    workplace: workplaceReference(equipment.workplace, true),
    room: equipment.room,
    kind: equipment.kind,
    agent: equipment.agent,
    capacity: equipment.capacity,
    wheeled: equipment.wheeled,
    count: equipment.count,
  }));
  for (const workplace of workplaces) {
    const rooms = fireEquipment
      .filter((equipment) => equipment.workplace.id === workplace.id && equipment.room !== null)
      .map((equipment) => equipment.room!);
    workplace.rooms = uniqueFolded([...workplace.rooms, ...rooms]);
  }

  let ppeCount = 0;
  const proposal: Proposal = {
    client: groups.client as Proposal['client'],
    trainingSchedule: groups.trainingSchedule as Proposal['trainingSchedule'],
    fireSafety: groups.fireSafety as Proposal['fireSafety'],
    workplaces,
    jobPositions,
    responsiblePersons: joined(
      list((reading) => reading.responsiblePersons)
        .filter((person) => named(person.fullName) && person.roles.length > 0)
        .map((person) => ({
          ...traced(person),
          fullName: person.fullName,
          jobTitle: person.jobTitle,
          roles: [...new Set(person.roles)],
          workplace: person.workplace,
        })),
      (a, b) => foldName(a.fullName) === foldName(b.fullName),
      (into, from) => {
        fillGaps(into, from);
        into.roles = [...new Set([...into.roles, ...from.roles])];
      }
    ).map((person, index) => ({
      id: `person-${index + 1}`,
      ...person,
      workplace: workplaceReference(person.workplace, false),
    })),
    fireEquipment,
    fireInstallations: list((reading) => reading.fireInstallations).map((installation, index) => ({
      id: `installation-${index + 1}`,
      ...traced(installation),
      workplace: workplaceReference(installation.workplace, true),
      kind: installation.kind,
      description: installation.description,
    })),
    // A table naming several positions applies to each of them.
    protectiveEquipment: list((reading) => reading.protectiveEquipment)
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
        }));
      }),
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
    notes: list((reading) => reading.notes).filter((note) => note.trim() !== ''),
    flags: [],
  };
  return proposalSchema.parse(proposal);
}
