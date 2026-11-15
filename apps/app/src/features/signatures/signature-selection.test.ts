import { describe, expect, it } from 'vitest';

import {
  choose,
  chosenState,
  forSigning,
  noneChosen,
  requestsOf,
  rowRequests,
  type SignatureRow,
  stillListed,
} from './signature-selection';

const row = (id: string, client: string, requestIds: string[]): SignatureRow => ({
  id,
  kind: 'training',
  client: { id: `client-${client}`, name: client },
  domain: 'ssm',
  phase: 'introductory_general',
  test: null,
  day: '2026-10-14',
  slots: ['trainer', 'verifier'],
  issuedAt: '2026-10-15T09:00:00.000Z',
  signatures: requestIds.length,
  workers: [
    {
      employee: { id: `employee-${id}`, lastName: 'Popescu', firstName: 'Ion' },
      agreement: null,
      requests: requestIds.map((requestId, index) => ({
        id: requestId,
        slot: index === 0 ? 'trainer' : 'verifier',
      })),
    },
  ],
});

const sheet: SignatureRow = {
  ...row('sheet', 'Beta', ['s1']),
  kind: 'test_sheet',
  phase: null,
  test: 'hiring',
  slots: ['examiner'],
  workers: [
    {
      employee: { id: 'employee-sheet', lastName: 'Ionescu', firstName: 'Ana' },
      agreement: null,
      requests: [{ id: 's1', slot: 'examiner' }],
    },
  ],
};

describe('the signatures chosen', () => {
  it('turn a worker of a row into the requests the signing dialog lists', () => {
    expect(
      requestsOf(row('t1', 'Alfa', ['a', 'b']), row('t1', 'Alfa', ['a', 'b']).workers[0]!)
    ).toMatchObject([
      {
        id: 'a',
        rowId: 't1',
        kind: 'training_record',
        slot: 'trainer',
        label: 'Instruire introductiv-generală SSM · 14.10.2026',
        record: { domain: 'ssm', phase: 'introductory_general', heldOn: '2026-10-14' },
        testSheet: null,
      },
      { id: 'b', slot: 'verifier' },
    ]);
    expect(requestsOf(sheet, sheet.workers[0]!)).toMatchObject([
      {
        kind: 'test_sheet',
        slot: 'examiner',
        label: 'Fișa de test · Test la angajare SSM · 14.10.2026',
        record: null,
        testSheet: { domain: 'ssm', takenOn: '2026-10-14' },
      },
    ]);
  });

  it('read a row as chosen, in part or not at all', () => {
    const alfa = row('t1', 'Alfa', ['a', 'b']);
    const some = choose(noneChosen, rowRequests(alfa).slice(0, 1), true);
    expect(chosenState(noneChosen, rowRequests(alfa))).toBe(false);
    expect(chosenState(some, rowRequests(alfa))).toBe('indeterminate');
    expect(chosenState(choose(some, rowRequests(alfa), true), rowRequests(alfa))).toBe(true);
  });

  it('drop what the page no longer lists, and keep what another page chose', () => {
    const alfa = row('t1', 'Alfa', ['a', 'b']);
    const chosen = choose(
      choose(noneChosen, rowRequests(alfa), true),
      rowRequests(row('t2', 'Gama', ['c'])),
      true
    );
    const after = stillListed(chosen, [row('t1', 'Alfa', ['b'])]);
    expect([...after.keys()]).toEqual(['b', 'c']);
    expect(stillListed(chosen, [alfa])).toBe(chosen);
  });

  it('go to the dialog by client', () => {
    const chosen = choose(
      choose(noneChosen, rowRequests(row('t1', 'Țara', ['a'])), true),
      rowRequests(row('t2', 'Alfa', ['b'])),
      true
    );
    expect(forSigning(chosen).map((request) => request.client.name)).toEqual(['Alfa', 'Țara']);
  });
});
