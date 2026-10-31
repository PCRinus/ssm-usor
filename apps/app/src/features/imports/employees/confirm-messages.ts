import { roCount } from '@/features/employees/employee-format';

import {
  fieldLabels,
  type FieldName,
  ownRows,
  personName,
  type ReviewContext,
} from './employee-review-model';

export function confirmIssueMessage(
  context: ReviewContext,
  issue: { path: string; message: string } | undefined
) {
  const generic =
    'Nu am putut crea angajații: o valoare nu se poate salva. Verifică persoanele și încearcă din nou.';
  if (!issue) return generic;
  const [list, id, part, name] = issue.path.split('.');
  let person =
    list === 'people' ? context.proposal.people.find((each) => each.id === id) : undefined;
  if (list === 'rows') {
    person = context.proposal.people.find((each) =>
      ownRows(context, each.id).some(({ row }) => row.id === id)
    );
  }
  if (list === 'jobTitles') {
    const group = context.proposal.jobTitles.find((each) => each.id === id);
    return `Postul pentru «${group?.title ?? ''}» nu e ales. Alege-l și încearcă din nou.`;
  }
  if (!person) return generic;
  const who = personName(context, person);
  const what =
    list === 'rows'
      ? 'o instruire'
      : part === 'fields' && name === 'cnp'
        ? 'CNP-ul'
        : part === 'fields' && name && name in fieldLabels
          ? fieldLabels[name as FieldName].toLowerCase()
          : part === 'jobPosition'
            ? 'postul'
            : part === 'workplace'
              ? 'locul de muncă'
              : 'datele';
  const why =
    issue.message === 'missing'
      ? 'lipsește'
      : issue.message === 'choice'
        ? 'e de ales'
        : issue.message === 'unknown_reference'
          ? 'nu mai există la client'
          : 'nu se poate salva';
  return `La ${who}, ${what} ${why}. Deschide persoana, corectează și încearcă din nou.`;
}

export function createLabel(created: number, left: number) {
  const people =
    created === 0 ? null : created === 1 ? 'un angajat' : roCount(created, 'angajat', 'angajați');
  if (!people) return left === 0 ? 'Completează angajații' : 'Completează angajații verificați';
  if (left === 0) return `Creează ${people}`;
  return `Creează ${people}, fără ${left === 1 ? 'cel neverificat' : `cei ${left}`}`;
}
