import { describe, expect, it } from 'vitest';

import {
  type Changes,
  fieldState,
  type Option,
  type Proposal,
  trainingCategories,
  wholeNumberText,
} from './review-model';
import { categoryChanges, categoryChoices, categoryState } from './training-category';

const worker = trainingCategories[0]!;
const source = [{ file: 'Decizie 1.docx', quote: 'la 6 luni' }];
const option = (value: string | number, extra: Partial<Option> = {}): Option => ({
  value,
  sources: source,
  otherCompanyName: null,
  ...extra,
});
const inferredNotApplicable = option('true', {
  sources: [],
  inferred: 'no_posts_in_category',
});

function stateOf(
  intervals: Option[],
  exclusions: Option[],
  changes: Changes = { fields: {}, items: {} },
  existing?: { interval: number | null; notApplicable: string | null }
) {
  const proposal = {
    trainingSchedule: {
      workerTrainingIntervalMonths: { options: intervals },
      workerTrainingNotApplicable: { options: exclusions },
    },
  } as unknown as Proposal;
  const states = {
    [worker.interval]: fieldState(proposal, changes, worker.interval, existing?.interval),
    [worker.notApplicable]: fieldState(
      proposal,
      changes,
      worker.notApplicable,
      existing?.notApplicable
    ),
  };
  return {
    states,
    changes,
    category: categoryState(states, worker, changes, existing !== undefined),
  };
}

describe('a staff category in the review', () => {
  it('is the interval the documents give', () => {
    const { category } = stateOf([option(6)], []);
    expect(category).toMatchObject({ status: 'value', value: 6, edited: false, conflict: null });
  });

  it('is "Nu se aplică" when the import infers it', () => {
    const { category } = stateOf([], [inferredNotApplicable]);
    expect(category).toMatchObject({ status: 'value', value: 'not_applicable', edited: false });
    expect(category.inForce?.inferred).toBe('no_posts_in_category');
  });

  it('is a choice when the documents give an interval and "Nu se aplică"', () => {
    const { category } = stateOf([option(6)], [option('true')]);
    expect(category).toMatchObject({ status: 'choice', value: null, conflict: 'documents' });
    expect(category.candidates.map((candidate) => candidate.value)).toEqual([6, 'not_applicable']);
  });

  it("is a choice, said as the member's, when an interval was saved beside an inferred exclusion", () => {
    const { category } = stateOf([], [inferredNotApplicable], {
      fields: { [worker.interval]: { value: 6 } },
      items: {},
    });
    expect(category).toMatchObject({ status: 'choice', conflict: 'member' });
  });

  it("is the member's interval once they set the exclusion aside, as the tester's saved review did", () => {
    const { category } = stateOf([], [inferredNotApplicable], {
      fields: { [worker.interval]: { value: 6 }, [worker.notApplicable]: { value: 'false' } },
      items: {},
    });
    expect(category).toMatchObject({ status: 'value', value: 6, edited: true });
    expect(category.proposed).toBe('not_applicable');
  });

  it('is missing when the documents give neither', () => {
    expect(stateOf([], []).category.status).toBe('missing');
  });

  it('compares with what the client has, as one value', () => {
    const existing = { interval: null, notApplicable: 'true' };
    expect(stateOf([option(6)], [], undefined, existing).category).toMatchObject({
      existing: 'not_applicable',
      comparison: 'kept',
    });
    const replaced = stateOf(
      [option(6)],
      [],
      { fields: { [worker.interval]: { replace: true } }, items: {} },
      existing
    );
    expect(replaced.category.comparison).toBe('replaced');
    expect(stateOf([], [option('true')], undefined, existing).category.comparison).toBe('same');
    expect(
      stateOf([option(6)], [], undefined, { interval: null, notApplicable: null }).category
        .comparison
    ).toBe('added');
  });
});

describe('setting a staff category', () => {
  it('takes an interval and sets "Nu se aplică" aside', () => {
    const { states, changes } = stateOf([], [inferredNotApplicable]);
    expect(categoryChanges(states, worker, changes, 4)).toEqual({
      [worker.interval]: { value: 4 },
      [worker.notApplicable]: { value: 'false' },
    });
  });

  it("takes the documents' own option when the member picks it", () => {
    const { states, changes } = stateOf([option(6)], [option('true')]);
    expect(categoryChanges(states, worker, changes, 6)).toEqual({
      [worker.interval]: null,
      [worker.notApplicable]: { value: 'false' },
    });
    expect(categoryChanges(states, worker, changes, 'not_applicable')).toEqual({
      [worker.interval]: { value: null },
      [worker.notApplicable]: null,
    });
  });

  it('writes "Nu se aplică" the documents do not give', () => {
    const { states, changes } = stateOf([option(6)], []);
    expect(categoryChanges(states, worker, changes, 'not_applicable')).toEqual({
      [worker.interval]: { value: null },
      [worker.notApplicable]: { value: 'true' },
    });
  });

  it('clears both, back to the documents where they give nothing', () => {
    const { states, changes } = stateOf([], [inferredNotApplicable], {
      fields: { [worker.interval]: { value: 6 } },
      items: {},
    });
    expect(categoryChanges(states, worker, changes, null)).toEqual({
      [worker.interval]: null,
      [worker.notApplicable]: { value: null },
    });
  });

  it('keeps the choice to replace what the client has', () => {
    const changes = { fields: { [worker.interval]: { replace: true } }, items: {} };
    const { states } = stateOf([option(6)], [], changes);
    expect(categoryChanges(states, worker, changes, 3)[worker.interval]).toEqual({
      value: 3,
      replace: true,
    });
  });
});

describe('the intervals offered for a category', () => {
  it("are the client form's, up to the category's limit, and the documents' own beside them", () => {
    expect(categoryChoices(worker, null).map((choice) => choice.value)).toEqual([1, 2, 3, 4, 6]);
    expect(categoryChoices(worker, 5).map((choice) => choice.label)).toEqual([
      'Lunar',
      'La 2 luni',
      'Trimestrial (la 3 luni)',
      'La 4 luni',
      'La 5 luni',
      'Semestrial (la 6 luni)',
    ]);
  });
});

describe('a whole number written with its unit', () => {
  it('keeps the number', () => {
    expect(wholeNumberText('6 luni')).toBe('6');
    expect(wholeNumberText(' 60 de minute ')).toBe('60');
    expect(wholeNumberText('2 ore.')).toBe('2');
    expect(wholeNumberText('12')).toBe('12');
  });

  it('leaves anything else to be refused', () => {
    expect(wholeNumberText('6 sau 12 luni')).toBe('6 sau 12 luni');
    expect(wholeNumberText('șase luni')).toBe('șase luni');
  });
});
