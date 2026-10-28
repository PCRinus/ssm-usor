import {
  countyCodes,
  decodeCnp,
  fireSmokingPolicies,
  isValidCnp,
  isValidCui,
  maxTrainingIntervalMonths,
  normalizeCnp,
  periodicTrainingMinutesOptions,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import { findQuote, foldName, foldText, similar } from './match';
import {
  type Field,
  type Flag,
  type Option,
  type Proposal,
  proposedIncluded,
  type Source,
} from './proposal';

export interface CheckInput {
  // Each file of the import by path, with its extracted text, or null for a file that has
  // none to search, such as a photograph.
  files: Record<string, string | null>;
  // Into an existing client, its identity is the app's and is never missing.
  clientExists?: boolean;
}

type FieldGroups = Record<string, Record<string, Field<string | number>>>;

function fieldGroups(proposal: Proposal): FieldGroups {
  return {
    client: proposal.client,
    trainingSchedule: proposal.trainingSchedule,
    fireSafety: proposal.fireSafety,
  } as FieldGroups;
}

const listNames = [
  'workplaces',
  'jobPositions',
  'responsiblePersons',
  'fireEquipment',
  'fireInstallations',
  'protectiveEquipment',
  'employees',
] as const;

function tracedValues(proposal: Proposal): { path: string; sources: Source[] }[] {
  const options = Object.entries(fieldGroups(proposal)).flatMap(([group, fields]) =>
    Object.entries(fields).flatMap(([name, field]) =>
      field.options.map((option, index) => ({
        path: `${group}.${name}.options.${index}`,
        sources: option.sources,
      }))
    )
  );
  const items = listNames.flatMap((list) =>
    (proposal[list] as { sources: Source[] }[]).map((item, index) => ({
      path: `${list}.${index}`,
      sources: item.sources,
    }))
  );
  return [...options, ...items];
}

export function checkQuotes(proposal: Proposal, files: CheckInput['files']): Flag[] {
  return tracedValues(proposal).flatMap(({ path, sources }) =>
    sources.flatMap((source, index): Flag[] => {
      const sourcePath = `${path}.sources.${index}`;
      if (!Object.hasOwn(files, source.file)) {
        return [{ path: sourcePath, code: 'file_not_found', detail: source.file }];
      }
      const text = files[source.file];
      if (text === null || text === undefined) return [];
      return findQuote(text, source.quote) === null
        ? [{ path: sourcePath, code: 'quote_not_found' }]
        : [];
    })
  );
}

export function checkIdentifiers(proposal: Proposal): Flag[] {
  const cuiFlags = proposal.client.cui.options.flatMap((option, index): Flag[] =>
    isValidCui(option.value) ? [] : [{ path: `client.cui.options.${index}`, code: 'invalid_cui' }]
  );
  const cnpFlags = proposal.employees.flatMap((employee, index): Flag[] => {
    if (employee.cnp === null) return [];
    const path = `employees.${index}.cnp`;
    const cnp = normalizeCnp(employee.cnp);
    if (cnp === null || !isValidCnp(cnp)) return [{ path, code: 'invalid_cnp' }];
    const encoded = decodeCnp(cnp).birthDate;
    if (employee.birthDate !== null && encoded !== null && encoded !== employee.birthDate) {
      return [{ path, code: 'cnp_birth_date_mismatch', detail: encoded }];
    }
    return [];
  });
  return [...cuiFlags, ...cnpFlags];
}

type Allowed = (value: string | number) => boolean;

const between =
  (min: number, max: number): Allowed =>
  (value) =>
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

const oneOf =
  (values: readonly (string | number)[]): Allowed =>
  (value) =>
    values.includes(value);

const allowedFacts: Record<string, Record<string, Allowed>> = {
  client: {
    countyCode: oneOf(countyCodes),
    caenCode: (value) => /^[0-9]{4}$/.test(String(value)),
    contactEmail: (value) => z.email().safeParse(value).success,
  },
  trainingSchedule: {
    periodicTrainingMinutes: oneOf(periodicTrainingMinutesOptions),
    administrativeTrainingIntervalMonths: between(1, 12),
    workerTrainingIntervalMonths: between(1, 6),
    trainingFirstMonth: between(1, 12),
    trainingDayFrom: between(1, 31),
    trainingDayTo: between(1, 31),
  },
  // OMAI 712/2005 art. 21 and 26.
  fireSafety: {
    periodicTrainingHours: between(2, 8),
    administrativeTrainingIntervalMonths: between(1, 6),
    workerTrainingIntervalMonths: between(1, 6),
    smokingPolicy: oneOf(fireSmokingPolicies),
  },
};

export function checkAllowedValues(proposal: Proposal): Flag[] {
  const flags: Flag[] = [];
  const flag = (path: string, allowed: boolean) => {
    if (!allowed) flags.push({ path, code: 'value_not_allowed' });
  };
  for (const [group, fields] of Object.entries(fieldGroups(proposal))) {
    for (const [name, field] of Object.entries(fields)) {
      const allowed = allowedFacts[group]?.[name];
      if (!allowed) continue;
      field.options.forEach((option, index) =>
        flag(`${group}.${name}.options.${index}`, allowed(option.value))
      );
    }
  }
  proposal.workplaces.forEach((workplace, index) => {
    if (workplace.countyCode !== null) {
      flag(`workplaces.${index}.countyCode`, oneOf(countyCodes)(workplace.countyCode));
    }
  });
  proposal.jobPositions.forEach((position, index) => {
    if (position.trainingIntervalMonths === null) return;
    const max = position.staffCategory ? maxTrainingIntervalMonths[position.staffCategory] : 12;
    flag(
      `jobPositions.${index}.trainingIntervalMonths`,
      between(1, max)(position.trainingIntervalMonths)
    );
  });
  proposal.fireEquipment.forEach((equipment, index) => {
    const path = `fireEquipment.${index}`;
    const extinguisher = equipment.kind === 'extinguisher';
    if (equipment.capacity !== null) {
      flag(`${path}.capacity`, extinguisher && between(1, 250)(equipment.capacity));
    }
    if (equipment.agent !== null) flag(`${path}.agent`, extinguisher);
    if (!extinguisher) flag(`${path}.wheeled`, !equipment.wheeled);
    if (equipment.count !== null) flag(`${path}.count`, between(1, 999)(equipment.count));
  });
  proposal.protectiveEquipment.forEach((entry, index) => {
    const path = `protectiveEquipment.${index}`;
    if (entry.quantity !== null) flag(`${path}.quantity`, between(1, 999)(entry.quantity));
    if (entry.durationMonths !== null) {
      flag(`${path}.durationMonths`, between(1, 600)(entry.durationMonths));
    }
  });
  return flags;
}

function duplicates<T>(list: string, items: T[], same: (a: T, b: T) => boolean): Flag[] {
  return items.flatMap((item, index): Flag[] => {
    const first = items.findIndex((other, otherIndex) => otherIndex < index && same(other, item));
    return first === -1
      ? []
      : [{ path: `${list}.${index}`, code: 'duplicate', detail: `${list}.${first}` }];
  });
}

const sameText = (a: string | null, b: string | null) =>
  a !== null && b !== null && foldText(a) !== '' && foldText(a) === foldText(b);

const samePerson = (a: string, b: string) => foldName(a) === foldName(b) || similar(a, b) >= 0.8;

const employeeName = (employee: Proposal['employees'][number]) =>
  [employee.lastName, employee.firstName].filter(Boolean).join(' ');

export function checkDuplicates(proposal: Proposal): Flag[] {
  return [
    ...duplicates(
      'workplaces',
      proposal.workplaces,
      (a, b) =>
        samePerson(a.name, b.name) ||
        (sameText(a.addressLine, b.addressLine) &&
          (a.locality === null || sameText(a.locality, b.locality)))
    ),
    // `job_positions.name` is unique per client, compared in lower case and trimmed.
    ...duplicates(
      'jobPositions',
      proposal.jobPositions,
      (a, b) => foldText(a.name) === foldText(b.name)
    ),
    ...duplicates('responsiblePersons', proposal.responsiblePersons, (a, b) =>
      samePerson(a.fullName, b.fullName)
    ),
    ...duplicates('employees', proposal.employees, (a, b) =>
      a.cnp === null || b.cnp === null
        ? employeeName(a) !== '' && samePerson(employeeName(a), employeeName(b))
        : a.cnp === b.cnp
    ),
  ];
}

// An option only another company's passages give is proposed unticked, so it fills nothing yet.
const proposed = (options: Option<unknown>[]) =>
  options.some((option) => option.otherCompanyName === null);

export function checkMissing(proposal: Proposal, options: { clientExists?: boolean } = {}): Flag[] {
  const flags: Flag[] = [];
  if (!options.clientExists) {
    for (const name of ['legalName', 'cui'] as const) {
      if (!proposed(proposal.client[name].options)) {
        flags.push({ path: `client.${name}`, code: 'missing' });
      }
    }
  }
  // An employee proposed unticked lacks nothing until the member ticks it, which the API checks.
  proposal.employees.forEach((employee, index) => {
    if (!proposedIncluded(employee)) return;
    for (const name of ['lastName', 'firstName', 'jobTitle', 'hiredAt'] as const) {
      if (employee[name] === null)
        flags.push({ path: `employees.${index}.${name}`, code: 'missing' });
    }
  });
  return flags;
}

export function checkReferences(proposal: Proposal): Flag[] {
  const flags: Flag[] = [];
  const unresolved = (path: string, reference: { name: string | null; id: string | null }) => {
    if (reference.id === null) {
      flags.push({
        path,
        code: 'unknown_reference',
        ...(reference.name ? { detail: reference.name } : {}),
      });
    }
  };
  proposal.fireEquipment.forEach((equipment, index) =>
    unresolved(`fireEquipment.${index}.workplace`, equipment.workplace)
  );
  proposal.fireInstallations.forEach((installation, index) =>
    unresolved(`fireInstallations.${index}.workplace`, installation.workplace)
  );
  proposal.responsiblePersons.forEach((person, index) => {
    if (person.workplace.name !== null) {
      unresolved(`responsiblePersons.${index}.workplace`, person.workplace);
    }
  });
  proposal.protectiveEquipment.forEach((entry, index) =>
    unresolved(`protectiveEquipment.${index}.jobPosition`, entry.jobPosition)
  );
  return flags;
}

export function checkProposal(proposal: Proposal, input: CheckInput): Flag[] {
  return [
    ...checkMissing(proposal, { clientExists: input.clientExists }),
    ...checkQuotes(proposal, input.files),
    ...checkIdentifiers(proposal),
    ...checkAllowedValues(proposal),
    ...checkDuplicates(proposal),
    ...checkReferences(proposal),
  ];
}

export interface RegisteredCompany {
  cui: string;
  legalName: string;
}

// The API's ANAF lookup: null for a CUI ANAF does not know. It throws when ANAF cannot answer,
// which leaves the CUI unconfirmed rather than flagged.
export interface CompanyRegistry {
  lookup(cui: string): Promise<RegisteredCompany | null>;
}

// By CUI, what the registry answered; a CUI left out was not looked up.
export type Registrations = Map<string, RegisteredCompany | null>;

export function checkRegistrations(proposal: Proposal, registrations: Registrations): Flag[] {
  return proposal.client.cui.options.flatMap((option, index): Flag[] => {
    if (!registrations.has(option.value)) return [];
    const registered = registrations.get(option.value);
    if (!registered) return [{ path: `client.cui.options.${index}`, code: 'cui_not_registered' }];
    const named = proposal.client.legalName.options.some(
      (name) =>
        foldName(name.value) === foldName(registered.legalName) ||
        similar(name.value, registered.legalName) >= 0.8
    );
    return named
      ? []
      : [{ path: 'client.legalName', code: 'legal_name_differs', detail: registered.legalName }];
  });
}

export async function lookUpRegistrations(
  proposal: Proposal,
  registry: CompanyRegistry
): Promise<Registrations> {
  const cuis = [...new Set(proposal.client.cui.options.map((option) => option.value))].filter(
    isValidCui
  );
  const answers = await Promise.allSettled(cuis.map((cui) => registry.lookup(cui)));
  const registrations: Registrations = new Map();
  answers.forEach((answer, index) => {
    if (answer.status === 'fulfilled') registrations.set(cuis[index]!, answer.value);
  });
  return registrations;
}

export function withChecks(
  proposal: Proposal,
  input: CheckInput & { registrations?: Registrations }
): Proposal {
  const flags = checkProposal(proposal, input);
  if (input.registrations) flags.push(...checkRegistrations(proposal, input.registrations));
  return { ...proposal, flags };
}
