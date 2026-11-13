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
  /** A list when one version answers changes of several acts, or several forms of one. */
  resolves?: ResolvedLegalChange | ResolvedLegalChange[];
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
  const list = Array.isArray(resolves) ? resolves : [resolves];
  if (!list.length) problems.push('resolves lists no change');
  for (const each of list) {
    const { act, consolidatedOn } = (each ?? {}) as Partial<Record<string, unknown>>;
    if (typeof act !== 'string' || !actIds.has(act)) {
      problems.push(`resolves ${JSON.stringify(act)}, which is not in legal-acts.json`);
    }
    const day = typeof consolidatedOn === 'string' ? new Date(`${consolidatedOn}T00:00:00Z`) : null;
    if (!day || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== consolidatedOn) {
      problems.push(`consolidatedOn ${JSON.stringify(consolidatedOn)} is not a date`);
    }
  }
  return problems;
}

const strength: Record<TemplateChangeKind, number> = { layout: 0, correction: 1, legal: 2 };

/**
 * The change a template's next version records, given the change its manifest entry holds now
 * and the one at the last release. An entry that differs from the release's, or that the
 * release did not have, is still to be registered by production: the new change joins it, its
 * note after the pending one, the stronger kind kept and every change resolved listed. An entry
 * the release has is registered, and the new change replaces it.
 */
export function nextTemplateChange(
  current: TemplateChange,
  released: TemplateChange | undefined,
  change: TemplateChange
): TemplateChange {
  const resolvedBy = (each: TemplateChange) =>
    each.resolves === undefined
      ? []
      : Array.isArray(each.resolves)
        ? each.resolves
        : [each.resolves];
  const key = (each: TemplateChange) =>
    JSON.stringify([
      each.kind,
      each.note,
      resolvedBy(each).map(({ act, consolidatedOn }) => [act, consolidatedOn]),
    ]);
  if (released && key(current) === key(released)) return change;
  const sentence = (note: string) => note.trim().replace(/[.;]$/, '');
  const notes = current.note.split(/;\s+/).map(sentence).includes(sentence(change.note))
    ? current.note
    : `${current.note.trim().replace(/[.;]$/, '')}; ${change.note.trim()}`;
  const resolved = [...resolvedBy(current), ...resolvedBy(change)].filter(
    (each, index, all) =>
      all.findIndex(
        (other) => other.act === each.act && other.consolidatedOn === each.consolidatedOn
      ) === index
  );
  const kind = strength[change.kind] > strength[current.kind] ? change.kind : current.kind;
  const merged: TemplateChange = { kind, note: notes };
  if (resolved.length) merged.resolves = resolved.length === 1 ? resolved[0] : resolved;
  return merged;
}
