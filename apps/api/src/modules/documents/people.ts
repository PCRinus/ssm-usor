import {
  isLegalRepresentative,
  type LegalRepresentativeRef,
  type ResponsiblePersonRole,
  samePersonName,
} from '@ssm-usor/contracts';

import type { DocumentFacts } from './context';

type ResponsiblePerson = DocumentFacts['responsiblePersons'][number];

export type Person = { name: string; jobTitle: string };

export type Identified = { employeeId: string | null; fullName: string };

export const asPerson = (person: ResponsiblePerson): Person => ({
  name: person.fullName.trim(),
  jobTitle: person.jobTitle.trim(),
});

export const withRole = (persons: readonly ResponsiblePerson[], role: ResponsiblePersonRole) =>
  persons.filter((person) => person.roles.includes(role));

export const legalRepresentativeOf = (
  facts: Pick<DocumentFacts, 'client'>
): LegalRepresentativeRef => ({
  employeeId: facts.client.representativeEmployeeId,
  fullName: facts.client.representativeName,
});

// The administrator designated by name alone stands for the employee linked as the legal
// representative, so the two are one person; two employees are told apart by id, whatever
// their names.
const identityOf = (person: Identified, legalRepresentative: LegalRepresentativeRef) =>
  person.employeeId ??
  (legalRepresentative.employeeId && isLegalRepresentative(person, legalRepresentative)
    ? legalRepresentative.employeeId
    : null);

export function samePerson(
  first: Identified,
  second: Identified,
  legalRepresentative: LegalRepresentativeRef
) {
  const firstId = identityOf(first, legalRepresentative);
  const secondId = identityOf(second, legalRepresentative);
  return firstId && secondId
    ? firstId === secondId
    : samePersonName(first.fullName, second.fullName);
}

export function distinctPeople<Item extends Identified>(
  items: readonly Item[],
  legalRepresentative: LegalRepresentativeRef
) {
  const distinct: Item[] = [];
  for (const item of items) {
    if (!distinct.some((each) => samePerson(each, item, legalRepresentative))) distinct.push(item);
  }
  return distinct;
}

export const distinctHolders = (
  persons: readonly ResponsiblePerson[],
  role: ResponsiblePersonRole,
  legalRepresentative: LegalRepresentativeRef
) => distinctPeople(withRole(persons, role), legalRepresentative);
