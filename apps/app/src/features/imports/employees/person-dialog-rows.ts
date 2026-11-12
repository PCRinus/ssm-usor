import type { FieldName } from './employee-review-model';

export type DialogRow =
  | { full: FieldName }
  | { half: FieldName }
  | { pair: readonly [FieldName, FieldName]; onPhone?: 'paired' };

const dialogRows: readonly DialogRow[] = [
  { pair: ['lastName', 'firstName'] },
  { pair: ['cnp', 'birthDate'] },
  { full: 'birthPlace' },
  { full: 'homeAddress' },
  { full: 'education' },
  { full: 'qualification' },
  { full: 'jobTitle' },
  { pair: ['hiredAt', 'leftOn'] },
  { half: 'employeeNumber' },
  { pair: ['bloodGroup', 'rhFactor'], onPhone: 'paired' },
  { full: 'commuteRoute' },
  { half: 'commuteMinutes' },
];

export function dialogRowsFor(names: readonly FieldName[]): DialogRow[] {
  const wanted = new Set(names);
  const rows: DialogRow[] = [];
  for (const row of dialogRows) {
    if (!('pair' in row)) {
      const name = 'full' in row ? row.full : row.half;
      if (wanted.delete(name)) rows.push(row);
      continue;
    }
    const kept = row.pair.filter((name) => wanted.delete(name));
    if (kept.length === 2) rows.push(row);
    else if (kept[0]) rows.push({ half: kept[0] });
  }
  return [...rows, ...[...wanted].map((name) => ({ full: name }))];
}
