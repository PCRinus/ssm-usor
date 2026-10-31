import { describe, expect, it } from 'vitest';

import { bakerId, employeeProposal, sellerId } from '@/test/employee-import-fixture';

import {
  type Changes,
  confirmSummary,
  decisionsOf,
  emptyChanges,
  heldWith,
  leaving,
  nextToCheck,
  notesOf,
  peopleViews,
  type Proposal,
  resolveField,
  type ReviewContext,
  rowIncluded,
  testIncluded,
  toCheckGroups,
  withField,
  withPersonChange,
  withRow,
} from './employee-review-model';
import { withPage, withTitle, withWorkplace } from './review-changes';

const proposal = employeeProposal() as unknown as Proposal;

function contextOf(changes: Changes = emptyChanges(), workplaceCount = 2): ReviewContext {
  return {
    proposal,
    changes,
    states: Object.fromEntries(
      proposal.people.map((person) => [person.id, changes.people[person.id]?.state ?? 'to_check'])
    ),
    workplaceCount,
    today: '2026-10-31',
  };
}

const person = (id: string) => proposal.people.find((each) => each.id === id)!;
const row = (id: string) =>
  proposal.pages.flatMap((page) => page.rows).find((each) => each.id === id)!;
const tags = (context: ReviewContext, id: string) =>
  decisionsOf(context, person(id)).map((decision) => decision.tag);

describe('resolving a field', () => {
  it('takes the one value the pages give', () => {
    expect(resolveField(contextOf(), person('pop'), 'hiredAt')).toMatchObject({
      value: '2023-05-02',
      choice: false,
      edited: false,
    });
  });

  it("keeps an existing employee's value by default and takes the sheet's when asked", () => {
    const address = resolveField(contextOf(), person('lazar'), 'homeAddress');
    expect(address).toMatchObject({ value: 'Str. Viitorului nr. 3, Sibiu', replaced: false });
    const replaced = withField(emptyChanges(), 'lazar', 'homeAddress', {
      option: 0,
      replace: true,
    });
    expect(resolveField(contextOf(replaced), person('lazar'), 'homeAddress')).toMatchObject({
      value: 'Str. Fabricii nr. 21, Sibiu',
      replaced: true,
    });
  });

  it('fills an empty field of an existing employee from the sheet', () => {
    expect(resolveField(contextOf(), person('lazar'), 'hiredAt').value).toBe('2019-04-03');
  });

  it('takes what the member wrote, even an empty value', () => {
    const cleared = withField(emptyChanges(), 'pop', 'hiredAt', { value: null });
    expect(resolveField(contextOf(cleared), person('pop'), 'hiredAt')).toMatchObject({
      value: null,
      edited: true,
    });
  });

  it("drops a value from a page given to someone else, and asks when one's pages disagree", () => {
    const moved = withPage(emptyChanges(), 'p3', 'toma');
    expect(resolveField(contextOf(moved), person('pop'), 'hiredAt').value).toBeNull();
    const twoDates = {
      ...proposal,
      people: proposal.people.map((each) =>
        each.id === 'pop'
          ? {
              ...each,
              fields: {
                ...each.fields,
                hiredAt: {
                  options: [
                    { value: '2023-05-02', pageIds: ['p3'] },
                    { value: '2023-05-20', pageIds: ['p3'] },
                  ],
                },
              },
            }
          : each
      ),
    } as Proposal;
    const context = { ...contextOf(), proposal: twoDates };
    const pop = twoDates.people.find((each) => each.id === 'pop')!;
    expect(resolveField(context, pop, 'hiredAt')).toMatchObject({ choice: true, value: null });
    expect(decisionsOf(context, pop).map((decision) => decision.key)).toContain('choice-hiredAt');
  });
});

describe('what a person still needs', () => {
  it('asks for the post of a title the client lacks, the CNP and the workplace', () => {
    expect(tags(contextOf(), 'toma')).toEqual([
      'Post de hotărât',
      'CNP cu o cifră necitită',
      'Loc de muncă de ales',
      'Lipsește cine a instruit la o instruire',
    ]);
  });

  it('settles each once it is answered, for the whole title or text', () => {
    let changes = withTitle(emptyChanges(), 'title-helper', bakerId);
    changes = withPersonChange(changes, 'toma', (change) => ({ ...change, cnpCorrection: true }));
    changes = withWorkplace(changes, 'place-none', null);
    changes = withRow(changes, 'r5', () => ({ values: { trainerName: 'Barbu Ionuț' } }));
    expect(tags(contextOf(changes), 'toma')).toEqual([]);
  });

  it('never asks the workplace of a client with one', () => {
    expect(tags(contextOf(emptyChanges(), 1), 'toma')).not.toContain('Loc de muncă de ales');
  });

  it('asks a near title to be confirmed, not chosen', () => {
    const near = {
      ...proposal,
      jobTitles: proposal.jobTitles.map((group) =>
        group.id === 'title-helper' ? { ...group, match: 'near', proposedId: bakerId } : group
      ),
    } as Proposal;
    const decisions = decisionsOf({ ...contextOf(), proposal: near }, person('toma'));
    expect(decisions[0]).toMatchObject({ tag: 'Post de confirmat', tone: 'warning' });
  });

  it('wants the required data of someone new, and nothing of an existing employee', () => {
    const cleared = withField(emptyChanges(), 'pop', 'hiredAt', { value: null });
    expect(tags(contextOf(cleared), 'pop')).toEqual(['Lipsește data angajării']);
    expect(tags(contextOf(), 'lazar')).toEqual([]);
  });

  it('wants a valid CNP the member wrote, and none when left without', () => {
    const wrong = withField(emptyChanges(), 'pop', 'cnp', { value: '1900517320140' });
    expect(tags(contextOf(wrong), 'pop')).toEqual(['CNP de corectat']);
    const without = withField(emptyChanges(), 'toma', 'cnp', { value: null });
    expect(tags(contextOf(without), 'toma')).not.toContain('CNP cu o cifră necitită');
  });

  it('signals an unusual duration without asking anything', () => {
    expect(notesOf(contextOf(), person('pop')).map((note) => note.tag)).toEqual([
      'Durată neobișnuită la o instruire',
    ]);
    expect(tags(contextOf(), 'pop')).toEqual([]);
  });
});

describe('rows and tests', () => {
  it('leaves out a row already in the app unless ticked, and keeps a verified test', () => {
    expect(rowIncluded(emptyChanges(), row('r4'))).toBe(false);
    expect(
      rowIncluded(
        withRow(emptyChanges(), 'r4', () => ({ included: true })),
        row('r4')
      )
    ).toBe(true);
    expect(testIncluded(emptyChanges(), row('r1'))).toBe(true);
    expect(
      testIncluded(
        withRow(emptyChanges(), 'r1', () => ({ test: false })),
        row('r1')
      )
    ).toBe(false);
  });

  it('counts the others a training is held with when everything matches', () => {
    const context = contextOf();
    expect(heldWith(context, 'toma', row('r2'))).toBe(0);
    expect(heldWith(context, 'lazar', row('r6'))).toBe(0);
    const sameDay = withRow(emptyChanges(), 'r5', () => ({
      values: { trainerName: 'Barbu Ionuț' },
    }));
    expect(heldWith(contextOf(sameDay), 'lazar', row('r6'))).toBe(1);
  });
});

describe('the people list', () => {
  it('splits those still to check into what has a decision and what is unopened', () => {
    const { decide, unopened } = toCheckGroups(peopleViews(contextOf()));
    expect(decide.map((view) => view.person.id)).toEqual(['toma']);
    expect(unopened.map((view) => view.person.id)).toEqual(['pop', 'lazar']);
  });

  it('checks a person with nothing to decide on moving on, and no one else', () => {
    const context = contextOf();
    expect(leaving(context, person('pop')).people.pop?.state).toBe('checked');
    expect(leaving(context, person('toma'))).toBe(context.changes);
    const aside = withPersonChange(emptyChanges(), 'pop', () => ({ state: 'set_aside' }));
    expect(leaving(contextOf(aside), person('pop')).people.pop?.state).toBe('set_aside');
  });

  it('continues with the next person to check, from the start when none follows', () => {
    const checked = withPersonChange(emptyChanges(), 'pop', () => ({ state: 'checked' }));
    expect(nextToCheck(contextOf(checked))?.id).toBe('toma');
    expect(nextToCheck(contextOf(checked), 'toma')?.id).toBe('lazar');
    expect(nextToCheck(contextOf(checked), 'lazar')?.id).toBe('toma');
  });
});

describe('the confirm summary', () => {
  it('writes the checked people only, with their trainings, tests and photographs', () => {
    let changes = withPersonChange(emptyChanges(), 'pop', () => ({ state: 'checked' }));
    changes = withPersonChange(changes, 'lazar', () => ({ state: 'checked' }));
    const summary = confirmSummary(contextOf(changes));
    expect(summary.created.map((each) => each.id)).toEqual(['pop']);
    expect(summary.completed.map((each) => each.id)).toEqual(['lazar']);
    expect(summary.toCheck.map((each) => each.id)).toEqual(['toma']);
    expect(summary).toMatchObject({ rows: 2, trainingsHeld: 2, files: 2, filesLeft: 3 });
    expect(summary.noContact.map((each) => each.id)).toEqual(['pop']);
    expect(summary.unusual.map(({ person }) => person.id)).toEqual(['pop']);
  });

  it('makes rows of several people that match in everything one training held', () => {
    let changes = withTitle(emptyChanges(), 'title-helper', sellerId);
    for (const id of ['toma', 'lazar'])
      changes = withPersonChange(changes, id, () => ({ state: 'checked' }));
    changes = withRow(changes, 'r5', () => ({ values: { trainerName: 'Barbu Ionuț' } }));
    const summary = confirmSummary(contextOf(changes));
    expect(summary.rows).toBe(4);
    expect(summary.trainingsHeld).toBe(3);
    expect(summary.tests).toEqual({ ssm: 1, psi: 0 });
  });
});
