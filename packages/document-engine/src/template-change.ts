// A manifest entry's `change`, which `templates:register` hands to the database (ADR 017).

export type TemplateChangeKind = 'legal' | 'correction' | 'layout';

export interface ResolvedLegalChange {
  /** The act's id in legal-acts.json. */
  act: string;
  /** The date of the consolidated form the template now quotes, YYYY-MM-DD. */
  consolidatedOn: string;
}

export interface TemplateChange {
  kind: TemplateChangeKind;
  note: string;
  resolves?: ResolvedLegalChange;
}

// The database's bounds for a version's note: a note out of them would fail only when the
// templates are registered, after the merge.
const noteLength = { min: 2, max: 500 };

export function templateChangeProblems(change: unknown, actIds: ReadonlySet<string>): string[] {
  if (typeof change !== 'object' || change === null) return ['no change'];
  const { kind, note, resolves } = change as Partial<Record<keyof TemplateChange, unknown>>;
  const problems: string[] = [];
  if (kind !== 'legal' && kind !== 'correction' && kind !== 'layout') {
    problems.push(`kind ${JSON.stringify(kind)} is not legal, correction or layout`);
  }
  const length = typeof note === 'string' ? note.trim().length : -1;
  if (length < noteLength.min || length > noteLength.max) {
    problems.push(`the note has ${length} characters, not ${noteLength.min} to ${noteLength.max}`);
  }
  if (resolves === undefined) return problems;
  if (kind !== 'legal') problems.push('only a legal change resolves a change of an act');
  const { act, consolidatedOn } = (resolves ?? {}) as Partial<Record<string, unknown>>;
  if (typeof act !== 'string' || !actIds.has(act)) {
    problems.push(`resolves ${JSON.stringify(act)}, which is not in legal-acts.json`);
  }
  const day = typeof consolidatedOn === 'string' ? new Date(`${consolidatedOn}T00:00:00Z`) : null;
  if (!day || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== consolidatedOn) {
    problems.push(`consolidatedOn ${JSON.stringify(consolidatedOn)} is not a date`);
  }
  return problems;
}
