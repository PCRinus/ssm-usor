import type { LatestLegalCheckRunResponseRunErrorsItem } from '@/api/generated/api';

import { countOf } from './legislation-labels';

const unexplained = new Set(['other', 'run']);

export type FailureGroup = { key: string; label: string; acts: string[] };

function causeOf(error: LatestLegalCheckRunResponseRunErrorsItem) {
  if (error.act === null) {
    return { key: 'run', label: 'Verificarea s-a oprit înainte de final' };
  }
  switch (error.kind) {
    case 'http_status':
      return error.status
        ? { key: `http-${error.status}`, label: `Portalul a răspuns ${error.status}` }
        : { key: 'http', label: 'Portalul a răspuns cu o eroare' };
    case 'fetch':
      return { key: 'fetch', label: 'Portalul nu a răspuns' };
    case 'parse':
      return { key: 'parse', label: 'Pagina actului are o formă neașteptată' };
    // Runs recorded before the errors had a kind reach here with none.
    default:
      return { key: 'other', label: 'Altă eroare' };
  }
}

export function groupFailures(
  errors: readonly LatestLegalCheckRunResponseRunErrorsItem[],
  actNames: ReadonlyMap<string, string>
) {
  const groups = new Map<string, FailureGroup>();
  for (const error of errors) {
    const cause = causeOf(error);
    const group = groups.get(cause.key) ?? { ...cause, acts: [] };
    if (error.act !== null) group.acts.push(actNames.get(error.act) ?? error.act);
    groups.set(cause.key, group);
  }
  const collator = new Intl.Collator('ro', { numeric: true });
  return [...groups.values()]
    .map((group) => ({ ...group, acts: group.acts.sort(collator.compare) }))
    .sort(
      (a, b) =>
        Number(unexplained.has(a.key)) - Number(unexplained.has(b.key)) ||
        b.acts.length - a.acts.length ||
        collator.compare(a.label, b.label)
    );
}

export const groupHeading = (group: FailureGroup) =>
  group.acts.length > 0
    ? `${group.label} (${countOf(group.acts.length, 'act', 'acte')})`
    : group.label;
