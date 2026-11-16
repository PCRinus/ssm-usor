import { proposedIncluded } from '@ssm-usor/import';
import { describe, expect, it } from 'vitest';

import { proposalFixture } from '@/test/import-fixture';

import {
  anafMismatch,
  type Changes,
  type ExistingWorkplace,
  fieldState,
  inactiveOffices,
  itemStates,
  noChanges,
  officeActivityStates,
  type Proposal,
  type ReviewScope,
} from './review-model';

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

describe('a registered office with no activity', () => {
  const office = () => {
    const proposal = proposalFixture();
    Object.assign(proposal.workplaces[0]!, {
      officeHasActivity: false,
      suggested: { officeHasActivity: [{ file: 'Decizie 1.docx', quote: 'Atelier' }] },
    });
    proposal.workplaces.push({
      ...proposal.workplaces[0]!,
      id: 'workplace-2',
      name: 'Atelier',
      addressLine: 'Str. Gării nr. 3',
      isRegisteredOffice: false,
    });
    return proposal as unknown as Proposal;
  };
  const kept: Changes = { fields: { 'officeActivity.workplace-1': { option: 0 } }, items: {} };
  const own = (officeHasActivity: boolean): ExistingWorkplace => ({
    id: 'existing-office',
    name: 'SEDIU',
    addressLine: null,
    isRegisteredOffice: true,
    officeHasActivity,
  });
  const into = (existingWorkplaces: ExistingWorkplace[]): ReviewScope => ({
    blockers: [],
    existingClient: true,
    existingWorkplaces,
  });

  it('is the office the import creates and the member kept as such', () => {
    const scope: ReviewScope = { blockers: [], existingClient: false, existingWorkplaces: [] };
    expect([...inactiveOffices(office(), kept, scope)]).toEqual(['workplace-1']);
    expect(inactiveOffices(office(), noChanges, scope).size).toBe(0);
  });

  it('ignores the decision once the office is the client’s own, whose answer decides', () => {
    expect(inactiveOffices(office(), kept, into([own(true)])).size).toBe(0);
    expect(officeActivityStates(office(), kept, into([own(true)]))).toEqual([]);
    expect([...inactiveOffices(office(), noChanges, into([own(false)]))]).toEqual(['workplace-1']);
  });

  it('follows the client’s office the member picked, and none when they picked a new one', () => {
    const picked = (existingId: string | null): Changes => ({
      ...kept,
      items: { 'workplace-1': { existingId } },
    });
    const other = { ...own(false), id: 'other-office', name: 'Punct central' };
    expect([...inactiveOffices(office(), picked('other-office'), into([other]))]).toEqual([
      'workplace-1',
    ]);
    expect([...inactiveOffices(office(), picked(null), into([own(true)]))]).toEqual([
      'workplace-1',
    ]);
  });
});

describe('the company ANAF registers under the CUI', () => {
  const named = (legalName: string) => {
    const proposal = proposalFixture();
    proposal.client.legalName.options[0]!.value = legalName;
    return proposal;
  };
  const registered = (legalName: string) => ({ cui: '31458207', legalName, inactive: false });

  it('is still worth checking when the documents write only the legal form otherwise', () => {
    const anaf = registered('SOCIETATEA PROFESIONALA NOTARIALA STANCIUC');
    for (const name of [
      'S.P.N. / STANCIUC',
      'SPN STANCIUC',
      'SOCIETATE PROFESIONALA NOTARIALA STANCIUC',
    ]) {
      expect(anafMismatch(named(name), noChanges, anaf), name).toBe(anaf);
    }
  });

  it('is the documents’ company when they write ANAF’s name, whatever the case or diacritics', () => {
    const anaf = registered('SOCIETATEA PROFESIONALA NOTARIALA STANCIUC');
    expect(
      anafMismatch(named('Societatea Profesională Notarială Stănciuc'), noChanges, anaf)
    ).toBeNull();
  });

  it('is another firm when the rest of the name differs', () => {
    const anaf = registered('BIROU INDIVIDUAL NOTARIAL IONESCU ANA');
    expect(anafMismatch(named('S.P.N. / STANCIUC'), noChanges, anaf)).toBe(anaf);
  });
});
