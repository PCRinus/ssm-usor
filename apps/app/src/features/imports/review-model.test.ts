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
  type RegisteredCompany,
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
  const anafName = 'SOCIETATEA PROFESIONALA NOTARIALA STANCIUC';
  const registered = (legalName: string) => ({ cui: '31458207', legalName, inactive: false });
  const named = (...legalNames: string[]) => {
    const proposal = proposalFixture();
    const [option] = proposal.client.legalName.options;
    proposal.client.legalName.options = legalNames.map((value) => ({ ...option!, value }));
    return proposal;
  };
  const legalName = (proposal: Proposal, anaf: RegisteredCompany, changes = noChanges) =>
    fieldState(proposal, changes, 'client.legalName', undefined, anaf);

  it('offers ANAF’s name, picked from the start, when the documents write only the form otherwise', () => {
    const anaf = registered(anafName);
    for (const name of [
      'S.P.N. / STANCIUC',
      'SPN STANCIUC',
      'SOCIETATE PROFESIONALA NOTARIALA STANCIUC',
    ]) {
      const proposal = named(name);
      expect(anafMismatch(proposal, noChanges, anaf), name).toBe(anaf);
      const state = legalName(proposal, anaf);
      expect(state.value, name).toBe(anafName);
      expect(state.anaf, name).toMatchObject({ documents: name, picked: null, sameFirm: true });
    }
  });

  it('offers ANAF’s name against several spellings of its firm, then against the one picked', () => {
    const anaf = registered(anafName);
    const proposal = named('SPN STANCIUC', 'S.P.N. / STANCIUC');
    const state = legalName(proposal, anaf);
    expect(state).toMatchObject({ status: 'value', value: anafName });
    expect(state.anaf).toMatchObject({ documentsOption: 0, picked: null });

    const picked = legalName(proposal, anaf, {
      fields: { 'client.legalName': { option: 1 } },
      items: {},
    });
    expect(picked).toMatchObject({ value: 'S.P.N. / STANCIUC' });
    expect(picked.anaf).toMatchObject({ documentsOption: 1, picked: 'documents' });
  });

  it('keeps the documents’ diacritics on the words ANAF writes too', () => {
    const state = legalName(
      named('Societate Profesională Notarială Stănciuc'),
      registered(anafName)
    );
    expect(state.value).toBe('Societatea Profesională Notarială Stănciuc');
  });

  it('keeps the documents’ name when only the old S.C. prefix or the points differ', () => {
    const anaf = registered('BRUTARIA SPICUL AURIU SRL');
    const proposal = named('S.C. Brutăria Spicul Auriu S.R.L.');
    expect(legalName(proposal, anaf)).toMatchObject({
      value: 'S.C. Brutăria Spicul Auriu S.R.L.',
      anaf: null,
    });
    expect(anafMismatch(proposal, noChanges, anaf)).toBeNull();
  });

  it('offers ANAF’s name for another firm, which is not the same firm', () => {
    const anaf = registered('BIROU INDIVIDUAL NOTARIAL IONESCU ANA');
    const proposal = named('S.P.N. / STANCIUC');
    expect(anafMismatch(proposal, noChanges, anaf)).toBe(anaf);
    expect(legalName(proposal, anaf).anaf).toMatchObject({ sameFirm: false });
  });

  it('warns of another firm only for another company the member writes', () => {
    const anaf = registered(anafName);
    const wrote = (value: string) => ({ fields: { 'client.legalName': { value } }, items: {} });
    expect(anafMismatch(named('SPN STANCIUC'), wrote('SPN Stanciuc'), anaf)).toBeNull();
    expect(anafMismatch(named('SPN STANCIUC'), wrote('Alfa SRL'), anaf)).toBe(anaf);
  });
});
