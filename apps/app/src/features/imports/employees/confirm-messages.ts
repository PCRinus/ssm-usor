import { roCount } from '@/features/employees/employee-format';

import {
  fieldLabels,
  type FieldName,
  ownRows,
  personName,
  type ReviewContext,
} from './employee-review-model';

type Issue = { path: string; message: string };

// A refused write names the unique index the database tripped.
const takenIndexes = new Set(['employees_client_cnp_key', 'employees_client_employee_number_key']);

function issueLine(context: ReviewContext, issue: Issue) {
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
    return `Postul pentru «${group?.title ?? ''}» nu e ales.`;
  }
  if (!person) return null;
  const who = personName(context, person);
  const field = part === 'fields' && name && name in fieldLabels ? (name as FieldName) : undefined;
  const what =
    list === 'rows'
      ? part === 'test'
        ? 'un test'
        : 'o instruire'
      : field === 'cnp'
        ? 'CNP-ul'
        : field
          ? fieldLabels[field].toLowerCase()
          : part === 'jobPosition'
            ? 'postul'
            : part === 'workplace'
              ? 'locul de muncă'
              : 'datele';
  const taken =
    takenIndexes.has(issue.message) ||
    (issue.message === 'invalid' && (field === 'cnp' || field === 'employeeNumber'));
  const why = taken
    ? 'îl are deja alt angajat al clientului sau altă persoană din import'
    : issue.message === 'missing'
      ? 'lipsește'
      : issue.message === 'choice'
        ? 'e de ales'
        : issue.message === 'unknown_reference'
          ? 'nu mai există la client'
          : 'nu se poate salva';
  return `La ${who}, ${what} ${why}.`;
}

/** What keeps confirming, one line per value, as the review names it. */
export function confirmIssueLines(context: ReviewContext, issues: readonly Issue[]) {
  return [...new Set(issues.flatMap((issue) => issueLine(context, issue) ?? []))];
}

export function createLabel(created: number, left: number) {
  const people =
    created === 0 ? null : created === 1 ? 'un angajat' : roCount(created, 'angajat', 'angajați');
  if (!people) return left === 0 ? 'Completează angajații' : 'Completează angajații verificați';
  if (left === 0) return `Creează ${people}`;
  return `Creează ${people}, fără ${left === 1 ? 'cel neverificat' : `cei ${left}`}`;
}
