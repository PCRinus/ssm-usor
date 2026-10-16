import { type ResponsiblePersonRole, samePersonName } from '@ssm-usor/contracts';

import type { DocumentFacts } from './context';

type ResponsiblePerson = DocumentFacts['responsiblePersons'][number];

export type Person = { name: string; jobTitle: string };

export const asPerson = (person: ResponsiblePerson): Person => ({
  name: person.fullName.trim(),
  jobTitle: person.jobTitle.trim(),
});

export const withRole = (persons: readonly ResponsiblePerson[], role: ResponsiblePersonRole) =>
  persons.filter((person) => person.roles.includes(role));

function distinctBy<Item>(items: readonly Item[], nameOf: (item: Item) => string) {
  const distinct: Item[] = [];
  for (const item of items) {
    if (!distinct.some((each) => samePersonName(nameOf(each), nameOf(item)))) distinct.push(item);
  }
  return distinct;
}

export const distinctByName = (names: readonly string[]) => distinctBy(names, (name) => name);

export const distinctPeopleByName = <Item extends { name: string }>(people: readonly Item[]) =>
  distinctBy(people, (person) => person.name);
