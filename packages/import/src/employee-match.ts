import { isValidCnp } from '@ssm-usor/contracts';

import type { ExistingMatch, ReferenceMatch } from './employee-proposal';
import { contained, editDistance, foldName, foldText, sameName, similar, streetKey } from './match';

export interface Named {
  id: string;
  name: string;
}

export interface ReferenceMatchResult {
  match: ReferenceMatch;
  proposedId: string | null;
  closestId: string | null;
}

function closeness(a: string, b: string) {
  const x = foldText(a);
  const y = foldText(b);
  const longest = Math.max(x.length, y.length);
  return longest === 0 ? 0 : 1 - editDistance(x, y) / longest;
}

// "Vânzătoare" for the post "Vânzător", "Patiseră" for "Patiser": a contract title is written
// in the holder's gender and with or without diacritics.
const near = (written: string, name: string) => {
  const x = foldText(written);
  const y = foldText(name);
  return (
    (Math.min(x.length, y.length) >= 5 && editDistance(x, y) <= 2) ||
    similar(written, name) >= 0.5 ||
    contained(written, name) >= 0.75
  );
};

function bestOf(written: string, items: readonly Named[]) {
  return [...items].sort((a, b) => closeness(written, b.name) - closeness(written, a.name))[0];
}

export function matchJobTitle(title: string, positions: readonly Named[]): ReferenceMatchResult {
  const exact = positions.find((position) => foldText(position.name) === foldText(title));
  if (exact) return { match: 'exact', proposedId: exact.id, closestId: null };
  const nearOnes = positions.filter((position) => near(title, position.name));
  if (nearOnes.length > 0) {
    return { match: 'near', proposedId: bestOf(title, nearOnes)!.id, closestId: null };
  }
  return { match: 'none', proposedId: null, closestId: bestOf(title, positions)?.id ?? null };
}

export interface ClientWorkplace extends Named {
  addressLine: string | null;
}

export function matchWorkplace(
  text: string,
  workplaces: readonly ClientWorkplace[]
): ReferenceMatchResult {
  if (text.trim() === '') return { match: 'none', proposedId: null, closestId: null };
  const exact = workplaces.find(
    (workplace) =>
      foldName(workplace.name) === foldName(text) ||
      (streetKey(workplace.addressLine) !== '' &&
        streetKey(workplace.addressLine) === streetKey(text))
  );
  if (exact) return { match: 'exact', proposedId: exact.id, closestId: null };
  const nearOnes = workplaces.filter(
    (workplace) => sameName(workplace.name, text) || contained(workplace.name, text) >= 0.75
  );
  if (nearOnes.length > 0) {
    return { match: 'near', proposedId: bestOf(text, nearOnes)!.id, closestId: null };
  }
  return { match: 'none', proposedId: null, closestId: bestOf(text, workplaces)?.id ?? null };
}

export interface ExistingTraining {
  domain: string;
  phase: string;
  heldOn: string;
}

export interface ExistingEmployee {
  id: string;
  lastName: string;
  firstName: string;
  cnp: string | null;
  employeeNumber: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  homeAddress: string | null;
  education: string | null;
  qualification: string | null;
  bloodGroup: string | null;
  rhFactor: string | null;
  jobTitle: string;
  hiredAt: string;
  terminatedAt: string | null;
  workplaceId: string | null;
  commuteRoute: string | null;
  commuteMinutes: number | null;
  hasContact: boolean;
  trainings: readonly ExistingTraining[];
  testResults: readonly { domain: string; test: string; takenOn: string }[];
}

export interface PersonKey {
  cnp: string | null;
  lastName: string | null;
  firstName: string | null;
  birthDate: string | null;
}

const nameKey = (lastName: string, firstName: string | null) =>
  foldName(`${lastName} ${firstName ?? ''}`)
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ');

export function findExistingEmployee<E extends ExistingEmployee>(
  person: PersonKey,
  employees: readonly E[]
): { employee: E; matchedBy: ExistingMatch } | null {
  // A code whose control digit fails is a misread one, which must not hide the name and birth date.
  const cnp = person.cnp !== null && isValidCnp(person.cnp) ? person.cnp : null;
  if (cnp !== null) {
    const byCnp = employees.find((employee) => employee.cnp === cnp);
    if (byCnp) return { employee: byCnp, matchedBy: 'cnp' };
  }
  if (person.lastName === null) return null;
  if (person.birthDate === null) {
    if (cnp !== null) return null;
    // A later import's continuation pages often carry the name alone (ADR 032).
    const key = nameKey(person.lastName, person.firstName);
    const named = employees.filter(
      (employee) => nameKey(employee.lastName, employee.firstName) === key
    );
    return named.length === 1 ? { employee: named[0]!, matchedBy: 'name_only' } : null;
  }
  const name = `${person.lastName} ${person.firstName ?? ''}`;
  const byName = [...employees]
    .sort((a, b) => Number(a.terminatedAt !== null) - Number(b.terminatedAt !== null))
    .find(
      (employee) =>
        employee.birthDate === person.birthDate &&
        (cnp === null || employee.cnp === null) &&
        sameName(`${employee.lastName} ${employee.firstName}`, name)
    );
  return byName ? { employee: byName, matchedBy: 'name_birth_date' } : null;
}
