import { proposedIncluded } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import {
  fireCountProposal,
  managementPostProposal,
  placesProposal,
  proposalFixture,
  substancesProposal,
  suggestedValuesProposal,
} from '@/test/import-fixture';

import {
  anafMismatch,
  askedCounts,
  assemblyPointDecision,
  assemblyPointStates,
  type Blocker,
  blockerLink,
  type Changes,
  chosenCountOption,
  countName,
  type ExistingWorkplace,
  fieldSpelling,
  fieldState,
  type Flag,
  flagNote,
  formatFieldValue,
  inactiveOffices,
  type ItemChange,
  itemName,
  itemSources,
  itemSpellings,
  itemStates,
  linkedWorkplace,
  meansTaken,
  nameSpellings,
  officeActivityStates,
  type Proposal,
  refusedValueMessage,
  type RegisteredCompany,
  type ReviewScope,
  sectionOf,
  sectionStatus,
  smokingPlaceAsked,
  smokingPlaceDecision,
  substancesAnswer,
  suggestedFields,
  suggestedValue,
  suggestionStates,
  unprovenRoles,
  valueInForce,
  vatPayerInForce,
} from './review-model';
import { spellingCorrection } from './review-types';

const noChanges: Changes = { fields: {}, items: {} };

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

describe('a training interval read from the documents', () => {
  it.each([
    [1, 'lunar'],
    [6, 'la 6 luni'],
    [24, 'la 24 de luni'],
  ])('reads %i months as Romanian counts them', (months, expected) => {
    expect(formatFieldValue('trainingSchedule.workerTrainingIntervalMonths', months)).toBe(
      expected
    );
  });
});

const changesOf = (fields: Changes['fields'] = {}, items: Changes['items'] = {}): Changes => ({
  fields,
  items,
});

type ItemValues = NonNullable<ItemChange['values']>;

const newClient: ReviewScope = { blockers: [], existingClient: false, existingWorkplaces: [] };

const intoClient = (
  existingWorkplaces: ExistingWorkplace[] = [],
  blockers: Blocker[] = []
): ReviewScope => ({ blockers, existingClient: true, existingWorkplaces });

describe('the section a path belongs to', () => {
  it.each([
    ['client.cui', 'identity'],
    ['trainingSchedule.workerTrainingIntervalMonths', 'training'],
    ['fireSafety.trainingDayFrom', 'training'],
    ['fireSafety.smokingPolicy', 'fire-safety'],
    ['fireEquipmentCounts.count-1', 'fire-safety'],
    ['assemblyPoints.workplace-1', 'workplaces'],
    ['officeActivity.workplace-1', 'workplaces'],
    ['employees.0.hiredAt', 'responsible'],
    ['protectiveEquipment.1.durationMonths', 'equipment'],
    ['somethingElse.x', 'identity'],
  ])('puts %s under %s', (path, section) => {
    expect(sectionOf(path)).toBe(section);
  });
});

describe('a value read from the documents, as the review shows it', () => {
  it.each([
    ['client.cui', 'RO31458207', '31458207'],
    ['client.countyCode', 'SB', 'Sibiu'],
    ['trainingSchedule.periodicTrainingMinutes', 60, '60 de minute'],
    ['fireSafety.periodicTrainingHours', 1, 'o oră'],
    ['fireSafety.periodicTrainingHours', 2, '2 ore'],
    ['trainingSchedule.trainingFirstMonth', 3, 'martie'],
    [
      'fireSafety.smokingPolicy',
      'forbidden_everywhere',
      'Fumatul este interzis în toate spațiile unității',
    ],
    ['fireSafety.substancesState', 'none', 'Nu se utilizează substanțe periculoase'],
    ['fireSafety.hasThirdParties', 'true', 'Da'],
    ['client.locality', '', ''],
  ])('shows %s %j as %j', (path, value, shown) => {
    expect(formatFieldValue(path, value)).toBe(shown);
  });

  it('names the CAEN class beside its code', () => {
    expect(formatFieldValue('client.caenCode', '1071')).toMatch(/^1071, Fabricarea pâinii/);
  });

  it('writes RO before the CUI of a VAT payer', () => {
    expect(formatFieldValue('client.cui', '31458207', true)).toBe('RO31458207');
  });
});

describe('a field of the proposal', () => {
  const proposal = () => proposalFixture();

  it('takes the only value the client’s documents give, with its passages', () => {
    const state = fieldState(proposal(), noChanges, 'client.locality');
    expect(state).toMatchObject({ status: 'value', value: 'Sibiu', option: 0, edited: false });
    expect(state.sources).toEqual([{ file: 'dosar-ssm.zip/Decizie 1.docx', quote: 'Sibiu' }]);
  });

  it('waits for a choice between the client’s own values, citing all of them', () => {
    const state = fieldState(proposal(), noChanges, 'client.legalRepresentativeName');
    expect(state).toMatchObject({ status: 'choice', value: null, option: null, own: [0, 1] });
    expect(state.sources.map((source) => source.quote)).toEqual(['Ioana Mureșan', 'Dorin Mureșan']);
  });

  it('is missing where the documents give nothing', () => {
    expect(fieldState(proposal(), noChanges, 'client.contactName')).toMatchObject({
      status: 'missing',
      value: null,
      sources: [],
    });
  });

  it('takes the option the member picked, and the value they wrote as theirs', () => {
    expect(
      fieldState(
        proposal(),
        changesOf({ 'client.legalRepresentativeName': { option: 1 } }),
        'client.legalRepresentativeName'
      )
    ).toMatchObject({ status: 'value', value: 'Dorin Mureșan', option: 1, edited: false });
    expect(
      fieldState(
        proposal(),
        changesOf({ 'client.locality': { value: 'Cisnădie' } }),
        'client.locality'
      )
    ).toMatchObject({ status: 'value', value: 'Cisnădie', option: null, edited: true });
    expect(
      fieldState(proposal(), changesOf({ 'client.locality': { value: null } }), 'client.locality')
    ).toMatchObject({ status: 'missing', value: null, edited: true });
  });

  it('leaves out the client’s own value once the member unticks it', () => {
    expect(
      fieldState(
        proposal(),
        changesOf({ 'client.locality': { included: false } }),
        'client.locality'
      )
    ).toMatchObject({ status: 'unticked', value: null, otherCompanyName: null });
  });

  describe('into an existing client', () => {
    const phone = (existing: string | null, changes = noChanges) =>
      fieldState(proposal(), changes, 'client.contactPhone', existing).comparison;

    it('adds a value the client lacks', () => {
      expect(phone(null)).toBe('added');
      expect(phone('  ')).toBe('added');
    });

    it('calls the same value written otherwise the same', () => {
      expect(fieldState(proposal(), noChanges, 'client.locality', 'SIBIU').comparison).toBe('same');
    });

    it('keeps the client’s value where the documents differ, until the member takes theirs', () => {
      expect(phone('0269 214 300')).toBe('kept');
      expect(phone('0269 214 300', changesOf({ 'client.contactPhone': { replace: true } }))).toBe(
        'replaced'
      );
    });

    it('is the same where the documents give nothing', () => {
      expect(fieldState(proposal(), noChanges, 'client.contactName', 'Ana').comparison).toBe(
        'same'
      );
    });
  });
});

describe('the value a field leaves the client with', () => {
  const proposal = () => proposalFixture();

  it('is the documents’ value, the client’s where kept, and nothing yet while a choice waits', () => {
    expect(valueInForce(fieldState(proposal(), noChanges, 'client.locality'))).toBe('Sibiu');
    expect(
      valueInForce(fieldState(proposal(), noChanges, 'client.contactPhone', '0269 214 300'))
    ).toBe('0269 214 300');
    expect(
      valueInForce(fieldState(proposal(), noChanges, 'client.legalRepresentativeName'))
    ).toBeUndefined();
    expect(valueInForce(undefined)).toBeUndefined();
  });

  it('keeps an existing client’s substances answer while the documents disagree', () => {
    const disagreeing = substancesProposal(['none', 'listed']);
    const path = 'fireSafety.substancesState';
    expect(substancesAnswer(fieldState(disagreeing, noChanges, path, 'listed'))).toBe('listed');
    expect(substancesAnswer(fieldState(disagreeing, noChanges, path))).toBeUndefined();
  });
});

describe('the VAT registration confirming writes', () => {
  const anaf = { cui: '31458207', vatPayer: true };

  it('follows ANAF for the CUI the review holds, unless the member said otherwise', () => {
    expect(vatPayerInForce(proposalFixture(), noChanges, anaf)).toBe(true);
    expect(vatPayerInForce(proposalFixture(), noChanges, { ...anaf, cui: '1590082' })).toBe(false);
    expect(vatPayerInForce(proposalFixture(), noChanges, null)).toBe(false);
    expect(
      vatPayerInForce(proposalFixture(), changesOf({ 'client.vatPayer': { value: 'false' } }), anaf)
    ).toBe(false);
  });
});

describe('the smoking place', () => {
  const path = 'fireSafety.smokingPlace';
  const statesOf = (changes: Changes, existing?: string | null) => {
    const proposal = placesProposal();
    return {
      'fireSafety.smokingPolicy': fieldState(proposal, changes, 'fireSafety.smokingPolicy'),
      [path]: fieldState(proposal, changes, path, existing),
    };
  };

  it('is asked of a new client beside designated places', () => {
    expect(smokingPlaceAsked(statesOf(noChanges))).toBe(true);
  });

  it('is not asked while smoking is forbidden everywhere', () => {
    expect(
      smokingPlaceAsked(
        statesOf(changesOf({ 'fireSafety.smokingPolicy': { value: 'forbidden_everywhere' } }))
      )
    ).toBe(false);
  });

  it('is not asked once unticked before it was asked', () => {
    expect(smokingPlaceAsked(statesOf(changesOf({ [path]: { included: false } })))).toBe(false);
  });

  it('is asked of an existing client only where the documents add a place', () => {
    expect(smokingPlaceAsked(statesOf(noChanges, 'La poarta unității'))).toBe(false);
    expect(smokingPlaceAsked(statesOf(noChanges, 'În curte'))).toBe(false);
    expect(smokingPlaceAsked(statesOf(noChanges, null))).toBe(true);
  });

  it('waits until kept, written otherwise or left empty', () => {
    const decide = (change: Changes['fields'][string] | undefined) =>
      smokingPlaceDecision(fieldState(placesProposal(), noChanges, path), change);
    expect(decide(undefined)).toBeNull();
    expect(decide({ option: 0 })).toEqual({ kind: 'keep', option: 0 });
    expect(decide({ included: true })).toEqual({ kind: 'keep', option: 0 });
    expect(decide({ value: 'În curtea din spate' })).toEqual({
      kind: 'other',
      value: 'În curtea din spate',
    });
    expect(decide({ value: null })).toEqual({ kind: 'empty' });
  });

  it('still waits on the document’s spelling selected before deciding, then keeps it', () => {
    const state = fieldState(placesProposal(), noChanges, path);
    expect(smokingPlaceDecision(state, { value: 'LA POARTA UNITATII' })).toBeNull();
    expect(smokingPlaceDecision(state, { option: 0, value: 'LA POARTA UNITATII' })).toEqual({
      kind: 'keep',
      option: 0,
    });
  });
});

describe('a workplace’s assembly point', () => {
  const point = 'assemblyPoints.workplace-1';
  const ids = (proposal: Proposal, changes: Changes, scope: ReviewScope) =>
    assemblyPointStates(proposal, changes, scope).map((state) => state.item.id);

  it('waits until kept, written otherwise or left empty, its document spelling still kept', () => {
    const decide = (changes: Changes) =>
      assemblyPointDecision(placesProposal().workplaces[0]!, changes);
    expect(decide(noChanges)).toBeNull();
    expect(decide(changesOf({ [point]: { option: 0 } }))).toEqual({ kind: 'keep', option: 0 });
    expect(
      decide(
        changesOf(
          { [point]: { option: 0 } },
          { 'workplace-1': { values: { assemblyPoint: 'PARCAREA DIN FATA CLADIRII' } } }
        )
      )
    ).toEqual({ kind: 'keep', option: 0 });
    expect(
      decide(changesOf({}, { 'workplace-1': { values: { assemblyPoint: 'Curtea' } } }))
    ).toEqual({ kind: 'other', value: 'Curtea' });
    expect(decide(changesOf({}, { 'workplace-1': { values: { assemblyPoint: null } } }))).toEqual({
      kind: 'empty',
    });
  });

  it('is asked of a new client’s workplace kept', () => {
    expect(ids(placesProposal(), noChanges, newClient)).toEqual(['workplace-1']);
  });

  it('asks nothing of a workplace left out', () => {
    expect(
      ids(placesProposal(), changesOf({}, { 'workplace-1': { included: false } }), newClient)
    ).toEqual([]);
  });

  it('into an existing client, asks only where the import writes it or the member decided', () => {
    expect(ids(placesProposal(), noChanges, intoClient())).toEqual([]);
    expect(
      ids(placesProposal(), noChanges, intoClient([], [{ path: point, code: 'choice' }]))
    ).toEqual(['workplace-1']);
    expect(ids(placesProposal(), changesOf({ [point]: { option: 0 } }), intoClient())).toEqual([
      'workplace-1',
    ]);
  });
});

describe('the values suggested from a workplace’s activity', () => {
  const office = 'officeActivity.workplace-1';
  const card = 'suggestedValues.workplace-2';
  const ids = (states: { item: { id: string } }[]) => states.map((state) => state.item.id);

  it('asks a new client for the office’s activity and the workshop’s suggestions', () => {
    const proposal = suggestedValuesProposal();
    expect(ids(officeActivityStates(proposal, noChanges, newClient))).toEqual(['workplace-1']);
    expect(ids(suggestionStates(proposal, noChanges, newClient))).toEqual(['workplace-2']);
    expect(suggestedFields(itemStates(proposal, noChanges, 'workplaces')[1]!, noChanges)).toEqual([
      'combustibleMaterials',
      'ignitionSources',
      'extinguisherNorm',
    ]);
  });

  it('asks nothing of a workplace left out, nor of an office with no other point of work', () => {
    const changes = changesOf({}, { 'workplace-2': { included: false } });
    expect(suggestionStates(suggestedValuesProposal(), changes, newClient)).toEqual([]);
    expect(officeActivityStates(suggestedValuesProposal(), changes, newClient)).toEqual([]);
  });

  it('into an existing client, asks only where the import writes a value or the member decided', () => {
    const proposal = suggestedValuesProposal();
    expect(suggestionStates(proposal, noChanges, intoClient())).toEqual([]);
    expect(officeActivityStates(proposal, noChanges, intoClient())).toEqual([]);
    const blocked = intoClient(
      [],
      [
        { path: office, code: 'choice' },
        { path: card, code: 'choice' },
      ]
    );
    expect(ids(officeActivityStates(proposal, noChanges, blocked))).toEqual(['workplace-1']);
    expect(ids(suggestionStates(proposal, noChanges, blocked))).toEqual(['workplace-2']);
    expect(
      ids(suggestionStates(proposal, changesOf({ [card]: { option: 0 } }), intoClient()))
    ).toEqual(['workplace-2']);
  });

  it('drops the norm suggested for a workplace the member made a mobile site', () => {
    const mobile = changesOf({}, { 'workplace-2': { values: { kind: 'mobile_site' } } });
    const state = itemStates(suggestedValuesProposal(), mobile, 'workplaces')[1]!;
    expect(suggestedFields(state, mobile)).toEqual(['combustibleMaterials', 'ignitionSources']);
  });

  it('keeps a suggestion, or takes what the member wrote or left empty', () => {
    const workshop = { id: 'workplace-2' };
    const written = changesOf(
      {},
      { 'workplace-2': { values: { combustibleMaterials: 'Carton', ignitionSources: ' ' } } }
    );
    expect(suggestedValue(workshop, written, 'extinguisherNorm')).toEqual({ kind: 'keep' });
    expect(suggestedValue(workshop, written, 'combustibleMaterials')).toEqual({
      kind: 'other',
      value: 'Carton',
    });
    expect(suggestedValue(workshop, written, 'ignitionSources')).toEqual({ kind: 'empty' });
  });

  it('takes nothing from an office the member agreed has no activity', () => {
    const proposal = suggestedValuesProposal();
    proposal.workplaces[0]!.assemblyPoint = 'Curtea interioară';
    const kept = changesOf({ [office]: { option: 0 } });
    const inactive = inactiveOffices(proposal, kept, newClient);
    expect([...inactive]).toEqual(['workplace-1']);
    expect(assemblyPointStates(proposal, kept, newClient)).toEqual([]);
    expect(assemblyPointStates(proposal, noChanges, newClient)).toHaveLength(1);
    expect(ids(meansTaken(proposal, kept, 'fireEquipment', inactive))).toEqual([]);
    expect(ids(meansTaken(proposal, noChanges, 'fireEquipment', new Set()))).toEqual([
      'extinguisher-1',
    ]);
  });
});

describe('the client’s own workplace a proposed one is written into', () => {
  const sediu = (values: Record<string, unknown>) =>
    ({ item: { id: 'workplace-1' }, values }) as unknown as Parameters<typeof linkedWorkplace>[0];
  const own: ExistingWorkplace = {
    id: 'existing-office',
    name: 'SEDIUL',
    addressLine: 'Str. Morilor nr. 14',
    isRegisteredOffice: true,
    officeHasActivity: true,
  };

  it('is none for a new client', () => {
    expect(linkedWorkplace(sediu({ name: 'Sediul' }), noChanges, newClient)).toBeNull();
  });

  it('is found by its name or by its address', () => {
    expect(linkedWorkplace(sediu({ name: 'sediul' }), noChanges, intoClient([own]))).toBe(own);
    expect(
      linkedWorkplace(
        sediu({ name: 'Punct central', addressLine: 'STR. MORILOR NR. 14' }),
        noChanges,
        intoClient([own])
      )
    ).toBe(own);
    expect(
      linkedWorkplace(sediu({ name: 'Depozit', addressLine: null }), noChanges, intoClient([own]))
    ).toBeNull();
  });

  it('is the one the member picked, or none when they picked a new one', () => {
    const picked = (existingId: string | null) => changesOf({}, { 'workplace-1': { existingId } });
    const other = { ...own, id: 'other', name: 'Depozit', addressLine: null };
    expect(
      linkedWorkplace(sediu({ name: 'Sediul' }), picked('other'), intoClient([own, other]))
    ).toBe(other);
    expect(linkedWorkplace(sediu({ name: 'Sediul' }), picked(null), intoClient([own]))).toBeNull();
  });
});

describe('means two files count differently', () => {
  const countPath = 'fireEquipmentCounts.count-1';
  const count = (proposal: Proposal) => proposal.fireEquipmentCounts![0]!;
  const listed = (proposal: Proposal, changes: Changes) =>
    itemStates(proposal, changes, 'fireEquipment').map((state) => state.item.id);

  it('takes only the chosen option’s entries, and none while the choice waits', () => {
    const proposal = fireCountProposal();
    expect(chosenCountOption(count(proposal), noChanges)).toBeNull();
    expect(
      chosenCountOption(count(proposal), changesOf({ [countPath]: { option: 5 } }))
    ).toBeNull();
    expect(chosenCountOption(count(proposal), changesOf({ [countPath]: { option: 1 } }))).toBe(1);
    expect(listed(proposal, noChanges)).toEqual(['blanket-1']);
    expect(listed(proposal, changesOf({ [countPath]: { option: 1 } }))).toEqual([
      'extinguisher-2',
      'blanket-1',
    ]);
  });

  it('asks no count of a workplace left out, and takes none of its counted means', () => {
    const leftOut = changesOf(
      { [countPath]: { option: 0 } },
      { 'workplace-1': { included: false } }
    );
    expect(askedCounts(fireCountProposal(), leftOut, new Set())).toEqual([]);
    expect(listed(fireCountProposal(), leftOut)).toEqual(['blanket-1']);
  });

  it('asks a count with no workplace whatever is left out', () => {
    const proposal = fireCountProposal();
    count(proposal).workplace = { name: null, id: null };
    const leftOut = changesOf({}, { 'workplace-1': { included: false } });
    expect(askedCounts(proposal, leftOut, new Set(['workplace-1']))).toHaveLength(1);
  });

  it('names the means counted', () => {
    expect(countName(count(fireCountProposal()))).toBe('Stingător P6');
    expect(countName({ ...count(fireCountProposal()), capacity: null, wheeled: true })).toBe(
      'Stingător Pulbere, carosabil'
    );
  });
});

describe('the items of a list', () => {
  it('says why one is proposed unticked', () => {
    const proposal = managementPostProposal();
    proposal.employees.push({
      ...proposal.employees[0]!,
      id: 'employee-2',
      role: 'legal_representative',
    });
    const reasons = (list: 'jobPositions' | 'protectiveEquipment' | 'employees') =>
      itemStates(proposal, noChanges, list).map((state) => [state.item.id, state.untickedReason]);
    expect(reasons('jobPositions')).toEqual([
      ['position-1', null],
      ['position-2', 'other_company'],
      ['position-3', 'management_only'],
    ]);
    expect(reasons('protectiveEquipment')).toEqual([
      ['equipment-entry-1', null],
      ['equipment-entry-2', 'position_left_out'],
    ]);
    expect(reasons('employees')).toEqual([
      ['employee-1', null],
      ['employee-2', 'legal_representative'],
    ]);
  });

  it('takes an equipment entry moved off a post left out', () => {
    const moved = changesOf({}, { 'equipment-entry-2': { values: { jobPosition: 'position-1' } } });
    expect(
      itemStates(managementPostProposal(), moved, 'protectiveEquipment').map(
        (state) => state.included
      )
    ).toEqual([true, true]);
  });

  it('counts as edited only what differs from the document’s own spelling', () => {
    const proposal = proposalFixture();
    Object.assign(proposal.jobPositions[0]!, {
      name: 'Îngrijitor hotel',
      spelling: { name: 'INGRIJITOR HOTEL' },
    });
    const edited = (values: ItemValues) =>
      itemStates(proposal, changesOf({}, { 'position-1': { values } }), 'jobPositions')[0]!.edited;
    expect(edited({ name: 'INGRIJITOR HOTEL' })).toBe(false);
    expect(edited({ name: 'Recepționer' })).toBe(true);
  });

  it.each([
    ['employees', { lastName: 'Lazăr', firstName: 'Radu' }, 'Lazăr Radu'],
    ['employees', { lastName: ' ', firstName: null }, 'Lucrător fără nume'],
    ['fireEquipment', { kind: 'extinguisher', agent: 'powder' }, 'Stingător, Pulbere'],
    ['fireEquipment', { kind: 'fire_blanket', agent: null }, 'Pătură antifoc'],
    ['responsiblePersons', { fullName: 'Radu Lazăr' }, 'Radu Lazăr'],
    ['protectiveEquipment', { item: 'Mănuși' }, 'Mănuși'],
  ] as const)('names a %s item %j as %s', (list, values, name) => {
    expect(itemName(list, values)).toBe(name);
  });
});

describe('a person’s name the files spell differently', () => {
  const spelled = () => {
    const proposal = proposalFixture();
    proposal.flags = [
      {
        path: 'responsiblePersons.0.fullName',
        code: 'name_spelled_differently',
        detail: 'Radu Lozăr',
        source: { file: 'dosar-ssm.zip/IPSSM.docx', quote: 'Radu Lozăr, prim ajutor' },
      },
    ] as Flag[];
    return proposal;
  };
  const spellings = (changes: Changes) => {
    const proposal = spelled();
    return nameSpellings(proposal, itemStates(proposal, changes, 'responsiblePersons')[0]!);
  };

  it('offers both, the one read first, while the member keeps one of them', () => {
    expect(spellings(noChanges).map((spelling) => spelling.value)).toEqual([
      'Radu Lazăr',
      'Radu Lozăr',
    ]);
    const picked = changesOf({}, { 'person-1': { values: { fullName: 'Radu Lozăr' } } });
    expect(spellings(picked)).toHaveLength(2);
    expect(itemStates(spelled(), picked, 'responsiblePersons')[0]!.edited).toBe(false);
  });

  it('offers none once the member wrote another', () => {
    expect(
      spellings(changesOf({}, { 'person-1': { values: { fullName: 'Radu Lazar' } } }))
    ).toEqual([]);
  });
});

describe('a value read with its spelling corrected', () => {
  const path = 'fireSafety.smokingPlace';

  it.each([
    ['Îngrijitor hotel', 'INGRIJITOR HOTEL', 'majuscule și diacritice'],
    ['Laborator', 'LABORATOR', 'majuscule'],
    ['În curte', 'In curte', 'diacritice'],
  ])('says %s corrects %s in its %s', (value, written, correction) => {
    expect(spellingCorrection(value, written)).toBe(correction);
  });

  it('offers the document’s spelling of a field, kept once the member picks it', () => {
    const proposal = placesProposal();
    expect(fieldSpelling(fieldState(proposal, noChanges, path), undefined)).toEqual({
      corrected: 'La poarta unității',
      written: 'LA POARTA UNITATII',
      keptWritten: false,
    });
    const kept = { option: 0, value: 'LA POARTA UNITATII' };
    expect(fieldSpelling(fieldState(proposal, changesOf({ [path]: kept }), path), kept)).toEqual({
      corrected: 'La poarta unității',
      written: 'LA POARTA UNITATII',
      keptWritten: true,
    });
    const other = { value: 'În curte' };
    expect(
      fieldSpelling(fieldState(proposal, changesOf({ [path]: other }), path), other)
    ).toBeNull();
  });

  it('offers nothing of an existing client’s value kept as it is', () => {
    expect(
      fieldSpelling(fieldState(placesProposal(), noChanges, path, 'Curte'), undefined)
    ).toBeNull();
  });

  it('lists an item’s spellings until the member writes another value', () => {
    const spellings = (values: ItemValues) => {
      const changes = changesOf({}, { 'workplace-1': { values } });
      return itemSpellings(itemStates(placesProposal(), changes, 'workplaces')[0]!, changes);
    };
    expect(spellings({})).toEqual([
      {
        field: 'assemblyPoint',
        value: 'Parcarea din fața clădirii',
        written: 'PARCAREA DIN FATA CLADIRII',
        keptWritten: false,
      },
    ]);
    expect(spellings({ assemblyPoint: 'PARCAREA DIN FATA CLADIRII' })[0]!.keptWritten).toBe(true);
    expect(spellings({ assemblyPoint: 'Curtea' })).toEqual([]);
  });
});

describe('the link to what blocks confirming', () => {
  const link = (proposal: Proposal, path: string, code: Blocker['code'], changes = noChanges) =>
    blockerLink(proposal, changes, { path, code });

  it('asks for a field’s choice or value in the words of its form', () => {
    const proposal = proposalFixture();
    expect(link(proposal, 'client.legalRepresentativeName', 'choice')).toEqual({
      text: 'Alege reprezentantul legal',
      section: 'identity',
      anchor: 'review-client-legalRepresentativeName',
      code: 'choice',
    });
    expect(link(proposal, 'client.cui', 'missing').text).toBe('Scrie CUI-ul');
    expect(link(proposal, 'client.contactEmail', 'invalid').text).toBe('Corectează email');
    expect(link(proposal, 'trainingSchedule.periodicTrainingMinutes', 'invalid').text).toBe(
      'Alege durata instruirii periodice'
    );
  });

  it('asks to confirm a training interval no document gives', () => {
    const proposal = proposalFixture();
    proposal.trainingSchedule.administrativeTrainingIntervalMonths = { options: [] };
    expect(
      link(proposal, 'trainingSchedule.administrativeTrainingIntervalMonths', 'choice')
    ).toEqual({
      text: 'Confirmă periodicitatea pentru tehnico-administrativ',
      section: 'training',
      anchor: 'review-trainingSchedule-administrativeTrainingIntervalMonths',
      code: 'choice',
    });
    expect(link(proposal, 'fireSafety.workerTrainingIntervalMonths', 'choice')).toEqual({
      text: 'Confirmă periodicitatea SU pentru execuție',
      section: 'training',
      anchor: 'review-fireSafety-workerTrainingIntervalMonths',
      code: 'choice',
    });
  });

  it('asks to write a refused day again rather than to pick one', () => {
    const proposal = proposalFixture();
    proposal.trainingSchedule.trainingDayFrom = {
      options: [{ value: 35, sources: [], otherCompanyName: null }],
    };
    expect(link(proposal, 'trainingSchedule.trainingDayFrom', 'invalid').text).toBe(
      'Scrie ziua de început a instruirii'
    );
  });

  it('asks inventory for a duration and a consumable for none', () => {
    const proposal = proposalFixture();
    const entry = (
      id: string,
      item: string,
      durationMonths: number | null,
      allocation: string
    ) => ({
      id,
      sources: [],
      otherCompanyName: null,
      jobPosition: { name: 'Brutar', id: 'position-1' },
      risk: 'Substanțe de curățat',
      item,
      quantity: 1,
      durationMonths,
      allocation,
    });
    (proposal as { protectiveEquipment: unknown[] }).protectiveEquipment = [
      entry('equipment-entry-1', 'Mănuși', null, 'personal_inventory'),
      entry('equipment-entry-2', 'Mască', 3, 'consumable'),
      entry('equipment-entry-3', 'Bocanci', 200, 'personal_inventory'),
    ];
    expect(link(proposal, 'protectiveEquipment.0.durationMonths', 'missing')).toEqual({
      text: 'Scrie durata de utilizare pentru Mănuși sau alege alocarea Consum',
      section: 'equipment',
      anchor: 'review-protectiveEquipment-equipment-entry-1',
      code: 'missing',
    });
    expect(link(proposal, 'protectiveEquipment.1.durationMonths', 'invalid').text).toBe(
      'Șterge durata de utilizare pentru Mască sau alege altă alocare'
    );
    expect(link(proposal, 'protectiveEquipment.2.durationMonths', 'invalid').text).toMatch(
      /^Scrie o durată de utilizare între 1 și \d+ de luni pentru Bocanci$/
    );
  });

  it('asks to keep one of two registered offices', () => {
    expect(link(proposalFixture(), 'workplaces.1.isRegisteredOffice', 'invalid').text).toBe(
      'Două sedii sociale: păstrează unul'
    );
  });

  it('names an item by what the member made of it', () => {
    const proposal = proposalFixture();
    expect(link(proposal, 'employees.0.hiredAt', 'missing')).toEqual({
      text: 'Scrie data angajării lui Lazăr Radu, reprezentantul lucrătorilor',
      section: 'responsible',
      anchor: 'review-employees-employee-1',
      code: 'missing',
    });
    expect(
      link(
        proposal,
        'jobPositions.0.staffCategory',
        'missing',
        changesOf({}, { 'position-1': { values: { name: 'Patiser' } } })
      ).text
    ).toBe('Scrie categoria de personal pentru Patiser');
    expect(link(proposal, 'jobPositions.0.staffCategory', 'invalid').text).toBe(
      'Corectează categoria de personal pentru Brutar'
    );
    expect(
      link(managementPostProposal(), 'protectiveEquipment.0.jobPosition', 'unknown_reference').text
    ).toBe('Alege postul pentru Mănuși termorezistente');
  });

  it('asks to confirm the smoking place, the assembly point and a workplace’s suggestions', () => {
    const places = placesProposal();
    expect(link(places, 'fireSafety.smokingPlace', 'choice')).toEqual({
      text: 'Confirmă locul pentru fumat',
      section: 'fire-safety',
      anchor: 'review-fireSafety-smokingPlace',
      code: 'choice',
    });
    expect(link(places, 'assemblyPoints.workplace-1', 'choice')).toEqual({
      text: 'Confirmă punctul de adunare: Sediu',
      section: 'workplaces',
      anchor: 'review-assemblyPoints-workplace-1',
      code: 'choice',
    });
    const suggested = suggestedValuesProposal();
    expect(link(suggested, 'officeActivity.workplace-1', 'choice')).toEqual({
      text: 'Alege dacă la sediul social se desfășoară activitate',
      section: 'workplaces',
      anchor: 'review-officeActivity-workplace-1',
      code: 'choice',
    });
    expect(link(suggested, 'suggestedValues.workplace-2', 'choice')).toEqual({
      text: 'Confirmă sugestiile din activitate: Atelier',
      section: 'workplaces',
      anchor: 'review-suggestedValues-workplace-2',
      code: 'choice',
    });
  });

  it('asks about the dangerous substances', () => {
    expect(
      link(substancesProposal(['none', 'listed']), 'fireSafety.substancesState', 'choice')
    ).toEqual({
      text: 'Alege dacă clientul utilizează substanțe periculoase',
      section: 'fire-safety',
      anchor: 'review-fireSafety-substancesState',
      code: 'choice',
    });
    expect(link(proposalFixture(), 'fireSafety.substancesState', 'invalid').text).toBe(
      'Păstrează substanțele periculoase din aplicație'
    );
  });

  it('asks for the number of means by where the documents put them', () => {
    const counted = (workplace: { name: string | null; id: string | null }) => {
      const proposal = fireCountProposal();
      proposal.fireEquipmentCounts![0]!.workplace = workplace;
      return link(proposal, 'fireEquipmentCounts.count-1', 'choice');
    };
    expect(counted({ name: 'Sediu', id: 'workplace-1' })).toEqual({
      text: 'Alege numărul de bucăți: Stingător P6, Sediu',
      section: 'fire-safety',
      anchor: 'review-fireEquipmentCounts-count-1',
      code: 'choice',
    });
    expect(counted({ name: null, id: null }).text).toBe(
      'Alege numărul de bucăți: Stingător P6, fără loc de muncă'
    );
    expect(counted({ name: 'Hală Nord', id: null }).text).toBe(
      'Alege numărul de bucăți: Stingător P6, „Hală Nord”, care nu e printre locurile de muncă'
    );
  });
});

describe('the status of a section', () => {
  const status = (
    section: Parameters<typeof sectionStatus>[0],
    {
      proposal = proposalFixture(),
      blockers = [],
      kept = [],
      registered,
    }: {
      proposal?: Proposal;
      blockers?: Blocker[];
      kept?: string[];
      registered?: RegisteredCompany | null;
    } = {}
  ) => sectionStatus(section, proposal, noChanges, blockers, kept, registered);

  it('puts a choice before what is missing, and what is missing before what is wrong', () => {
    const blockers: Blocker[] = [
      { path: 'protectiveEquipment.0.durationMonths', code: 'invalid' },
      { path: 'protectiveEquipment.1.durationMonths', code: 'invalid' },
      { path: 'protectiveEquipment.2.jobPosition', code: 'unknown_reference' },
    ];
    expect(status('equipment', { blockers })).toEqual({ kind: 'missing', count: 1 });
    expect(status('equipment', { blockers: blockers.slice(0, 2) })).toEqual({
      kind: 'invalid',
      count: 2,
    });
    expect(
      status('equipment', {
        blockers: [...blockers, { path: 'protectiveEquipment.0.allocation', code: 'choice' }],
      })
    ).toEqual({ kind: 'choice' });
  });

  it('is done when nothing blocks it and nothing is worth a look', () => {
    expect(status('workplaces')).toEqual({ kind: 'done' });
  });

  it('asks for a look at items or values from another company', () => {
    expect(status('job-positions')).toEqual({ kind: 'check' });
    expect(status('identity')).toEqual({ kind: 'check' });
  });

  it('asks for a look at what a check found, a value kept, or a CUI ANAF gives another firm', () => {
    const flagged = proposalFixture();
    flagged.flags = [{ path: 'workplaces.0.sources.0', code: 'quote_not_found' }] as Flag[];
    expect(status('workplaces', { proposal: flagged })).toEqual({ kind: 'check' });
    expect(status('training')).toEqual({ kind: 'done' });
    expect(status('training', { kept: ['trainingSchedule.workerTrainingIntervalMonths'] })).toEqual(
      { kind: 'check' }
    );
    const own = proposalFixture();
    own.client.contactEmail = { options: [] };
    expect(status('identity', { proposal: own })).toEqual({ kind: 'done' });
    expect(
      status('identity', {
        proposal: own,
        registered: { cui: '31458207', legalName: 'BARS COMPANY S.R.L.', inactive: false },
      })
    ).toEqual({ kind: 'check' });
  });
});

describe('what a check found, in the specialist’s words', () => {
  const note = (
    flag: Pick<Flag, 'path' | 'code'> & Partial<Flag>,
    proposal = proposalFixture(),
    changes = noChanges
  ) => flagNote(flag as Flag, proposal, changes);

  it('names the passage that was not found, and never a path', () => {
    expect(
      note({
        path: 'client.legalName.options.0.sources.0',
        code: 'file_not_found',
        detail: 'dosar-ssm.zip/Contract prestari SSM 2019.pdf (pagina 1) (image follows)',
      })
    ).toBe('Fișierul citat nu este printre cele încărcate. Verifică valoarea în documente.');
    expect(note({ path: 'client.caenCode.options.0.sources.0', code: 'quote_not_found' })).toBe(
      'Pasajul citat nu a fost găsit în fișier.'
    );
    expect(
      note({ path: 'responsiblePersons.0.roles.first_aid.sources.0', code: 'quote_not_found' })
    ).toBe('Pasajul citat pentru rolul «Prim ajutor» nu a fost găsit în fișier.');
    expect(
      note({
        path: 'workplaces.1.suggested.combustibleMaterials.sources.1',
        code: 'quote_not_found',
      })
    ).toBe('Pasajul citat pentru materialele combustibile nu a fost găsit în fișier.');
    expect(note({ path: 'jobPositions.0.activities', code: 'value_not_in_quote' })).toBe(
      'Pasajul citat pentru activitățile desfășurate nu cuprinde această valoare. Verifică valoarea în documente.'
    );
  });

  it('names the item a duplicate repeats, by what the member made of it', () => {
    const proposal = proposalFixture();
    proposal.workplaces.push({ ...proposal.workplaces[0]!, id: 'workplace-2' });
    const flag = { path: 'workplaces.1', code: 'duplicate', detail: 'workplaces.0' } as const;
    expect(note(flag, proposal)).toBe('Pare să fie același punct de lucru ca «Sediu».');
    expect(
      note(
        flag,
        proposal,
        changesOf({}, { 'workplace-1': { values: { name: 'Sediul și laboratorul' } } })
      )
    ).toBe('Pare să fie același punct de lucru ca «Sediul și laboratorul».');
    expect(note({ path: 'fireEquipment.1', code: 'duplicate', detail: 'fireEquipment.0' })).toBe(
      'Pare să apară de două ori în propunere.'
    );
  });

  it('says why a value is not allowed', () => {
    expect(
      note({
        path: 'protectiveEquipment.1.durationMonths',
        code: 'value_not_allowed',
        detail: 'consumable',
      })
    ).toBe('Un articol de consum nu are durată de utilizare.');
    expect(note({ path: 'client.caenCode', code: 'value_not_allowed' })).toBe(
      'Codul CAEN are patru cifre.'
    );
    expect(note({ path: 'trainingSchedule.trainingDayTo', code: 'value_not_allowed' })).toBe(
      'Valoarea iese din limitele permise.'
    );
    expect(note({ path: 'jobPositions.0.staffCategory', code: 'value_not_allowed' })).toBe(
      'Valoarea nu e una dintre cele permise.'
    );
  });

  it('says what the identity checks found', () => {
    expect(note({ path: 'client.cui.options.0', code: 'invalid_cui' })).toBe(
      'Numărul nu trece verificarea CUI.'
    );
    expect(note({ path: 'client.cui', code: 'cui_not_registered' })).toBe(
      'ANAF nu cunoaște acest CUI.'
    );
    expect(
      note({ path: 'employees.0.cnp', code: 'cnp_birth_date_mismatch', detail: '1990-04-12' })
    ).toBe('CNP-ul arată altă dată a nașterii: 12.04.1990.');
    expect(note({ path: 'client.legalName', code: 'legal_name_differs', detail: 'BARS SRL' })).toBe(
      'La ANAF, CUI-ul 31458207 aparține firmei BARS SRL, nu firmei din documente.'
    );
  });

  it('names the reference no item matches', () => {
    expect(
      note({
        path: 'protectiveEquipment.0.jobPosition',
        code: 'unknown_reference',
        detail: 'Patiser',
      })
    ).toBe('Postul «Patiser» nu se potrivește cu niciunul din propunere.');
    expect(note({ path: 'responsiblePersons.0.workplace', code: 'unknown_reference' })).toBe(
      'Alege punctul de lucru.'
    );
  });

  it('quotes both spellings of a name, and the file of the other', () => {
    expect(
      note({
        path: 'responsiblePersons.0.fullName',
        code: 'name_spelled_differently',
        detail: 'Radu Lozăr',
        source: { file: 'dosar-ssm.zip/IPSSM.docx', quote: 'Radu Lozăr' },
      })
    ).toBe(
      'Documentele scriu numele în două feluri: „Radu Lazăr” și „Radu Lozăr” (în IPSSM.docx). Verifică-l.'
    );
    expect(
      note({
        path: 'client.legalRepresentativeName.options.1',
        code: 'name_spelled_differently',
        detail: 'Dorin Muresan',
      })
    ).toBe(
      'Documentele scriu numele în două feluri: „Dorin Mureșan” și „Dorin Muresan”. Verifică-l.'
    );
  });
});

describe('a value the app refuses on confirm', () => {
  it('names the section and the rule', () => {
    expect(
      refusedValueMessage({
        path: 'workplaces',
        message: 'client_workplaces_registered_office_key',
      })
    ).toBe(
      'Nu am putut salva o valoare din secțiunea «Puncte de lucru»: un client are un singur sediu social. Verifică secțiunea și încearcă din nou.'
    );
    expect(refusedValueMessage({ path: 'jobPositions.2', message: 'something_else' })).toBe(
      'Nu am putut salva o valoare din secțiunea «Posturi de lucru». Verifică secțiunea și încearcă din nou.'
    );
  });

  it('asks for a plain retry where it cannot tell the section', () => {
    const plain = 'Nu am putut salva o valoare din import. Verifică datele și încearcă din nou.';
    expect(refusedValueMessage(undefined)).toBe(plain);
    expect(refusedValueMessage({ path: 'nowhere', message: 'x' })).toBe(plain);
  });
});

describe('the passages of an item', () => {
  const person = () => {
    const proposal = proposalFixture();
    Object.assign(proposal.responsiblePersons[0]!, {
      roleSources: {
        workers_representative: [{ file: 'dosar-ssm.zip/Decizie 1.docx', quote: 'Radu Lazăr' }],
        first_aid: [{ file: 'dosar-ssm.zip/Decizie 3.docx', quote: 'primul ajutor' }],
      },
    });
    proposal.flags = [
      { path: 'responsiblePersons.0.roles.first_aid.sources.0', code: 'quote_not_found' },
    ] as Flag[];
    return proposal;
  };

  it('marks a role none of whose passages was found', () => {
    const proposal = person();
    const state = itemStates(proposal, noChanges, 'responsiblePersons')[0]!;
    expect([...unprovenRoles(proposal, state)]).toEqual(['first_aid']);
  });

  it('shows a passage once, naming every role it proves', () => {
    const state = itemStates(person(), noChanges, 'responsiblePersons')[0]!;
    expect(itemSources(state)).toEqual([
      {
        file: 'dosar-ssm.zip/Decizie 1.docx',
        quote: 'Radu Lazăr',
        label: 'Reprezentantul lucrătorilor',
      },
      { file: 'dosar-ssm.zip/Decizie 3.docx', quote: 'primul ajutor', label: 'Prim ajutor' },
    ]);
  });

  it('names the post an equipment entry’s passages are near', () => {
    const state = itemStates(managementPostProposal(), noChanges, 'protectiveEquipment')[0]!;
    expect(itemSources(state)).toEqual([
      {
        file: 'dosar-ssm.zip/Evaluare riscuri.docx',
        quote: 'Mănuși termorezistente',
        near: 'Brutar',
      },
    ]);
  });
});
