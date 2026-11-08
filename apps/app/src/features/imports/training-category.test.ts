import { describe, expect, it } from 'vitest';

import { type Changes, fieldState, type Option, type Proposal } from './review-model';
import {
  durationChoices,
  fireScheduleStart,
  intervalChoicesOf,
  keptPosts,
  numberChange,
  schedulePaths,
  trainingField,
} from './training-category';

const path = 'trainingSchedule.workerTrainingIntervalMonths';
const minutes = 'trainingSchedule.periodicTrainingMinutes';
const source = [{ file: 'Decizie 1.docx', quote: 'la 6 luni' }];
const option = (value: number): Option => ({ value, sources: source, otherCompanyName: null });
const none: Changes = { fields: {}, items: {} };

function statesOf(
  field: string,
  options: Option[],
  changes: Changes = none,
  existing?: number | null
) {
  const proposal = {
    trainingSchedule: { [field.split('.')[1]!]: { options } },
  } as unknown as Proposal;
  return { [field]: fieldState(proposal, changes, field, existing) };
}

const legal = { domain: 'ssm', category: 'execution', hasPosts: true } as const;
const intervals = intervalChoicesOf('ssm', 'execution');

describe('a field of a training schedule', () => {
  it('is the control with the documents’ value when they give one the list offers', () => {
    expect(trainingField(statesOf(path, [option(3)]), path, intervals, legal)).toMatchObject({
      mode: 'value',
      value: 3,
      settled: true,
    });
  });

  it('waits for a pick while the documents give several values', () => {
    const states = statesOf(path, [option(3), option(6)]);
    expect(trainingField(states, path, intervals, legal)).toMatchObject({
      mode: 'choice',
      value: null,
      settled: false,
    });
    const picked = statesOf(path, [option(3), option(6)], {
      fields: { [path]: { option: 1 } },
      items: {},
    });
    expect(trainingField(picked, path, intervals, legal)).toMatchObject({
      mode: 'choice',
      value: 6,
      settled: true,
    });
  });

  it('takes no value outside the list, and waits for one from it', () => {
    const states = statesOf(minutes, [option(45)]);
    expect(trainingField(states, minutes, durationChoices.ssm)).toMatchObject({
      mode: 'outside',
      value: null,
      settled: false,
    });
    const written = statesOf(minutes, [option(45)], {
      fields: { [minutes]: { value: 60 } },
      items: {},
    });
    expect(trainingField(written, minutes, durationChoices.ssm)).toMatchObject({
      mode: 'outside',
      value: 60,
      settled: true,
    });
  });

  it('stands at the starting interval for a category with posts the documents leave out, until confirmed', () => {
    expect(trainingField(statesOf(path, []), path, intervals, legal)).toMatchObject({
      mode: 'starting',
      value: 6,
      settled: false,
    });
    const confirmed = statesOf(path, [], { fields: { [path]: { value: 6 } }, items: {} });
    expect(trainingField(confirmed, path, intervals, legal)).toMatchObject({
      mode: 'starting',
      value: 6,
      settled: true,
    });
  });

  it('stands at the starting interval, still to confirm, where an older review cleared the value', () => {
    const cleared: Changes = { fields: { [path]: { value: null } }, items: {} };
    for (const options of [[], [option(3)], [option(3), option(4)]]) {
      expect(trainingField(statesOf(path, options, cleared), path, intervals, legal)).toMatchObject(
        { mode: 'starting', value: 6, settled: false }
      );
    }
  });

  it('has no interval for a category without posts', () => {
    expect(
      trainingField(statesOf(path, []), path, intervals, { ...legal, hasPosts: false })
    ).toMatchObject({ mode: 'value', value: null, settled: true });
  });

  it('waits on no value outside the list where an existing client has one, as confirming keeps it', () => {
    expect(
      trainingField(statesOf(path, [option(5)], none, 5), path, intervals, legal)
    ).toMatchObject({ mode: 'value', value: 5, settled: true });
  });

  it("keeps an existing client's value while the documents give several, until one replaces it", () => {
    expect(
      trainingField(statesOf(path, [option(3), option(4)], none, 6), path, intervals, legal)
    ).toMatchObject({ mode: 'choice', value: 6, settled: true });
    const taken: Changes = { fields: { [path]: { option: 1, replace: true } }, items: {} };
    expect(
      trainingField(statesOf(path, [option(3), option(4)], taken, 6), path, intervals, legal)
    ).toMatchObject({ mode: 'choice', value: 4, settled: true });
  });

  it("keeps an existing client's value where the documents differ, and its own where they give none", () => {
    expect(
      trainingField(statesOf(path, [option(3)], none, 6), path, intervals, legal)
    ).toMatchObject({ mode: 'differs', value: 6, settled: true });
    expect(trainingField(statesOf(path, [], none, 6), path, intervals, legal)).toMatchObject({
      mode: 'value',
      value: 6,
    });
  });
});

describe('an SU schedule the import starts', () => {
  const su = { domain: 'su', hasPosts: true } as const;
  const paths = [
    ...Object.values(schedulePaths.ssm).flatMap((each) =>
      typeof each === 'string' ? [each] : Object.values(each)
    ),
    ...Object.values(schedulePaths.su).flatMap((each) =>
      typeof each === 'string' ? [each] : Object.values(each)
    ),
  ];
  function schedule(
    given: Record<string, number[]>,
    changes: Changes = none,
    existing: Record<string, number> = {}
  ) {
    const proposal = { trainingSchedule: {}, fireSafety: {} } as Record<
      string,
      Record<string, unknown>
    >;
    for (const each of paths) {
      const [group, name] = each.split('.') as [string, string];
      proposal[group]![name] = { options: (given[each] ?? []).map(option) };
    }
    return Object.fromEntries(
      paths.map((each) => [
        each,
        fieldState(proposal as unknown as Proposal, changes, each, existing[each] ?? null),
      ])
    );
  }

  it('starts each category at its usual interval, to confirm, as confirming writes it', () => {
    const states = schedule({});
    const execution = schedulePaths.su.interval.execution;
    const administrative = schedulePaths.su.interval.technical_administrative;
    expect(
      trainingField(states, execution, intervalChoicesOf('su', 'execution'), {
        ...su,
        category: 'execution',
      })
    ).toMatchObject({ mode: 'starting', value: 3, settled: false });
    expect(
      trainingField(states, administrative, intervalChoicesOf('su', 'technical_administrative'), {
        ...su,
        category: 'technical_administrative',
      })
    ).toMatchObject({ mode: 'starting', value: 6, settled: false });
  });

  it('takes two hours and the SSM calendar where the documents leave them, as confirming writes them', () => {
    const states = schedule(
      { [schedulePaths.ssm.firstMonth]: [3] },
      { fields: { [schedulePaths.ssm.dayFrom]: { value: 10 } }, items: {} }
    );
    expect(fireScheduleStart(states, ['execution'])).toEqual({
      periodicTrainingHours: 2,
      trainingFirstMonth: 3,
      trainingDayFrom: 10,
    });
    expect(
      fireScheduleStart(schedule({ [schedulePaths.su.duration]: [4] }), ['execution'])
    ).toEqual({});
  });

  it("adds nothing to an existing client's SU schedule, nor where nothing of it is written", () => {
    expect(
      fireScheduleStart(schedule({}, none, { [schedulePaths.su.duration]: 4 }), ['execution'])
    ).toEqual({});
    expect(fireScheduleStart(schedule({ [schedulePaths.ssm.firstMonth]: [3] }), [])).toEqual({});
    expect(fireScheduleStart(schedule({ [schedulePaths.su.firstMonth]: [5] }), [])).toEqual({
      periodicTrainingHours: 2,
    });
  });
});

describe('the change a pick makes', () => {
  it('is none where the documents give the value, and the value otherwise', () => {
    const [state] = Object.values(statesOf(path, [option(3)]));
    expect(numberChange(state!, 3, false)).toBeNull();
    expect(numberChange(state!, 2, false)).toEqual({ value: 2 });
  });

  it('is the documents’ option where they give several', () => {
    const [state] = Object.values(statesOf(path, [option(3), option(6)]));
    expect(numberChange(state!, 6, false)).toEqual({ option: 1 });
  });

  it("replaces an existing client's value, and drops back to it", () => {
    const [state] = Object.values(statesOf(path, [option(3)], none, 6));
    expect(numberChange(state!, 2, true)).toEqual({ value: 2, replace: true });
    expect(numberChange(state!, 6, true)).toBeNull();
  });
});

describe('the posts the client keeps', () => {
  const proposal = {
    jobPositions: [
      { id: 'p-1', name: 'Brutar', staffCategory: 'execution', otherCompanyName: null },
      {
        id: 'p-2',
        name: 'Contabil',
        staffCategory: 'technical_administrative',
        otherCompanyName: null,
      },
      { id: 'p-3', name: 'Paznic', staffCategory: null, otherCompanyName: null },
    ],
  } as unknown as Proposal;

  it('are the ticked posts, one without a category as execution, beside the client’s own', () => {
    const kept = keptPosts(proposal, { fields: {}, items: { 'p-2': { included: false } } }, [
      { id: 'e-1', name: 'Secretar', staffCategory: 'technical_administrative' },
    ]);
    expect(kept).toEqual([
      { name: 'Secretar', staffCategory: 'technical_administrative' },
      { name: 'Brutar', staffCategory: 'execution' },
      { name: 'Paznic', staffCategory: 'execution' },
    ]);
  });

  it("keep the client's category for a post of the same name, as confirming does", () => {
    const existing = [{ id: 'e-1', name: 'contabil', staffCategory: 'execution' }] as const;
    expect(keptPosts(proposal, none, existing).map((post) => post.staffCategory)).toEqual([
      'execution',
      'execution',
      'execution',
    ]);
    const replaced = keptPosts(
      proposal,
      { fields: {}, items: { 'p-2': { existingId: 'e-1', replace: ['staffCategory'] } } },
      existing
    );
    expect(replaced[0]).toEqual({ name: 'contabil', staffCategory: 'technical_administrative' });
  });
});
