import { proposedIncluded } from '@ssm-usor/import';
import { describe, expect, it } from 'vitest';

import { proposalFixture } from '@/test/import-fixture';

import { type Changes, fieldState, itemStates, type Proposal } from './review-model';

const fixture = () => {
  const proposal = proposalFixture();
  const position = proposal.jobPositions[0]!;
  proposal.jobPositions.push(
    { ...position, id: 'position-3', name: 'Administrator', managementOnly: true },
    { ...position, id: 'position-4', name: 'Vânzător' }
  );
  (proposal as { protectiveEquipment: unknown[] }).protectiveEquipment = [
    ['entry-1', 'position-1'],
    ['entry-2', 'position-3'],
    ['entry-3', 'position-4'],
    ['entry-4', 'position-4'],
  ].map(([id, jobPosition]) => ({
    id,
    sources: [],
    otherCompanyName: null,
    jobPosition: { name: null, id: jobPosition },
    risk: 'Lovire',
    item: 'Mănuși',
    quantity: 1,
    durationMonths: 12,
    allocation: null,
  }));
  proposal.employees.push({
    ...proposal.employees[0]!,
    id: 'employee-2',
    role: 'legal_representative',
  });
  return proposal as unknown as Proposal;
};

// The API's confirm payload (`included` and `withItsPosition`), which the app cannot import.
function payloadTakes(proposal: Proposal, changes: Changes, list: keyof Proposal, id: string) {
  const items = proposal[list] as unknown as {
    id: string;
    otherCompanyName: string | null;
    role?: string;
    managementOnly?: boolean;
    jobPosition?: { id: string | null };
  }[];
  const item = items.find((each) => each.id === id)!;
  const leftOut = new Set(
    itemStates(proposal, changes, 'jobPositions')
      .filter((state) => !state.included)
      .map((state) => state.item.id)
  );
  const proposed =
    proposedIncluded(item) &&
    (list !== 'protectiveEquipment' ||
      changes.items[id]?.values?.jobPosition !== undefined ||
      item.jobPosition?.id == null ||
      !leftOut.has(item.jobPosition.id));
  return changes.items[id]?.included ?? proposed;
}

describe('the switches and what confirming writes', () => {
  it('takes a client item exactly when its switch is on', () => {
    const proposal = fixture();
    const variants: Changes[] = [
      { fields: {}, items: {} },
      {
        fields: {},
        items: {
          'position-1': { included: false },
          'position-2': { included: true },
          'position-3': { included: true },
          'position-4': { included: false },
          'entry-4': { values: { jobPosition: 'position-1' } },
          'employee-2': { included: true },
        },
      },
    ];
    for (const changes of variants) {
      for (const list of ['jobPositions', 'protectiveEquipment', 'employees'] as const) {
        for (const state of itemStates(proposal, changes, list)) {
          expect(state.included, `${list} ${state.item.id}`).toBe(
            payloadTakes(proposal, changes, list, state.item.id)
          );
        }
      }
    }
  });

  it('writes a value possibly from another client exactly when its switch is on', () => {
    const proposal = fixture();
    const off = fieldState(proposal, { fields: {}, items: {} }, 'client.contactEmail');
    expect(off.status).toBe('unticked');
    expect(off.value).toBeNull();
    const on = fieldState(
      proposal,
      { fields: { 'client.contactEmail': { included: true } }, items: {} },
      'client.contactEmail'
    );
    expect(on.status).toBe('value');
    expect(on.value).toBe('office@lactate.ro');
  });
});
