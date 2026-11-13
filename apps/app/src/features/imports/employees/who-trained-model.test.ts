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
  answered,
  copiesOf,
  copyCandidates,
  questionRows,
  signerGroups,
  unansweredDomains,
  whoTrainedState,
  withAnswer,
  withAnswerCopied,
} from './who-trained-model';

const vasile = { name: 'Iordache Vasile', jobTitle: 'Șef de șantier' };
const pavel = { name: 'Pavel Mihai', jobTitle: 'Specialist SSM' };

function proposalWithHandover(): Proposal {
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
            ] as unknown as typeof page.rows,
            handovers: [{ date: '2022-10-03', text: '03.10.22 Preluare' }],
          }
        : page
    ),
  };
}

const proposal = proposalWithHandover();

function contextOf(changes: Changes = emptyChanges()): ReviewContext {
  return {
    proposal,
    changes,
    states: statesOf(proposal, changes),
    workplaceCount: 2,
    today: '2026-11-14',
  };
}

const person = (id: string) => proposal.people.find((each) => each.id === id)!;
const row = (id: string) =>
  proposal.pages.flatMap((page) => page.rows).find((each) => each.id === id)!;

const answeredToma = () =>
  withAnswer(emptyChanges(), 'toma', 'ssm', {
    trainer: { before: pavel, from: vasile },
    verifier: { from: pavel },
  });

describe('the question of who trained', () => {
  it('is asked where a dated periodic row leaves a role its sheet asks unnamed', () => {
    const context = contextOf();
    expect(questionRows(context, 'toma', 'ssm').map(({ row }) => row.id)).toEqual(['r2', 'r5']);
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
  it('takes the answer of its period, and an undated row keeps the sheet', () => {
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
    expect(signedValues(context, 'toma', row('r7'))).toMatchObject({
      trainerName: null,
      trainerFrom: null,
    });
  });

  it('keeps the name the sheet writes and one typed on the row', () => {
    let changes = withAnswer(emptyChanges(), 'pop', 'ssm', { trainer: { from: vasile } });
    expect(signedValues(contextOf(changes), 'pop', row('r3'))).toMatchObject({
      trainerName: 'Barbu Ionuț',
      trainerFrom: 'sheet',
    });
    changes = withAnswer(answeredToma(), 'toma', 'ssm', {
      trainer: { before: pavel, from: vasile },
    });
    changes = withRow(changes, 'r5', () => ({
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

describe('an answer changed by the member', () => {
  it('sets or clears one period, and is no longer a copy', () => {
    const copied = { trainer: { from: vasile }, copiedFrom: 'toma' };
    expect(answered(copied, 'trainer', 'before', pavel)).toEqual({
      trainer: { before: pavel, from: vasile },
    });
    expect(answered(copied, 'trainer', 'from', null)).toEqual({});
    expect(withAnswer(emptyChanges(), 'pop', 'ssm', {}).people).toEqual({});
  });
});

describe('the same answer for other workers', () => {
  it('offers those without one, the same post first, and lists apart who has one', () => {
    let changes = withPersonChange(answeredToma(), 'toma', (current) => ({
      ...current,
      jobPositionId: sellerId,
    }));
    changes = withAnswer(changes, 'lazar', 'ssm', { trainer: { from: pavel } });
    const { open, answered: own } = copyCandidates(contextOf(changes), person('toma'), 'ssm');
    expect(open.map((each) => [each.person.id, each.samePost])).toEqual([['pop', true]]);
    expect(own.map((each) => each.id)).toEqual(['lazar']);
  });

  it('copies the whole answer, the split date to one without a handover, and nobody’s own', () => {
    const lazar = { trainer: { from: pavel } };
    const changes = withAnswer(answeredToma(), 'lazar', 'ssm', lazar);
    const copied = withAnswerCopied(contextOf(changes), person('toma'), 'ssm', ['pop', 'lazar']);
    expect(copied.people.pop?.whoTrained?.ssm).toEqual({
      trainer: { before: pavel, from: vasile },
      verifier: { from: pavel },
      splitOn: '2022-10-03',
      copiedFrom: 'toma',
    });
    expect(copied.people.lazar?.whoTrained?.ssm).toEqual(lazar);
    expect(copiesOf(copied, 'toma', 'ssm')).toBe(1);
    expect(signedValues(contextOf(copied), 'pop', row('r3'))).toMatchObject({
      verifierName: 'Pavel Mihai',
      verifierFrom: 'answer',
    });
  });

  it('names the person first answered when a copy is copied on', () => {
    const once = withAnswerCopied(contextOf(answeredToma()), person('toma'), 'ssm', ['pop']);
    const twice = withAnswerCopied(contextOf(once), person('pop'), 'ssm', ['lazar']);
    expect(twice.people.lazar?.whoTrained?.ssm?.copiedFrom).toBe('toma');
    expect(copiesOf(twice, 'toma', 'ssm')).toBe(2);
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
