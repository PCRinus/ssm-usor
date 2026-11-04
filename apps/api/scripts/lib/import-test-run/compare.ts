import { foldText } from '@ssm-usor/contracts';

export type Value = string | number | boolean | null;

export interface ResultRow {
  // What the row is about, alike in both results, strongest first: a person's name, then CNP.
  identities: string[];
  // Rows of one group left unpaired by identity are paired in order: two readings of one
  // training date that disagree are one row with a wrong date, not one missed and one extra.
  // Null where two rows are never the same thing told apart by a value, as two posts.
  group: string | null;
  values: Record<string, Value>;
}

export type Sections = Record<string, ResultRow[]>;

export const outcomes = ['found', 'missed', 'wrong', 'extra'] as const;

export type Outcome = (typeof outcomes)[number];

export type Counts = Record<Outcome, number>;

export interface Difference {
  section: string;
  // The row's place in the confirmed result, or in the reading's for an extra row.
  row: number;
  field: string;
  outcome: Exclude<Outcome, 'found'>;
  expected: Value;
  got: Value;
}

export interface Comparison {
  sections: Record<string, Counts>;
  fields: Record<string, Counts>;
  totals: Counts;
  score: number | null;
  differences: Difference[];
}

export const noCounts = (): Counts => ({ found: 0, missed: 0, wrong: 0, extra: 0 });

const empty = (value: Value | undefined) =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

export function sameValue(a: Value, b: Value) {
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b);
  return foldText(String(a)) === foldText(String(b));
}

export function outcomeOf(expected: Value | undefined, got: Value | undefined): Outcome | null {
  if (empty(expected)) return empty(got) ? null : 'extra';
  if (empty(got)) return 'missed';
  return sameValue(expected!, got!) ? 'found' : 'wrong';
}

export function pairRows(expected: ResultRow[], got: ResultRow[]) {
  const pairs: [number | null, number | null][] = [];
  const free = new Set(got.map((_, index) => index));
  let unpaired = expected.map((_, index) => index);
  const passes = Math.max(0, ...[...expected, ...got].map((row) => row.identities.length));
  const take = (index: number, same: (row: ResultRow) => boolean) => {
    const match = [...free].find((other) => same(got[other]!));
    if (match === undefined) return false;
    free.delete(match);
    pairs.push([index, match]);
    return true;
  };
  for (let pass = 0; pass < passes; pass++) {
    unpaired = unpaired.filter((index) => {
      const identity = expected[index]!.identities[pass];
      return !identity || !take(index, (row) => row.identities[pass] === identity);
    });
  }
  for (const index of unpaired) {
    const group = expected[index]!.group;
    if (group === null || !take(index, (row) => row.group === group)) pairs.push([index, null]);
  }
  for (const index of free) pairs.push([null, index]);
  return pairs;
}

export function compareSections(expected: Sections, got: Sections): Comparison {
  const comparison: Comparison = {
    sections: {},
    fields: {},
    totals: noCounts(),
    score: null,
    differences: [],
  };
  const names = [...new Set([...Object.keys(expected), ...Object.keys(got)])];
  for (const section of names) {
    const truth = expected[section] ?? [];
    const reading = got[section] ?? [];
    const counts = (comparison.sections[section] = noCounts());
    for (const [truthIndex, readIndex] of pairRows(truth, reading)) {
      const want = truthIndex === null ? {} : truth[truthIndex]!.values;
      const have = readIndex === null ? {} : reading[readIndex]!.values;
      for (const field of [...new Set([...Object.keys(want), ...Object.keys(have)])]) {
        const outcome = outcomeOf(want[field], have[field]);
        if (!outcome) continue;
        counts[outcome]++;
        comparison.totals[outcome]++;
        (comparison.fields[`${section}.${field}`] ??= noCounts())[outcome]++;
        if (outcome !== 'found') {
          comparison.differences.push({
            section,
            row: truthIndex ?? readIndex!,
            field,
            outcome,
            expected: want[field] ?? null,
            got: have[field] ?? null,
          });
        }
      }
    }
  }
  comparison.score = scoreOf(comparison.totals);
  return comparison;
}

/** The share of values the reading got right, out of every value either result holds. */
export function scoreOf(counts: Counts): number | null {
  const all = counts.found + counts.missed + counts.wrong + counts.extra;
  return all === 0 ? null : counts.found / all;
}

export function addCounts(into: Counts, more: Counts) {
  for (const outcome of outcomes) into[outcome] += more[outcome];
  return into;
}
