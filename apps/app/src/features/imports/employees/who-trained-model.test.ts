import { toEmployeePayload } from '@ssm-usor/import';
import { describe, expect, it } from 'vitest';

import { employeeProposal, sellerId, sheetRow } from '@/test/employee-import-fixture';

import {
  type Changes,
  emptyChanges,
  type Proposal,
  type ReviewContext,
  signedValues,
  statesOf,
  withPersonChange,
  withRow,
} from './employee-review-model';
import {
  copiesOf,
  copyCandidates,
  questionRows,
  settleCopies,
  signerGroups,
  staleOf,
  unansweredDomains,
  whoTrainedState,
  windowOf,
  withAnswer,
  withAnswerCopied,
  withRole,
} from './who-trained-model';

const vasile = { name: 'Iordache Vasile', jobTitle: 'Șef de șantier' };
const pavel = { name: 'Pavel Mihai', jobTitle: 'Specialist SSM' };
const october = { splitOn: '2022-10-03', previousOn: null };
const none = { splitOn: null, previousOn: null };

function proposalWithHandover(handovers = [{ date: '2022-10-03', text: '03.10.22 Preluare' }]) {
  const base = employeeProposal() as unknown as Proposal;
  return {
    ...base,
    pages: base.pages.map((page) =>
      page.id === 'p2'
        ? {
            ...page,
            rows: [
              sheetRow('r2', { heldOn: '2022-05-16', trainerName: null, trainerJobTitle: null }),
              sheetRow('r5', { heldOn: '2023-05-15', trainerName: null, trainerJobTitle: null }),
              sheetRow('r7', { heldOn: null, trainerName: null, trainerJobTitle: null }),
              sheetRow('r9', {
                heldOn: '2022-10-01',
                trainerName: null,
                trainerJobTitle: null,
                flags: ['month_only'],
              }),
            ] as unknown as typeof page.rows,
            handovers,
          }
        : page
    ),
  } as Proposal;
}

const proposal = proposalWithHandover();

function contextOf(changes: Changes = emptyChanges(), with_ = proposal): ReviewContext {
  return {
    proposal: with_,
    changes,
    states: statesOf(with_, changes),
    workplaceCount: 2,
    today: '2026-11-14',
  };
}

const person = (id: string) => proposal.people.find((each) => each.id === id)!;
const row = (id: string) =>
  proposal.pages.flatMap((page) => page.rows).find((each) => each.id === id)!;

const answeredToma = () =>
  withAnswer(emptyChanges(), 'toma', 'ssm', {
    trainer: { before: pavel, from: vasile, ...october },
    verifier: { from: pavel, ...october },
  });

describe('the question of who trained', () => {
  it('is asked where a dated periodic row leaves a role its sheet asks unnamed', () => {
    const context = contextOf();
    expect(questionRows(context, 'toma', 'ssm').map(({ row }) => row.id)).toEqual([
      'r2',
      'r5',
      'r9',
    ]);
    expect(questionRows(context, 'pop', 'ssm').map(({ row }) => row.id)).toEqual(['r3']);
    expect(questionRows(context, 'toma', 'su')).toEqual([]);
    expect(unansweredDomains(context, 'toma')).toEqual(['ssm']);
  });

  it('counts the people without an answer, and blocks nothing', () => {
    const before = whoTrainedState(contextOf());
    expect(before.asked).toBe(3);
    expect(before.unanswered.map((each) => each.id)).toEqual(['toma', 'pop', 'lazar']);
    expect(whoTrainedState(contextOf(answeredToma())).unanswered.map((each) => each.id)).toEqual([
      'pop',
      'lazar',
    ]);
  });
});

describe('a row named by the answer', () => {
  it('takes the answer of its period; an undated row and a month-only one of the handover’s month keep the sheet', () => {
    const context = contextOf(answeredToma());
    expect(signedValues(context, 'toma', row('r2'))).toMatchObject({
      trainerName: 'Pavel Mihai',
      trainerFrom: 'answer',
      verifierName: null,
      verifierFrom: null,
    });
    expect(signedValues(context, 'toma', row('r5'))).toMatchObject({
      trainerName: 'Iordache Vasile',
      verifierName: 'Pavel Mihai',
      verifierFrom: 'answer',
    });
    for (const id of ['r7', 'r9']) {
      expect(signedValues(context, 'toma', row(id))).toMatchObject({
        trainerName: null,
        trainerFrom: null,
      });
    }
    const dayed = withRow(answeredToma(), 'r9', () => ({ values: { heldOn: '2022-10-20' } }));
    expect(signedValues(contextOf(dayed), 'toma', row('r9')).trainerName).toBe('Iordache Vasile');
  });

  it('keeps the name the sheet writes and one typed on the row', () => {
    let changes = withAnswer(emptyChanges(), 'pop', 'ssm', { trainer: { from: vasile, ...none } });
    expect(signedValues(contextOf(changes), 'pop', row('r3'))).toMatchObject({
      trainerName: 'Barbu Ionuț',
      trainerFrom: 'sheet',
    });
    changes = withRow(answeredToma(), 'r5', () => ({
      values: { trainerName: 'Crăciun Dorin', trainerJobTitle: 'Administrator' },
    }));
    expect(signedValues(contextOf(changes), 'toma', row('r5'))).toMatchObject({
      trainerName: 'Crăciun Dorin',
      trainerFrom: 'row',
    });
  });

  it('names the rows as confirming writes them', () => {
    const changes = withPersonChange(answeredToma(), 'toma', (current) => ({
      ...current,
      state: 'checked',
      jobPositionId: sellerId,
      workplaceId: null,
    }));
    const context = contextOf(changes);
    const { payload } = toEmployeePayload({
      proposal: proposal as never,
      changes: changes as never,
      records: { jobPositions: [{ id: sellerId }], workplaces: [], employees: [] },
      today: context.today,
    });
    for (const id of ['r2', 'r5']) {
      const values = signedValues(context, 'toma', row(id));
      expect(
        payload.trainings.find((training) => training.held_on === values.heldOn)
      ).toMatchObject({ trainer_name: values.trainerName ?? undefined });
    }
  });
});

describe('an answer when the sheets’ handover changes', () => {
  it('names nothing, counts the person unanswered and keeps the old names to choose again', () => {
    const moved = proposalWithHandover([{ date: '2023-01-09', text: 'Preluare' }]);
    const context = contextOf(answeredToma(), moved);
    expect(staleOf(context, 'toma', 'ssm')).toEqual(['trainer', 'verifier']);
    expect(unansweredDomains(context, 'toma')).toEqual(['ssm']);
    expect(signedValues(context, 'toma', row('r5')).trainerName).toBeNull();
    expect(context.changes.people.toma?.whoTrained?.ssm?.trainer?.before).toEqual(pavel);

    const again = withRole(
      context.changes.people.toma?.whoTrained?.ssm,
      'trainer',
      { from: vasile },
      windowOf(context, 'toma', 'ssm')
    );
    expect(again.trainer).toEqual({ from: vasile, splitOn: '2023-01-09', previousOn: null });
    expect(
      staleOf(
        { ...context, changes: withAnswer(context.changes, 'toma', 'ssm', again) },
        'toma',
        'ssm'
      )
    ).toEqual(['verifier']);
  });
});

describe('an answer changed by the member', () => {
  it('sets a whole role under the handovers it was chosen under, and is no longer a copy', () => {
    const copied = { trainer: { from: vasile, ...october }, copiedFrom: 'toma' };
    expect(withRole(copied, 'trainer', { before: pavel, from: vasile }, october)).toEqual({
      trainer: { before: pavel, from: vasile, ...october },
    });
    expect(withRole(copied, 'trainer', {}, october)).toEqual({});
    expect(withAnswer(emptyChanges(), 'pop', 'ssm', {}).people).toEqual({});
  });
});

describe('the same answer for other workers', () => {
  it('offers those without one, the same post first, and lists apart who has one', () => {
    let changes = withPersonChange(answeredToma(), 'toma', (current) => ({
      ...current,
      jobPositionId: sellerId,
    }));
    changes = withAnswer(changes, 'lazar', 'ssm', { trainer: { from: pavel, ...none } });
    const { open, answered: own } = copyCandidates(contextOf(changes), person('toma'), 'ssm');
    expect(open.map((each) => [each.person.id, each.samePost])).toEqual([['pop', true]]);
    expect(own.map((each) => each.id)).toEqual(['lazar']);
  });

  it('never offers one whose sheets record another handover', () => {
    const other = {
      ...proposal,
      pages: proposal.pages.map((page) =>
        page.id === 'p3' ? { ...page, handovers: [{ date: '2021-03-01', text: 'Preluare' }] } : page
      ),
    } as Proposal;
    const candidates = copyCandidates(contextOf(answeredToma(), other), person('toma'), 'ssm');
    expect(candidates.open.map((each) => each.person.id)).toEqual(['lazar']);
    expect(candidates.otherDates.map((each) => each.id)).toEqual(['pop']);
  });

  it('copies the whole answer, the handover to one without one, and nobody’s own', () => {
    const lazar = { trainer: { from: pavel, ...none } };
    const changes = withAnswer(answeredToma(), 'lazar', 'ssm', lazar);
    const copied = withAnswerCopied(contextOf(changes), person('toma'), 'ssm', ['pop', 'lazar']);
    expect(copied.people.pop?.whoTrained?.ssm).toEqual({
      trainer: { before: pavel, from: vasile, ...october },
      verifier: { from: pavel, ...october },
      splitCopied: true,
      copiedFrom: 'toma',
    });
    expect(copied.people.lazar?.whoTrained?.ssm).toEqual(lazar);
    expect(copiesOf(contextOf(copied), 'toma', 'ssm')).toBe(1);
    expect(signedValues(contextOf(copied), 'pop', row('r3'))).toMatchObject({
      verifierName: 'Pavel Mihai',
      verifierFrom: 'answer',
    });
  });

  it('names the person first answered when a copy is copied on', () => {
    const once = withAnswerCopied(contextOf(answeredToma()), person('toma'), 'ssm', ['pop']);
    const twice = withAnswerCopied(contextOf(once), person('pop'), 'ssm', ['lazar']);
    expect(twice.people.lazar?.whoTrained?.ssm?.copiedFrom).toBe('toma');
    expect(copiesOf(contextOf(twice), 'toma', 'ssm')).toBe(2);
  });

  it('follows its source while unchanged, and stays as the member changed it', () => {
    const copied = withAnswerCopied(contextOf(answeredToma()), person('toma'), 'ssm', [
      'pop',
      'lazar',
    ]);
    const changedAtSource = withAnswer(copied, 'toma', 'ssm', {
      trainer: { from: pavel, ...october },
    });
    const ownAtLazar = withAnswer(changedAtSource, 'lazar', 'ssm', {
      ...withRole(
        changedAtSource.people.lazar?.whoTrained?.ssm,
        'trainer',
        { from: vasile },
        october
      ),
    });
    const settled = settleCopies(contextOf(ownAtLazar));
    expect(settled.people.pop?.whoTrained?.ssm).toEqual({
      trainer: { from: pavel, ...october },
      splitCopied: true,
      copiedFrom: 'toma',
    });
    expect(settled.people.lazar?.whoTrained?.ssm?.copiedFrom).toBeUndefined();
    expect(settled.people.lazar?.whoTrained?.ssm?.trainer?.from).toEqual(vasile);
    expect(copiesOf(contextOf(settled), 'toma', 'ssm')).toBe(1);

    const cleared = settleCopies(contextOf(withAnswer(settled, 'toma', 'ssm', undefined)));
    expect(cleared.people.pop?.whoTrained).toBeUndefined();
  });

  it('becomes the holder’s own when its source is left out of the import', () => {
    const copied = withAnswerCopied(contextOf(answeredToma()), person('toma'), 'ssm', ['pop']);
    const leftOut = withPersonChange(copied, 'toma', (current) => ({
      ...current,
      included: false,
    }));
    const settled = settleCopies(contextOf(leftOut));
    expect(settled.people.pop?.whoTrained?.ssm).toEqual({
      trainer: { before: pavel, from: vasile, ...october },
      verifier: { from: pavel, ...october },
      splitCopied: true,
    });
  });
});

describe('the people offered for a role', () => {
  const counts = new Map([['pavel mihai', 6]]);

  it('groups the sheet’s names, the client’s and the organization’s, each name once', () => {
    const groups = signerGroups({
      role: 'trainer',
      sheetNames: [pavel, { name: null, jobTitle: null }, { name: 'Pavel Mihai', jobTitle: null }],
      responsible: [vasile, { name: 'PAVEL Mihai', jobTitle: 'Administrator' }],
      members: [{ name: 'Andreea Ionescu', jobTitle: null }],
      counts,
    });
    expect(
      groups.map((group) => [group.label, group.options.map((each) => [each.name, each.sheets])])
    ).toEqual([
      ['Citite de pe fișe, la instruirile de la angajare', [['Pavel Mihai', 6]]],
      ['Responsabilii clientului', [['Iordache Vasile', 0]]],
      ['Din organizația ta', [['Andreea Ionescu', 0]]],
    ]);
  });

  it('offers a verifier only with a function', () => {
    const groups = signerGroups({
      role: 'verifier',
      sheetNames: [],
      responsible: [],
      members: [{ name: 'Andreea Ionescu', jobTitle: null }, vasile],
      counts,
    });
    expect(groups.flatMap((group) => group.options.map((each) => each.name))).toEqual([
      'Iordache Vasile',
    ]);
  });
});
