import type { ImportChanges } from '@ssm-usor/contracts';
import {
  type Proposal,
  proposalSchema,
  type Reading,
  toProposal,
  withChecks,
} from '@ssm-usor/import';
import { describe, expect, it } from 'vitest';

import { type ExistingRecords, noExistingRecords, resolveField, toClientPayload } from './payload';

const decision = 'Dosar/Decizia 1.docx';
const fire = 'Dosar/PSI/Lista mijloace.doc';
const quoted = (file = decision, otherCompany: string | null = null) => ({
  file,
  quote: 'citat',
  otherCompany,
});
const fact = (
  field: string,
  value: string,
  file = decision,
  otherCompany: string | null = null
) => ({
  field,
  value,
  ...quoted(file, otherCompany),
});

const role = (code: Reading['responsiblePersons'][number]['roles'][number]['role']) => ({
  role: code,
  file: decision,
  quote: 'citat',
});

function reading(overrides: Partial<Reading> = {}): Reading {
  return {
    facts: [
      fact('client.legalName', 'BRUTĂRIA FICTIVĂ S.R.L.'),
      fact('client.cui', '12345674'),
      fact('client.countyCode', 'TM'),
      fact('client.locality', 'Timișoara'),
      fact('client.legalRepresentativeName', 'Vasilescu Andrei'),
      fact('client.legalRepresentativeName', 'Petrescu Ion', fire, 'ATELIERUL INVENTAT S.R.L.'),
      fact('trainingSchedule.workerTrainingIntervalMonths', '6'),
      fact('fireSafety.smokingPolicy', 'forbidden_everywhere', fire),
    ],
    workplaces: [
      {
        name: 'Sediu',
        county: 'TM',
        locality: 'Timișoara',
        addressLine: 'str. Exemplului nr. 5',
        isRegisteredOffice: true,
        activity: null,
        rooms: ['laborator'],
        ...quoted(),
      },
      {
        name: 'Magazin',
        county: null,
        locality: 'Timișoara',
        addressLine: 'str. Piața Mică nr. 2',
        isRegisteredOffice: false,
        activity: 'Comerț',
        rooms: [],
        ...quoted(),
      },
    ],
    workplaceFacts: [],
    workplaceSuggestions: [],
    jobPositions: [
      {
        name: 'Brutar',
        trainingIntervalMonths: null,
        workZone: 'Laborator',
        managementOnly: false,
        needsProtectiveEquipment: null,
        ...quoted(),
      },
      {
        name: 'Vânzător',
        trainingIntervalMonths: null,
        workZone: null,
        managementOnly: false,
        needsProtectiveEquipment: null,
        ...quoted(),
      },
    ],
    jobPositionFacts: [
      { jobPosition: 'Brutar', field: 'staffCategory', value: 'execution', ...quoted() },
    ],
    responsiblePersons: [
      {
        fullName: 'Ionescu Maria',
        jobTitle: 'brutar',
        roles: [role('workplace_manager'), role('first_aid')],
        workplace: null,
        ...quoted(),
      },
      {
        fullName: 'Georgescu Dan',
        jobTitle: 'vânzător',
        roles: [role('workers_representative')],
        workplace: null,
        ...quoted(),
      },
    ],
    fireEquipment: [
      {
        workplace: 'Sediu',
        room: 'laborator',
        kind: 'extinguisher',
        agent: 'powder',
        capacity: 6,
        wheeled: false,
        count: 2,
        ...quoted(fire),
      },
    ],
    fireInstallations: [
      {
        workplace: 'Magazin',
        kind: 'emergency_lighting',
        description: null,
        ...quoted(fire),
      },
    ],
    protectiveEquipment: [
      {
        jobPositions: ['Brutar', 'Vânzător'],
        risk: 'Arsuri',
        item: 'Mănuși termorezistente',
        quantity: 1,
        durationMonths: 6,
        allocation: null,
        ...quoted(),
      },
    ],
    employees: [
      {
        role: 'workers_representative',
        lastName: 'Georgescu',
        firstName: 'Dan',
        cnp: null,
        birthDate: null,
        jobTitle: 'Vânzător',
        hiredAt: '01.03.2020',
        ...quoted(),
      },
    ],
    substances: [],
    notes: [],
    ...overrides,
  };
}

const proposalOf = (...readings: Reading[]): Proposal => toProposal(...readings);

describe('resolveField', () => {
  const field = (values: [string, string | null][]) => ({
    options: values.map(([value, otherCompanyName]) => ({
      value,
      sources: [{ file: decision, quote: value }],
      otherCompanyName,
    })),
  });

  it("takes the only value of the client's own documents and leaves another company's out", () => {
    expect(
      resolveField(
        field([
          ['A', null],
          ['B', 'ATELIER'],
        ]),
        undefined
      )
    ).toMatchObject({
      value: 'A',
      option: 0,
      choice: false,
    });
    expect(resolveField(field([['B', 'ATELIER']]), undefined).value).toBeNull();
    expect(resolveField(field([['B', 'ATELIER']]), { included: true })).toMatchObject({
      value: 'B',
      changed: true,
    });
  });

  it('asks for a choice between two own values until one is chosen or written', () => {
    const two = field([
      ['J35/1/2015', null],
      ['J35/2/2015', null],
    ]);
    expect(resolveField(two, undefined).choice).toBe(true);
    expect(resolveField(two, { option: 1 })).toMatchObject({ value: 'J35/2/2015', choice: false });
    expect(resolveField(two, { value: 'J35/3/2015' })).toMatchObject({
      value: 'J35/3/2015',
      option: null,
    });
    expect(resolveField(field([['A', null]]), { included: false })).toMatchObject({
      value: null,
      unticked: true,
    });
  });
});

describe('toClientPayload', () => {
  it("shapes a new client's proposal like the tables, with keys between the lists", () => {
    const { payload, blockers } = toClientPayload({
      proposal: proposalOf(reading()),
      changes: null,
      intoExistingClient: false,
      existing: noExistingRecords,
      registeredCompany: {
        cui: '12345674',
        legalName: 'BRUTĂRIA FICTIVĂ S.R.L.',
        vatPayer: true,
        inactive: false,
      },
    });

    expect(blockers).toEqual([]);
    expect(payload.client).toEqual({
      legal_name: 'BRUTĂRIA FICTIVĂ S.R.L.',
      cui: '12345674',
      county_code: 'TM',
      locality: 'Timișoara',
      legal_representative_name: 'Vasilescu Andrei',
      worker_training_interval_months: 6,
      vat_payer: true,
    });
    expect(payload.fire_safety).toEqual({
      smoking_policy: 'forbidden_everywhere',
      worker_training_interval_months: 6,
      periodic_training_hours: 2,
    });
    expect(payload.workplaces).toEqual([
      {
        key: 'workplace-1',
        name: 'Sediu',
        is_registered_office: true,
        county_code: 'TM',
        locality: 'Timișoara',
        address_line: 'str. Exemplului nr. 5',
      },
      {
        key: 'workplace-2',
        name: 'Magazin',
        is_registered_office: false,
        locality: 'Timișoara',
        address_line: 'str. Piața Mică nr. 2',
        activity: 'Comerț',
      },
    ]);
    expect(payload.job_positions).toEqual([
      { key: 'position-1', name: 'Brutar', staff_category: 'execution', work_zone: 'Laborator' },
      { key: 'position-2', name: 'Vânzător' },
    ]);
    expect(payload.equipment).toEqual([
      {
        job_position_key: 'position-1',
        risk: 'Arsuri',
        item: 'Mănuși termorezistente',
        quantity: 1,
        duration_months: 6,
      },
      {
        job_position_key: 'position-2',
        risk: 'Arsuri',
        item: 'Mănuși termorezistente',
        quantity: 1,
        duration_months: 6,
      },
    ]);
    expect(payload.employees).toEqual([
      {
        key: 'employee-1',
        last_name: 'Georgescu',
        first_name: 'Dan',
        job_title: 'Vânzător',
        hired_at: '2020-03-01',
      },
    ]);
    expect(payload.responsible_persons).toEqual([
      {
        full_name: 'Ionescu Maria',
        job_title: 'brutar',
        roles: ['workplace_manager', 'first_aid'],
      },
      {
        employee_key: 'employee-1',
        full_name: 'Georgescu Dan',
        job_title: 'vânzător',
        roles: ['workers_representative'],
      },
    ]);
    expect(payload.fire_equipment).toEqual([
      {
        workplace_key: 'workplace-1',
        kind: 'extinguisher',
        agent: 'powder',
        capacity: 6,
        wheeled: false,
        location: 'laborator',
      },
      {
        workplace_key: 'workplace-1',
        kind: 'extinguisher',
        agent: 'powder',
        capacity: 6,
        wheeled: false,
        location: 'laborator',
      },
    ]);
    expect(payload.fire_installations).toEqual([
      { workplace_key: 'workplace-2', kind: 'emergency_lighting' },
    ]);
    expect(payload.quality.client).toEqual({ changed: 0, unticked: 0, kept: 0 });
  });

  it("takes the member's VAT registration over ANAF's, and ANAF's for the CUI it registers", () => {
    const registeredCompany = {
      cui: '12345674',
      legalName: 'BRUTĂRIA FICTIVĂ S.R.L.',
      vatPayer: true,
      inactive: false,
    };
    const payloadWith = (fields: Record<string, { value: string }>, cui?: string) =>
      toClientPayload({
        proposal: proposalOf(reading()),
        changes: {
          fields: { ...fields, ...(cui ? { 'client.cui': { value: cui } } : {}) },
          items: {},
        },
        intoExistingClient: false,
        existing: noExistingRecords,
        registeredCompany,
      }).payload.client;

    expect(payloadWith({})).toMatchObject({ vat_payer: true });
    expect(payloadWith({ 'client.vatPayer': { value: 'false' } })).toMatchObject({
      vat_payer: false,
    });
    expect(payloadWith({}, '1590082')).not.toHaveProperty('vat_payer');
    expect(payloadWith({ 'client.vatPayer': { value: 'true' } }, '1590082')).toMatchObject({
      cui: '1590082',
      vat_payer: true,
    });
  });

  it("takes ANAF's name where the documents name the CUI's firm otherwise, unless the member takes theirs", () => {
    const registeredCompany = {
      cui: '12345674',
      legalName: 'PANIFICAȚIA NOUĂ S.R.L.',
      vatPayer: false,
      inactive: false,
    };
    const differing: Proposal = {
      ...proposalOf(reading()),
      flags: [
        {
          path: 'client.legalName',
          code: 'legal_name_differs',
          detail: registeredCompany.legalName,
        },
      ],
    };
    const mapped = (
      fields: ImportChanges['fields'],
      { proposal = differing, intoExistingClient = false } = {}
    ) =>
      toClientPayload({
        proposal,
        changes: { fields, items: {} },
        intoExistingClient,
        existing: noExistingRecords,
        registeredCompany,
      }).payload;

    expect(mapped({}).client.legal_name).toBe('PANIFICAȚIA NOUĂ S.R.L.');
    expect(mapped({}).quality.client.changed).toBe(0);
    expect(
      mapped({ 'client.legalName': { value: 'PANIFICAȚIA NOUĂ S.R.L.' } }).client.legal_name
    ).toBe('PANIFICAȚIA NOUĂ S.R.L.');
    expect(mapped({ 'client.legalName': { option: 0 } }).client.legal_name).toBe(
      'BRUTĂRIA FICTIVĂ S.R.L.'
    );
    expect(mapped({ 'client.legalName': { value: 'Brutăria Mea S.R.L.' } }).client.legal_name).toBe(
      'Brutăria Mea S.R.L.'
    );
    expect(mapped({ 'client.cui': { value: '1590082' } }).client.legal_name).toBe(
      'BRUTĂRIA FICTIVĂ S.R.L.'
    );
    expect(mapped({}, { proposal: proposalOf(reading()) }).client.legal_name).toBe(
      'BRUTĂRIA FICTIVĂ S.R.L.'
    );
    expect(mapped({}, { intoExistingClient: true }).client.legal_name).toBe(
      'BRUTĂRIA FICTIVĂ S.R.L.'
    );
  });

  it('applies what the member chose, wrote, ticked and unticked, and counts it without values', () => {
    const proposal = proposalOf(reading());
    const { payload, blockers } = toClientPayload({
      proposal,
      changes: {
        fields: {
          'client.legalRepresentativeName': { option: 1 },
          'client.locality': { value: 'Timisoara Nord' },
          'trainingSchedule.workerTrainingIntervalMonths': { included: false },
        },
        items: {
          'workplace-2': { included: false },
          'equipment-entry-2': { values: { quantity: 2 } },
        },
      },
      intoExistingClient: false,
      existing: noExistingRecords,
    });

    expect(payload.client).toMatchObject({
      legal_representative_name: 'Petrescu Ion',
      locality: 'Timisoara Nord',
    });
    // The bakers stay, so execution personnel take the law's longest interval in place of the
    // documents' one the member left out, which waits for the member to confirm it.
    expect(payload.client).toMatchObject({ worker_training_interval_months: 6 });
    expect(payload.workplaces.map((row) => row.key)).toEqual(['workplace-1']);
    expect(payload.equipment[1]).toMatchObject({ quantity: 2 });
    // The emergency lighting stood at the workplace the member left out.
    expect(blockers).toEqual([
      { path: 'fireInstallations.0.workplace', code: 'unknown_reference' },
      { path: 'trainingSchedule.workerTrainingIntervalMonths', code: 'choice' },
    ]);
    expect(payload.quality.client).toEqual({ changed: 2, unticked: 0, kept: 0 });
    expect(payload.quality.trainingSchedule).toEqual({ changed: 0, unticked: 1, kept: 0 });
    expect(payload.quality.workplaces).toEqual({ changed: 0, unticked: 1, kept: 0 });
    expect(payload.quality.protectiveEquipment).toEqual({ changed: 1, unticked: 0, kept: 0 });
  });

  it('asks to choose between two spellings of the representative, and writes the one chosen', () => {
    const proposal = withChecks(proposalOf(reading()), {
      files: { [decision]: null, [fire]: null },
      setAsideFiles: { 'Dosar/IPSSM.docx': 'Aprobat: administrator Vasilesu Andrei' },
    });
    const payloadWith = (changes: ImportChanges | null) =>
      toClientPayload({
        proposal,
        changes,
        intoExistingClient: false,
        existing: noExistingRecords,
      });

    expect(payloadWith(null).blockers).toContainEqual({
      path: 'client.legalRepresentativeName',
      code: 'choice',
    });
    const option = proposal.client.legalRepresentativeName.options.findIndex(
      (each) => each.value === 'Vasilesu Andrei'
    );
    const chosen = payloadWith({
      fields: { 'client.legalRepresentativeName': { option } },
      items: {},
    });
    expect(chosen.blockers).not.toContainEqual(
      expect.objectContaining({ path: 'client.legalRepresentativeName' })
    );
    expect(chosen.payload.client).toMatchObject({ legal_representative_name: 'Vasilesu Andrei' });
    expect(chosen.payload.quality.client).toMatchObject({ changed: 1 });
  });

  it('blocks on a choice, a missing identity, an invalid value and a representative without an employee', () => {
    const base = reading();
    const proposal = withChecks(
      proposalOf(
        reading({
          facts: [
            fact('client.legalName', 'BRUTĂRIA FICTIVĂ S.R.L.'),
            fact('client.legalName', 'BRUTĂRIA FICTIVĂ SRL NOU', fire),
            fact('client.countyCode', 'Atlantida'),
          ],
          employees: [],
          protectiveEquipment: [{ ...base.protectiveEquipment[0]!, risk: null }],
        })
      ),
      { files: { [decision]: null, [fire]: null } }
    );
    const { blockers } = toClientPayload({
      proposal,
      changes: null,
      intoExistingClient: false,
      existing: noExistingRecords,
    });

    expect(blockers).toEqual(
      expect.arrayContaining([
        { path: 'client.legalName', code: 'choice' },
        { path: 'client.cui', code: 'missing' },
        { path: 'client.countyCode', code: 'invalid' },
        { path: 'protectiveEquipment.0.risk', code: 'missing' },
        { path: 'responsiblePersons.1.employee', code: 'missing' },
      ])
    );

    const resolved = toClientPayload({
      proposal,
      changes: {
        fields: {
          'client.legalName': { option: 0 },
          'client.cui': { value: '12345674' },
          'client.countyCode': { value: 'TM' },
          'trainingSchedule.workerTrainingIntervalMonths': { value: 6 },
          'fireSafety.workerTrainingIntervalMonths': { value: 3 },
        },
        items: {
          'equipment-entry-1': { values: { risk: 'Arsuri' } },
          'equipment-entry-2': { values: { risk: 'Arsuri' } },
          'person-2': { included: false },
        },
      },
      intoExistingClient: false,
      existing: noExistingRecords,
    });
    expect(resolved.blockers).toEqual([]);
  });

  it('leaves the legal representative out as an employee until ticked, and only then asks for the hire date', () => {
    const base = reading();
    const proposal = proposalOf(
      reading({
        employees: [
          ...base.employees,
          {
            role: 'legal_representative',
            lastName: 'Vasilescu',
            firstName: 'Andrei',
            cnp: null,
            birthDate: null,
            jobTitle: 'Administrator',
            hiredAt: null,
            ...quoted(),
          },
        ],
      })
    );
    const unticked = toClientPayload({
      proposal,
      changes: null,
      intoExistingClient: false,
      existing: noExistingRecords,
    });

    expect(unticked.payload.employees.map((row) => row.key)).toEqual(['employee-1']);
    expect(unticked.blockers).toEqual([]);

    const ticked = toClientPayload({
      proposal,
      changes: { fields: {}, items: { 'employee-2': { included: true } } },
      intoExistingClient: false,
      existing: noExistingRecords,
    });
    expect(ticked.payload.employees.map((row) => row.key)).toEqual(['employee-1', 'employee-2']);
    expect(ticked.blockers).toEqual([{ path: 'employees.1.hiredAt', code: 'missing' }]);
    expect(ticked.payload.quality.employees).toEqual({ changed: 1, unticked: 0, kept: 0 });
  });

  it('leaves a post that is only the running of the firm out with its equipment until ticked', () => {
    const base = reading();
    const proposal = proposalOf(
      reading({
        jobPositions: [
          ...base.jobPositions,
          {
            name: 'Administrator',
            trainingIntervalMonths: null,
            workZone: null,
            managementOnly: true,
            needsProtectiveEquipment: null,
            ...quoted(),
          },
        ],
        protectiveEquipment: [
          ...base.protectiveEquipment,
          {
            jobPositions: ['Administrator'],
            risk: 'Accident rutier',
            item: 'Vestă reflectorizantă',
            quantity: 1,
            durationMonths: 12,
            allocation: null,
            ...quoted(),
          },
        ],
      })
    );
    const payloadWith = (items: Record<string, object>) =>
      toClientPayload({
        proposal,
        changes: { fields: {}, items },
        intoExistingClient: false,
        existing: noExistingRecords,
      });

    const unticked = payloadWith({});
    expect(unticked.payload.job_positions.map((row) => row.name)).toEqual(['Brutar', 'Vânzător']);
    expect(unticked.payload.equipment.map((row) => row.item)).toEqual([
      'Mănuși termorezistente',
      'Mănuși termorezistente',
    ]);
    expect(unticked.blockers).toEqual([]);
    expect(unticked.payload.quality.jobPositions).toEqual({ changed: 0, unticked: 0, kept: 0 });

    const ticked = payloadWith({ 'position-3': { included: true } });
    expect(ticked.payload.job_positions.map((row) => row.name)).toContain('Administrator');
    expect(ticked.payload.equipment).toContainEqual(
      expect.objectContaining({ job_position_key: 'position-3', item: 'Vestă reflectorizantă' })
    );
    expect(ticked.blockers).toEqual([]);

    const moved = payloadWith({
      'equipment-entry-3': { values: { jobPosition: 'position-2' } },
    });
    expect(moved.payload.equipment).toContainEqual(
      expect.objectContaining({ job_position_key: 'position-2', item: 'Vestă reflectorizantă' })
    );

    const keptAlone = payloadWith({ 'equipment-entry-3': { included: true } });
    expect(keptAlone.blockers).toEqual([
      { path: 'protectiveEquipment.2.jobPosition', code: 'unknown_reference' },
    ]);
  });

  it('leaves a post the member unticked out with its equipment, unless an entry moves to another post', () => {
    const proposal = proposalOf(reading());
    const payloadWith = (items: Record<string, object>) =>
      toClientPayload({
        proposal,
        changes: { fields: {}, items: { 'position-2': { included: false }, ...items } },
        intoExistingClient: false,
        existing: noExistingRecords,
      });

    const leftOut = payloadWith({});
    expect(leftOut.payload.job_positions.map((row) => row.name)).toEqual(['Brutar']);
    expect(leftOut.payload.equipment).toEqual([
      expect.objectContaining({ job_position_key: 'position-1', item: 'Mănuși termorezistente' }),
    ]);
    expect(leftOut.blockers).toEqual([]);
    expect(leftOut.payload.quality.jobPositions).toEqual({ changed: 0, unticked: 1, kept: 0 });
    expect(leftOut.payload.quality.protectiveEquipment).toEqual({
      changed: 0,
      unticked: 0,
      kept: 0,
    });

    const moved = payloadWith({ 'equipment-entry-2': { values: { jobPosition: 'position-1' } } });
    expect(moved.payload.equipment.map((row) => row.job_position_key)).toEqual([
      'position-1',
      'position-1',
    ]);
    expect(moved.blockers).toEqual([]);
  });

  it('carries the fire-safety sheet, the waste, other firms, a category without training and a post needing no equipment', () => {
    const base = reading();
    const sheet = (workplace: string, field: string, value: string) =>
      ({ workplace, field, value, ...quoted(fire) }) as Reading['workplaceFacts'][number];
    const proposal = proposalOf(
      reading({
        facts: [
          ...base.facts,
          fact('trainingSchedule.administrativeTrainingNotApplicable', 'true'),
          fact('fireSafety.wasteKinds', 'deșeuri menajere; carton', fire),
          fact('fireSafety.wasteCollectors', 'vânzătorii de serviciu', fire),
          fact('fireSafety.hasThirdParties', 'false', fire),
        ],
        workplaceFacts: [
          sheet('Sediu', 'floorAreaM2', '120'),
          sheet('Sediu', 'extinguisherNorm', 'commercial_200'),
          sheet('Sediu', 'assemblyPoint', 'parcarea din spate'),
          sheet('Magazin', 'kind', 'mobile_site'),
        ],
        jobPositions: [
          ...base.jobPositions,
          { ...base.jobPositions[1]!, name: 'Contabil', needsProtectiveEquipment: 'false' },
          { ...base.jobPositions[1]!, name: 'Șofer', needsProtectiveEquipment: 'false' },
        ],
      })
    );
    const payloadWith = (items: Record<string, object>) =>
      toClientPayload({
        proposal,
        changes: { fields: { 'assemblyPoints.workplace-1': { option: 0 } }, items },
        intoExistingClient: false,
        existing: noExistingRecords,
      });

    const { payload, blockers } = payloadWith({});
    expect(blockers).toEqual([]);
    expect(payload.client).not.toHaveProperty('administrative_training_not_applicable');
    expect(payload.fire_safety).toEqual({
      smoking_policy: 'forbidden_everywhere',
      waste_kinds: ['deșeuri menajere', 'carton'],
      waste_collectors: 'vânzătorii de serviciu',
      has_third_parties: false,
      worker_training_interval_months: 6,
      periodic_training_hours: 2,
    });
    expect(payload.workplaces[0]).toMatchObject({
      floor_area_m2: 120,
      extinguisher_norm: 'commercial_200',
      assembly_point: 'parcarea din spate',
    });
    expect(payload.workplaces[0]).not.toHaveProperty('fieldSources');
    expect(payload.job_positions[0]).toMatchObject({ staff_category: 'execution' });
    expect(payload.job_positions[0]).not.toHaveProperty('fieldSources');
    expect(payload.workplaces[1]).toMatchObject({ kind: 'mobile_site' });
    expect(payload.job_positions.map((row) => [row.name, row.needs_protective_equipment])).toEqual([
      ['Brutar', undefined],
      ['Vânzător', undefined],
      ['Contabil', false],
      ['Șofer', false],
    ]);

    const moved = payloadWith({
      'equipment-entry-2': { values: { jobPosition: 'position-4' } },
      'position-3': { values: { needsProtectiveEquipment: null } },
    });
    expect(moved.payload.job_positions.map((row) => row.needs_protective_equipment)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('sends the smoking place only beside designated places, as the policy chosen decides', () => {
    const base = reading();
    const proposal = proposalOf(
      reading({
        facts: [
          ...base.facts,
          fact('fireSafety.smokingPolicy', 'designated_places'),
          fact('fireSafety.smokingPlace', 'În curtea interioară'),
        ],
      })
    );
    // An import read before the reading joined the two rules (ADR 030) still holds them apart.
    proposal.fireSafety.smokingPolicy.options.unshift({
      value: 'forbidden_everywhere',
      sources: [{ file: fire, quote: 'citat' }],
      otherCompanyName: null,
    });
    const policies = proposal.fireSafety.smokingPolicy.options.map((option) => option.value);
    const payloadWith = (policy: string | null, existing = noExistingRecords, replace = false) =>
      toClientPayload({
        proposal,
        changes: {
          fields:
            policy === null
              ? {}
              : {
                  'fireSafety.smokingPolicy': {
                    option: policies.indexOf(policy),
                    ...(replace ? { replace } : {}),
                  },
                  'fireSafety.smokingPlace': { option: 0 },
                },
          items: {},
        },
        intoExistingClient: existing !== noExistingRecords,
        existing,
      });

    expect(payloadWith(null).blockers).toEqual([
      { path: 'fireSafety.smokingPolicy', code: 'choice' },
      { path: 'fireSafety.smokingPlace', code: 'choice' },
    ]);

    const forbidden = payloadWith('forbidden_everywhere');
    expect(forbidden.blockers).toEqual([]);
    expect(forbidden.payload.fire_safety).toMatchObject({ smoking_policy: 'forbidden_everywhere' });
    expect(forbidden.payload.fire_safety).not.toHaveProperty('smoking_place');

    const designated = payloadWith('designated_places');
    expect(designated.blockers).toEqual([]);
    expect(designated.payload.fire_safety).toMatchObject({
      smoking_policy: 'designated_places',
      smoking_place: 'În curtea interioară',
    });

    const forbiddenInApp = {
      ...noExistingRecords,
      fireSafety: { smoking_policy: 'forbidden_everywhere' },
    };
    expect(payloadWith('designated_places', forbiddenInApp).payload.fire_safety).not.toHaveProperty(
      'smoking_place'
    );
    expect(
      payloadWith('designated_places', forbiddenInApp, true).payload.fire_safety
    ).toMatchObject({
      smoking_place: 'În curtea interioară',
      replace: ['smoking_policy'],
    });
  });

  it('writes no declared exclusion, so an interval beside one blocks nothing', () => {
    const base = reading();
    const { payload, blockers } = toClientPayload({
      proposal: proposalOf(
        reading({
          facts: [...base.facts, fact('trainingSchedule.workerTrainingNotApplicable', 'da')],
        })
      ),
      changes: null,
      intoExistingClient: false,
      existing: noExistingRecords,
    });

    expect(blockers).toEqual([]);
    expect(payload.client).toMatchObject({ worker_training_interval_months: 6 });
    expect(payload.client).not.toHaveProperty('worker_training_not_applicable');
  });

  it('blocks a second registered office the member ticks until they untick one or leave one out', () => {
    const proposal = proposalOf(reading({ fireEquipment: [] }));
    const [first, second] = proposal.workplaces;
    const blockersWith = (items: Record<string, object>) =>
      toClientPayload({
        proposal,
        changes: {
          fields: {},
          items: { [second!.id]: { values: { isRegisteredOffice: true } }, ...items },
        },
        intoExistingClient: false,
        existing: noExistingRecords,
      }).blockers;

    expect(blockersWith({})).toEqual([
      { path: 'workplaces.1.isRegisteredOffice', code: 'invalid' },
    ]);
    expect(blockersWith({ [first!.id]: { included: false } })).toEqual([]);
    expect(blockersWith({ [first!.id]: { values: { isRegisteredOffice: false } } })).toEqual([]);
  });

  it('writes the fire-safety training calendar the SSM one fills in, or what the member wrote over it', () => {
    const base = reading();
    const proposal = proposalOf(
      reading({
        facts: [
          ...base.facts,
          fact('trainingSchedule.trainingFirstMonth', '3'),
          fact('trainingSchedule.trainingDayFrom', '10'),
          fact('trainingSchedule.trainingDayTo', '20'),
          fact('trainingSchedule.administrativeTrainingIntervalMonths', '12 luni'),
          fact('fireSafety.periodicTrainingHours', '2', fire),
          fact('fireSafety.trainingDayTo', '25', fire),
        ],
      })
    );
    const payloadWith = (fields: Record<string, object>) =>
      toClientPayload({
        proposal,
        changes: { fields, items: {} },
        intoExistingClient: false,
        existing: noExistingRecords,
      });

    const { payload, blockers } = payloadWith({});
    expect(blockers).toEqual([]);
    expect(payload.fire_safety).toEqual({
      smoking_policy: 'forbidden_everywhere',
      periodic_training_hours: 2,
      worker_training_interval_months: 6,
      training_first_month: 3,
      training_day_from: 10,
      training_day_to: 25,
    });

    const written = payloadWith({
      'fireSafety.trainingFirstMonth': { value: 9 },
      'fireSafety.workerTrainingIntervalMonths': { value: 3 },
    });
    expect(written.payload.fire_safety).toMatchObject({
      training_first_month: 9,
      worker_training_interval_months: 3,
    });
  });

  it('starts an empty SU schedule as the client card would: the usual interval to confirm, two hours and the SSM calendar', () => {
    const base = reading();
    const payloadWith = (
      fields: ImportChanges['fields'],
      existing: ExistingRecords = noExistingRecords,
      facts: Reading['facts'] = []
    ) =>
      toClientPayload({
        proposal: proposalOf(
          reading({
            facts: [
              ...base.facts.filter(
                (each) => each.field !== 'trainingSchedule.workerTrainingIntervalMonths'
              ),
              fact('trainingSchedule.trainingFirstMonth', '3'),
              fact('trainingSchedule.workerTrainingIntervalMonths', '2'),
              fact('trainingSchedule.workerTrainingIntervalMonths', '4', fire),
              ...facts,
            ],
          })
        ),
        changes: {
          fields: { 'trainingSchedule.workerTrainingIntervalMonths': { option: 0 }, ...fields },
          items: {},
        },
        intoExistingClient: existing !== noExistingRecords,
        existing,
      });

    const pending = payloadWith({ 'trainingSchedule.trainingDayFrom': { value: 10 } });
    expect(pending.blockers).toEqual([
      { path: 'fireSafety.workerTrainingIntervalMonths', code: 'choice' },
    ]);
    expect(pending.payload.fire_safety).toEqual({
      smoking_policy: 'forbidden_everywhere',
      worker_training_interval_months: 3,
      periodic_training_hours: 2,
      training_first_month: 3,
      training_day_from: 10,
    });

    const confirmed = payloadWith({ 'fireSafety.workerTrainingIntervalMonths': { value: 3 } });
    expect(confirmed.blockers).toEqual([]);
    expect(confirmed.payload.fire_safety).toMatchObject({
      worker_training_interval_months: 3,
      periodic_training_hours: 2,
      training_first_month: 3,
    });

    const smokingOnly: ExistingRecords = {
      ...noExistingRecords,
      client: {
        cui: '12345674',
        training_first_month: 9,
        training_day_from: 1,
        training_day_to: 5,
      },
      fireSafety: { smoking_policy: 'designated_places' },
    };
    const existingClient = payloadWith(
      { 'fireSafety.workerTrainingIntervalMonths': { value: 2 } },
      smokingOnly
    );
    expect(existingClient.payload.fire_safety).toMatchObject({
      worker_training_interval_months: 2,
      periodic_training_hours: 2,
      training_first_month: 3,
      training_day_from: 1,
      training_day_to: 5,
    });

    const started = payloadWith(
      {},
      {
        ...smokingOnly,
        fireSafety: { periodic_training_hours: 4, worker_training_interval_months: 1 },
      }
    );
    expect(started.blockers).toEqual([]);
    expect(started.payload.fire_safety).not.toHaveProperty('periodic_training_hours');
    expect(started.payload.fire_safety).not.toHaveProperty('training_day_from');
  });

  it('writes no SU schedule where the client keeps no posts and the documents give none', () => {
    const { payload, blockers } = toClientPayload({
      proposal: proposalOf(
        reading({ facts: reading().facts.filter((each) => !each.field.endsWith('IntervalMonths')) })
      ),
      changes: {
        fields: {},
        items: { 'position-1': { included: false }, 'position-2': { included: false } },
      },
      intoExistingClient: false,
      existing: noExistingRecords,
    });
    expect(blockers.filter((blocker) => blocker.path.startsWith('fireSafety.'))).toEqual([]);
    expect(payload.fire_safety).toEqual({ smoking_policy: 'forbidden_everywhere' });
  });

  it('writes and waits for no interval of a category without kept posts, whatever the documents give', () => {
    const base = reading();
    const intervals = (worker: string[], administrative: string[]) => [
      ...base.facts.filter(
        (each) => each.field !== 'trainingSchedule.workerTrainingIntervalMonths'
      ),
      ...worker.map((months) => fact('trainingSchedule.workerTrainingIntervalMonths', months)),
      ...administrative.map((months, index) =>
        fact(
          'trainingSchedule.administrativeTrainingIntervalMonths',
          months,
          `Dosar/Decizia ${index}.docx`
        )
      ),
    ];
    const payloadOf = (facts: Reading['facts'], items: ImportChanges['items'] = {}) =>
      toClientPayload({
        proposal: withChecks(proposalOf(reading({ facts })), { files: {} }),
        changes: { fields: {}, items },
        intoExistingClient: false,
        existing: noExistingRecords,
      });

    const both = payloadOf(intervals(['6'], ['6', '12']));
    expect(both.blockers).toEqual([]);
    expect(both.payload.client).not.toHaveProperty('administrative_training_interval_months');

    const tooLong = payloadOf(intervals(['12'], []), {
      'position-1': { included: false },
      'position-2': { included: false },
    });
    expect(tooLong.blockers).toEqual([]);
    expect(tooLong.payload.client).not.toHaveProperty('worker_training_interval_months');
  });

  it('gives a category with posts its starting interval in both schedules where the documents give none, once the member confirms it', () => {
    const base = reading();
    const category = (jobPosition: string, value: string) => ({
      jobPosition,
      field: 'staffCategory' as const,
      value,
      ...quoted(),
    });
    const payloadOf = (
      categories: ReturnType<typeof category>[],
      fields: ImportChanges['fields'] = {}
    ) =>
      toClientPayload({
        proposal: proposalOf(
          reading({
            facts: base.facts.filter(
              (each) => each.field !== 'trainingSchedule.workerTrainingIntervalMonths'
            ),
            jobPositionFacts: categories,
          })
        ),
        changes: { fields, items: {} },
        intoExistingClient: false,
        existing: noExistingRecords,
      });

    const execution = payloadOf([category('Brutar', 'execution')]);
    expect(execution.blockers).toEqual([
      { path: 'trainingSchedule.workerTrainingIntervalMonths', code: 'choice' },
      { path: 'fireSafety.workerTrainingIntervalMonths', code: 'choice' },
    ]);
    expect(execution.payload.client).toMatchObject({ worker_training_interval_months: 6 });
    expect(execution.payload.fire_safety).toMatchObject({ worker_training_interval_months: 3 });
    expect(execution.payload.client).not.toHaveProperty('administrative_training_interval_months');
    expect(execution.payload.client).not.toHaveProperty('administrative_training_not_applicable');

    const both = payloadOf([
      category('Brutar', 'execution'),
      category('Vânzător', 'technical_administrative'),
    ]);
    expect(both.payload.client).toMatchObject({
      worker_training_interval_months: 6,
      administrative_training_interval_months: 12,
    });
    expect(both.payload.fire_safety).toMatchObject({
      worker_training_interval_months: 3,
      administrative_training_interval_months: 6,
    });
    expect(both.blockers).toEqual([
      { path: 'trainingSchedule.workerTrainingIntervalMonths', code: 'choice' },
      { path: 'trainingSchedule.administrativeTrainingIntervalMonths', code: 'choice' },
      { path: 'fireSafety.workerTrainingIntervalMonths', code: 'choice' },
      { path: 'fireSafety.administrativeTrainingIntervalMonths', code: 'choice' },
    ]);

    const confirmed = payloadOf([category('Brutar', 'execution')], {
      'trainingSchedule.workerTrainingIntervalMonths': { value: 6 },
      'fireSafety.workerTrainingIntervalMonths': { value: 3 },
    });
    expect(confirmed.blockers).toEqual([]);
    expect(confirmed.payload.client).toMatchObject({ worker_training_interval_months: 6 });
    expect(confirmed.payload.fire_safety).toMatchObject({ worker_training_interval_months: 3 });
    // A "Nu se aplică" an older review saved is no confirmation.
    const excluded = payloadOf([category('Brutar', 'execution')], {
      'trainingSchedule.workerTrainingIntervalMonths': { value: null },
      'fireSafety.workerTrainingIntervalMonths': { value: 3 },
    });
    expect(excluded.blockers).toEqual([
      { path: 'trainingSchedule.workerTrainingIntervalMonths', code: 'choice' },
    ]);
  });

  it('waits for the member on an interval outside the list, whoever gave it', () => {
    const base = reading();
    const path = 'trainingSchedule.administrativeTrainingIntervalMonths';
    const payloadOf = (fields: ImportChanges['fields'] = {}) =>
      toClientPayload({
        proposal: proposalOf(
          reading({
            facts: [
              ...base.facts,
              fact(path, '5'),
              fact('fireSafety.workerTrainingIntervalMonths', '3'),
            ],
            jobPositionFacts: [
              ...base.jobPositionFacts,
              {
                jobPosition: 'Vânzător',
                field: 'staffCategory',
                value: 'technical_administrative',
                ...quoted(),
              },
            ],
          })
        ),
        changes: {
          fields: { 'fireSafety.administrativeTrainingIntervalMonths': { value: 6 }, ...fields },
          items: {},
        },
        intoExistingClient: false,
        existing: noExistingRecords,
      });

    expect(payloadOf().blockers).toContainEqual(expect.objectContaining({ path }));
    expect(payloadOf({ [path]: { value: 9 } }).blockers).toEqual([{ path, code: 'choice' }]);
    const picked = payloadOf({ [path]: { value: 4 } });
    expect(picked.blockers).toEqual([]);
    expect(picked.payload.client).toMatchObject({ administrative_training_interval_months: 4 });
  });

  it('counts the posts an existing client has and writes over its exclusion of a category with posts', () => {
    const existing: ExistingRecords = {
      ...noExistingRecords,
      client: {
        cui: '12345678',
        worker_training_interval_months: 6,
        administrative_training_interval_months: null,
        administrative_training_not_applicable: true,
      },
      jobPositions: [
        {
          id: '1c8b6b1f-4d62-4b40-8e1f-6b2c3d4e5f60',
          name: 'Contabil',
          staff_category: 'technical_administrative',
        },
      ],
    };
    const { payload, blockers } = toClientPayload({
      proposal: proposalOf(reading()),
      changes: null,
      intoExistingClient: true,
      existing,
    });

    expect(blockers).toEqual([
      { path: 'trainingSchedule.administrativeTrainingIntervalMonths', code: 'choice' },
      { path: 'fireSafety.administrativeTrainingIntervalMonths', code: 'choice' },
    ]);
    expect(payload.client).toMatchObject({
      administrative_training_interval_months: 12,
      replace: ['administrative_training_interval_months'],
    });
  });

  it("counts an existing client's post by the category confirming leaves it, not the imported one", () => {
    const base = reading();
    const seller = '2a3b4c5d-6e7f-4081-9a2b-3c4d5e6f7a8b';
    const payloadWith = (items: ImportChanges['items']) =>
      toClientPayload({
        proposal: proposalOf(
          reading({
            jobPositionFacts: [
              {
                jobPosition: 'Vânzător',
                field: 'staffCategory',
                value: 'technical_administrative',
                ...quoted(),
              },
            ],
          })
        ),
        changes: { fields: {}, items },
        intoExistingClient: true,
        existing: {
          ...noExistingRecords,
          client: { cui: '12345674' },
          jobPositions: [{ id: seller, name: 'vânzător', staff_category: 'execution' }],
        },
      });

    expect(payloadWith({}).payload.client).not.toHaveProperty(
      'administrative_training_interval_months'
    );
    const replaced = payloadWith({
      'position-2': { existingId: seller, replace: ['staffCategory'] },
    });
    expect(replaced.payload.client).toMatchObject({ administrative_training_interval_months: 12 });
    expect(base.facts).not.toContainEqual(
      expect.objectContaining({ field: 'trainingSchedule.administrativeTrainingIntervalMonths' })
    );
  });

  it("keeps an existing client's schedule value where the documents give two, until the member takes one", () => {
    const base = reading();
    const payloadWith = (fields: ImportChanges['fields']) =>
      toClientPayload({
        proposal: proposalOf(
          reading({
            facts: [
              ...base.facts,
              fact('trainingSchedule.workerTrainingIntervalMonths', '3', fire),
              fact('trainingSchedule.trainingFirstMonth', '2'),
              fact('trainingSchedule.trainingFirstMonth', '5', fire),
            ],
          })
        ),
        changes: { fields, items: {} },
        intoExistingClient: true,
        existing: {
          ...noExistingRecords,
          client: { cui: '12345674', worker_training_interval_months: 4, training_first_month: 1 },
          fireSafety: { worker_training_interval_months: 3 },
        },
      });

    const kept = payloadWith({});
    expect(kept.blockers).toEqual([]);
    expect(kept.payload.client).not.toHaveProperty('worker_training_interval_months');
    expect(kept.payload.client).not.toHaveProperty('training_first_month');

    const taken = payloadWith({
      'trainingSchedule.workerTrainingIntervalMonths': { option: 1, replace: true },
    });
    expect(taken.blockers).toEqual([]);
    expect(taken.payload.client).toMatchObject({
      worker_training_interval_months: 3,
      replace: ['worker_training_interval_months'],
    });
  });

  it('blocks a last training day before the first, as the database would refuse it', () => {
    const base = reading();
    const payloadWith = (
      fields: ImportChanges['fields'],
      intoExistingClient = false,
      client: Record<string, unknown> | null = null
    ) =>
      toClientPayload({
        proposal: proposalOf(
          reading({
            facts: [
              ...base.facts,
              fact('trainingSchedule.trainingDayFrom', '12'),
              fact('trainingSchedule.trainingDayTo', '15'),
            ],
          })
        ),
        changes: { fields, items: {} },
        intoExistingClient,
        existing: { ...noExistingRecords, client },
      });

    expect(payloadWith({}).blockers).toEqual([]);
    expect(payloadWith({ 'trainingSchedule.trainingDayTo': { value: 7 } }).blockers).toEqual([
      { path: 'trainingSchedule.trainingDayTo', code: 'invalid' },
    ]);
    expect(payloadWith({ 'fireSafety.trainingDayFrom': { value: 20 } }).blockers).toContainEqual({
      path: 'fireSafety.trainingDayTo',
      code: 'invalid',
    });
    const existingDays = { cui: '12345674', training_day_from: 1, training_day_to: 10 };
    expect(payloadWith({}, true, existingDays).blockers).toEqual([]);
    expect(
      payloadWith({ 'trainingSchedule.trainingDayFrom': { replace: true } }, true, existingDays)
        .blockers
    ).toEqual([{ path: 'trainingSchedule.trainingDayTo', code: 'invalid' }]);
  });

  it('blocks a fire-safety value the checks found outside what the database takes', () => {
    const base = reading();
    const proposal = withChecks(
      proposalOf(
        reading({
          workplaceFacts: [
            {
              workplace: 'Sediu',
              field: 'extinguisherNorm',
              value: '1 stingător la 200 mp',
              ...quoted(fire),
            },
          ],
          facts: base.facts,
        })
      ),
      { files: {} }
    );
    const blockersWith = (items: Record<string, object>) =>
      toClientPayload({
        proposal,
        changes: { fields: {}, items },
        intoExistingClient: false,
        existing: noExistingRecords,
      }).blockers;

    expect(blockersWith({})).toContainEqual({
      path: 'workplaces.0.extinguisherNorm',
      code: 'invalid',
    });
    expect(
      blockersWith({ 'workplace-1': { values: { extinguisherNorm: 'commercial_200' } } })
    ).not.toContainEqual(expect.objectContaining({ path: 'workplaces.0.extinguisherNorm' }));
  });

  it('asks inventory for a duration the app takes and a consumable for none, as the database does', () => {
    const entry = (item: string, durationMonths: number | null, allocation: string | null) => ({
      jobPositions: ['Brutar'],
      risk: 'Substanțe de curățat',
      item,
      quantity: 1,
      durationMonths,
      allocation: allocation as 'consumable' | null,
      ...quoted(),
    });
    const proposal = withChecks(
      proposalOf(
        reading({
          protectiveEquipment: [
            entry('Mănuși', null, 'personal_inventory'),
            entry('Mască', 3, 'consumable'),
            entry('Cască', 121, 'section_inventory'),
            entry('Ochelari', null, null),
            entry('Soluție dezinfectantă', null, 'consumable'),
          ],
        })
      ),
      { files: {} }
    );
    const blockersWith = (items: Record<string, object>) =>
      toClientPayload({
        proposal,
        changes: { fields: {}, items },
        intoExistingClient: false,
        existing: noExistingRecords,
      })
        .blockers.filter((blocker) => blocker.path.startsWith('protectiveEquipment'))
        .sort((a, b) => a.path.localeCompare(b.path));

    expect(blockersWith({})).toEqual([
      { path: 'protectiveEquipment.0.durationMonths', code: 'missing' },
      { path: 'protectiveEquipment.1.durationMonths', code: 'invalid' },
      { path: 'protectiveEquipment.2.durationMonths', code: 'invalid' },
      { path: 'protectiveEquipment.3.durationMonths', code: 'missing' },
    ]);
    expect(
      blockersWith({
        'equipment-entry-1': { values: { durationMonths: 12 } },
        'equipment-entry-2': { values: { allocation: 'personal_inventory' } },
        'equipment-entry-3': { values: { durationMonths: 120 } },
        'equipment-entry-4': { values: { allocation: 'consumable' } },
      })
    ).toEqual([]);
    expect(
      blockersWith({
        'equipment-entry-2': { values: { allocation: 'personal_inventory', durationMonths: 24 } },
        'equipment-entry-1': { values: { allocation: 'consumable' } },
      })
    ).toEqual([
      { path: 'protectiveEquipment.2.durationMonths', code: 'invalid' },
      { path: 'protectiveEquipment.3.durationMonths', code: 'missing' },
    ]);
  });

  it("still asks for the workers' representative's hire date", () => {
    const base = reading();
    const { blockers } = toClientPayload({
      proposal: proposalOf(reading({ employees: [{ ...base.employees[0]!, hiredAt: null }] })),
      changes: null,
      intoExistingClient: false,
      existing: noExistingRecords,
    });

    expect(blockers).toEqual([{ path: 'employees.0.hiredAt', code: 'missing' }]);
  });

  it("fills an existing client's empty values, keeps its own, and replaces only what the member took", () => {
    const existing: ExistingRecords = {
      client: {
        legal_name: 'BRUTĂRIA FICTIVĂ S.R.L.',
        cui: '12345674',
        county_code: 'TM',
        locality: 'Lugoj',
        legal_representative_name: 'Vasilescu Andrei',
        worker_training_interval_months: 3,
      },
      fireSafety: null,
      workplaces: [
        {
          id: '0b7a5a0e-3c51-4a3f-9d0e-5a1b2c3d4e5f',
          name: 'Sediul social',
          address_line: 'str. Exemplului nr. 5',
        },
      ],
      jobPositions: [{ id: '1c8b6b1f-4d62-4b40-8e1f-6b2c3d4e5f60', name: 'Brutar' }],
      employees: [
        {
          id: '2d9c7c2a-5e73-4c51-9f2a-7c3d4e5f6071',
          last_name: 'Georgescu',
          first_name: 'Dan',
          cnp: null,
        },
      ],
      responsiblePersons: [{ full_name: 'Ionescu Maria' }],
      substances: [],
    };
    const { payload, blockers } = toClientPayload({
      proposal: proposalOf(reading()),
      changes: {
        fields: { 'trainingSchedule.workerTrainingIntervalMonths': { replace: true } },
        items: { 'workplace-1': { replace: ['addressLine'] } },
      },
      intoExistingClient: true,
      existing,
    });

    expect(blockers).toEqual([]);
    expect(payload.client).not.toHaveProperty('cui');
    expect(payload.client).toMatchObject({
      worker_training_interval_months: 6,
      replace: ['worker_training_interval_months'],
    });
    expect(payload.workplaces[0]).toMatchObject({
      key: 'workplace-1',
      id: '0b7a5a0e-3c51-4a3f-9d0e-5a1b2c3d4e5f',
      replace: ['address_line'],
    });
    expect(payload.workplaces[1]).not.toHaveProperty('id');
    expect(payload.employees).toEqual([]);
    expect(payload.responsible_persons).toEqual([
      {
        employee_id: '2d9c7c2a-5e73-4c51-9f2a-7c3d4e5f6071',
        full_name: 'Georgescu Dan',
        job_title: 'vânzător',
        roles: ['workers_representative'],
      },
    ]);
    expect(payload.quality.client.kept).toBe(1);
    expect(payload.quality.employees.kept).toBe(1);
    expect(payload.quality.responsiblePersons.kept).toBe(1);
  });

  it('blocks a row the member picked that the client no longer has, or never had', () => {
    const existing: ExistingRecords = {
      ...noExistingRecords,
      client: { legal_name: 'BRUTĂRIA FICTIVĂ S.R.L.', cui: '12345674' },
      workplaces: [
        { id: '0b7a5a0e-3c51-4a3f-9d0e-5a1b2c3d4e5f', name: 'Sediu', address_line: null },
      ],
      jobPositions: [{ id: '1c8b6b1f-4d62-4b40-8e1f-6b2c3d4e5f60', name: 'Brutar' }],
    };
    const { payload, blockers } = toClientPayload({
      proposal: proposalOf(reading()),
      changes: {
        fields: {},
        items: {
          'workplace-1': { existingId: '9e0d8c7b-6a59-4483-9271-605f4e3d2c1b' },
          'position-1': { existingId: '8d9c7b6a-5948-4372-8160-5f4e3d2c1b0a' },
        },
      },
      intoExistingClient: true,
      existing,
    });

    expect(blockers).toEqual(
      expect.arrayContaining([
        { path: 'workplaces.0', code: 'unknown_reference' },
        { path: 'jobPositions.0', code: 'unknown_reference' },
      ])
    );
    expect(payload.workplaces[0]).not.toHaveProperty('id');
    expect(payload.job_positions[0]).not.toHaveProperty('id');
  });

  it('blocks equipment whose table named no position, without failing', () => {
    const { blockers } = toClientPayload({
      proposal: proposalOf(
        reading({
          protectiveEquipment: [
            {
              jobPositions: [],
              risk: 'Arsuri',
              item: 'Mănuși termorezistente',
              quantity: 1,
              durationMonths: 6,
              allocation: null,
              ...quoted(),
            },
          ],
        })
      ),
      changes: null,
      intoExistingClient: false,
      existing: noExistingRecords,
    });

    expect(blockers).toContainEqual({
      path: 'protectiveEquipment.0.jobPosition',
      code: 'unknown_reference',
    });
  });
});

describe('one count of the means per workplace', () => {
  const list = 'Dosar/PSI/Lista mijloacelor.docx';
  const evaluation = 'Dosar/PSI/Evaluarea riscului.docx';
  const powder = (file: string, count: number | null, room: string | null = null) => ({
    workplace: 'Sediu',
    room,
    kind: 'extinguisher' as const,
    agent: 'powder' as const,
    capacity: 6,
    wheeled: false,
    count,
    ...quoted(file),
  });
  const proposal = proposalOf(
    reading({
      fireEquipment: [
        powder(fire, 4, 'laborator'),
        powder(fire, 1, 'magazie'),
        powder(list, 3),
        powder(evaluation, 5),
      ],
    })
  );
  const mapped = (fields: ImportChanges['fields'] = {}, items: ImportChanges['items'] = {}) =>
    toClientPayload({
      proposal,
      changes: { fields, items },
      intoExistingClient: false,
      existing: noExistingRecords,
    });
  const locations = (rows: Record<string, unknown>[]) => rows.map((row) => row.location ?? null);

  it('blocks confirming and writes none of the means while the count waits for its choice', () => {
    const { payload, blockers } = mapped();

    expect(blockers).toEqual([{ path: 'fireEquipmentCounts.count-1', code: 'choice' }]);
    expect(payload.fire_equipment).toEqual([]);
    expect(payload.quality.fireEquipment).toEqual({ changed: 0, unticked: 0, kept: 0 });
  });

  it('writes the chosen file’s entries, rooms included, once', () => {
    const rooms = mapped({ 'fireEquipmentCounts.count-1': { option: 0 } });
    const listed = mapped({ 'fireEquipmentCounts.count-1': { option: 1 } });

    expect(rooms.blockers).toEqual([]);
    expect(locations(rooms.payload.fire_equipment)).toEqual([
      'laborator',
      'laborator',
      'laborator',
      'laborator',
      'magazie',
    ]);
    expect(listed.blockers).toEqual([]);
    expect(locations(listed.payload.fire_equipment)).toEqual([null, null, null]);
  });

  it('counts in the quality only what the member did to the chosen entries', () => {
    const [laboratory, , listed] = proposal.fireEquipment;
    const { payload } = mapped(
      { 'fireEquipmentCounts.count-1': { option: 0 } },
      { [laboratory!.id]: { included: false }, [listed!.id]: { values: { count: 4 } } }
    );

    expect(locations(payload.fire_equipment)).toEqual(['magazie']);
    expect(payload.quality.fireEquipment).toEqual({ changed: 0, unticked: 1, kept: 0 });
  });

  it('does not write an entry of the other file the member ticked before choosing', () => {
    const [, , listed] = proposal.fireEquipment;
    const { payload } = mapped(
      { 'fireEquipmentCounts.count-1': { option: 0 } },
      { [listed!.id]: { included: true } }
    );

    expect(payload.fire_equipment).toHaveLength(5);
  });

  it('writes one unit for a row the document gives without a number', () => {
    const { payload, blockers } = toClientPayload({
      proposal: proposalOf(reading({ fireEquipment: [powder(list, null, 'birou')] })),
      changes: null,
      intoExistingClient: false,
      existing: noExistingRecords,
    });

    expect(blockers).toEqual([]);
    expect(locations(payload.fire_equipment)).toEqual(['birou']);
  });

  it('writes every entry of a proposal stored before the means were counted once', () => {
    const { payload, blockers } = toClientPayload({
      proposal: { ...proposal, fireEquipmentCounts: [] },
      changes: null,
      intoExistingClient: false,
      existing: noExistingRecords,
    });

    expect(blockers).toEqual([]);
    expect(payload.fire_equipment).toHaveLength(8);
  });
});

describe('the assembly point and the smoking place', () => {
  const sheet = (workplace: string, value: string) =>
    ({
      workplace,
      field: 'assemblyPoint',
      value,
      ...quoted(fire),
    }) as Reading['workplaceFacts'][number];
  const base = reading();
  const proposal = proposalOf(
    reading({
      facts: [
        ...base.facts.filter((each) => each.field !== 'fireSafety.smokingPolicy'),
        fact('fireSafety.smokingPolicy', 'designated_places', fire),
        fact('fireSafety.smokingPlace', 'La poarta unității', fire),
      ],
      workplaceFacts: [
        sheet('Sediu', 'Parcarea din fața clădirii'),
        sheet('Magazin', 'Trotuarul din fața magazinului'),
      ],
    })
  );
  proposal.fireSafety.smokingPlace.options[0]!.spelling = 'LA POARTA UNITATII';
  proposal.workplaces[0]!.spelling = { assemblyPoint: 'PARCAREA DIN FATA CLADIRII' };
  const keptBoth = {
    'fireSafety.smokingPlace': { option: 0 },
    'assemblyPoints.workplace-1': { option: 0 },
    'assemblyPoints.workplace-2': { option: 0 },
  };
  const mapped = (
    fields: ImportChanges['fields'] = {},
    items: ImportChanges['items'] = {},
    existing: ExistingRecords | null = null
  ) =>
    toClientPayload({
      proposal,
      changes: { fields, items },
      intoExistingClient: existing !== null,
      existing: existing ?? noExistingRecords,
    });
  const points = (rows: Record<string, unknown>[]) => rows.map((row) => row.assembly_point ?? null);

  it('blocks confirming until each is decided, and writes neither while it waits', () => {
    const { payload, blockers } = mapped();

    expect(blockers).toEqual([
      { path: 'fireSafety.smokingPlace', code: 'choice' },
      { path: 'assemblyPoints.workplace-1', code: 'choice' },
      { path: 'assemblyPoints.workplace-2', code: 'choice' },
    ]);
    expect(payload.fire_safety).not.toHaveProperty('smoking_place');
    expect(points(payload.workplaces)).toEqual([null, null]);
  });

  it('writes the value as read once kept, and counts no change', () => {
    const { payload, blockers } = mapped(keptBoth);

    expect(blockers).toEqual([]);
    expect(payload.fire_safety).toMatchObject({ smoking_place: 'La poarta unității' });
    expect(points(payload.workplaces)).toEqual([
      'Parcarea din fața clădirii',
      'Trotuarul din fața magazinului',
    ]);
    expect(payload.quality.fireSafety.changed).toBe(0);
    expect(payload.quality.workplaces.changed).toBe(0);
  });

  it('keeps the spelling selected, the corrected one or the document’s', () => {
    const { payload, blockers } = mapped(
      { ...keptBoth, 'fireSafety.smokingPlace': { option: 0, value: 'LA POARTA UNITATII' } },
      { 'workplace-1': { values: { assemblyPoint: 'PARCAREA DIN FATA CLADIRII' } } }
    );

    expect(blockers).toEqual([]);
    expect(payload.fire_safety).toMatchObject({ smoking_place: 'LA POARTA UNITATII' });
    expect(points(payload.workplaces)[0]).toBe('PARCAREA DIN FATA CLADIRII');
  });

  it('writes the member’s value, or nothing when they leave it empty, and counts each as a change', () => {
    const changed = mapped(
      { 'fireSafety.smokingPlace': { value: 'În curtea din spate' } },
      {
        'workplace-1': { values: { assemblyPoint: 'Curtea interioară' } },
        'workplace-2': { values: { assemblyPoint: null } },
      }
    );
    expect(changed.blockers).toEqual([]);
    expect(changed.payload.fire_safety).toMatchObject({ smoking_place: 'În curtea din spate' });
    expect(points(changed.payload.workplaces)).toEqual(['Curtea interioară', null]);
    expect(changed.payload.quality.fireSafety.changed).toBe(1);
    expect(changed.payload.quality.workplaces.changed).toBe(2);

    const emptied = mapped({ ...keptBoth, 'fireSafety.smokingPlace': { value: null } });
    expect(emptied.blockers).toEqual([]);
    expect(emptied.payload.fire_safety).not.toHaveProperty('smoking_place');
    expect(emptied.payload.quality.fireSafety.changed).toBe(1);
  });

  it('asks nothing of a place another smoking rule drops, nor of a workplace left out', () => {
    const pointsKept = {
      'assemblyPoints.workplace-1': { option: 0 },
      'assemblyPoints.workplace-2': { option: 0 },
    };
    const forbidden = mapped(
      { ...pointsKept, 'fireSafety.smokingPolicy': { value: 'forbidden_everywhere' } },
      { 'workplace-2': { included: false } }
    );

    const choices = (blockers: { code: string }[]) =>
      blockers.filter((blocker) => blocker.code === 'choice');
    expect(choices(forbidden.blockers)).toEqual([]);
    expect(forbidden.payload.fire_safety).not.toHaveProperty('smoking_place');
    expect(forbidden.payload.workplaces).toHaveLength(1);
    expect(
      choices(
        mapped(
          { 'assemblyPoints.workplace-1': { option: 0 } },
          { 'workplace-2': { included: false } }
        ).blockers
      )
    ).toEqual([{ path: 'fireSafety.smokingPlace', code: 'choice' }]);
  });

  it('asks into an existing client only for a value the import writes', () => {
    const existing: ExistingRecords = {
      ...noExistingRecords,
      client: {},
      fireSafety: { smoking_policy: 'designated_places', smoking_place: 'Lângă depozit' },
      workplaces: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          name: 'Sediu',
          address_line: null,
          assembly_point: 'Curtea din spate',
        },
        {
          id: '00000000-0000-4000-8000-000000000002',
          name: 'Magazin',
          address_line: null,
          assembly_point: null,
        },
      ],
    };

    const kept = mapped({}, {}, existing);
    expect(kept.blockers).toEqual([{ path: 'assemblyPoints.workplace-2', code: 'choice' }]);
    expect(kept.payload.quality.fireSafety.kept).toBe(1);

    const taken = mapped(
      {
        'fireSafety.smokingPlace': { replace: true },
        'assemblyPoints.workplace-2': { option: 0 },
      },
      { 'workplace-1': { replace: ['assemblyPoint'] } },
      existing
    );
    expect(taken.blockers).toEqual([{ path: 'assemblyPoints.workplace-1', code: 'choice' }]);
    expect(taken.payload.fire_safety).toMatchObject({
      smoking_place: 'La poarta unității',
      replace: ['smoking_place'],
    });

    const noPlace = { ...existing, fireSafety: { smoking_policy: 'designated_places' } };
    expect(mapped({}, {}, noPlace).blockers).toContainEqual({
      path: 'fireSafety.smokingPlace',
      code: 'choice',
    });
  });

  it('asks again on an import saved before, where the document’s spelling alone was selected', () => {
    const { payload, blockers } = mapped(
      { 'fireSafety.smokingPlace': { value: 'LA POARTA UNITATII' } },
      {
        'workplace-1': { values: { assemblyPoint: 'PARCAREA DIN FATA CLADIRII' } },
        'workplace-2': { values: { assemblyPoint: 'Curtea interioară' } },
      }
    );

    expect(blockers).toEqual([
      { path: 'fireSafety.smokingPlace', code: 'choice' },
      { path: 'assemblyPoints.workplace-1', code: 'choice' },
    ]);
    expect(payload.workplaces[1]).toMatchObject({ assembly_point: 'Curtea interioară' });
  });
});

describe('the dangerous substances', () => {
  const named = (name: string) => ({ name, ...quoted(fire) });
  const noneUsed = fact('fireSafety.substancesState', 'none', fire);
  const proposalWith = (substances: Reading['substances'], facts: Reading['facts'] = []) =>
    proposalOf(reading({ facts: [...reading().facts, ...facts], substances }));
  const twoNamed = proposalWith([named('Detergenți'), named('Ulei uzat')]);
  const mapped = (
    proposal: Proposal,
    fields: ImportChanges['fields'] = {},
    items: ImportChanges['items'] = {},
    existing: ExistingRecords | null = null
  ) =>
    toClientPayload({
      proposal,
      changes: { fields, items },
      intoExistingClient: existing !== null,
      existing: existing ?? noExistingRecords,
    });
  const existingClient = (state: string, substances: string[] = []): ExistingRecords => ({
    ...noExistingRecords,
    client: { legal_name: 'BRUTĂRIA FICTIVĂ S.R.L.', cui: '12345674' },
    fireSafety: { substances_state: state },
    substances: substances.map((name) => ({ name })),
  });
  const substanceBlockers = (blockers: { path: string }[]) =>
    blockers.filter((blocker) => /^(fireSafety\.substancesState|substances\.)/.test(blocker.path));

  it('writes "listed" and each substance named, by name only', () => {
    const { payload, blockers } = mapped(twoNamed);

    expect(substanceBlockers(blockers)).toEqual([]);
    expect(payload.fire_safety).toMatchObject({ substances_state: 'listed' });
    expect(payload.fire_substances).toEqual([{ name: 'Detergenți' }, { name: 'Ulei uzat' }]);
  });

  it('writes a declared "none" with no substance', () => {
    const { payload } = mapped(proposalWith([], [noneUsed]));

    expect(payload.fire_safety).toMatchObject({ substances_state: 'none' });
    expect(payload.fire_substances).toEqual([]);
  });

  it('writes no answer where the documents say nothing, and does not wait for one', () => {
    const { payload, blockers } = mapped(proposalWith([]));

    expect(payload.fire_safety).not.toHaveProperty('substances_state');
    expect(payload.fire_substances).toEqual([]);
    expect(substanceBlockers(blockers)).toEqual([]);
  });

  it('waits for the member where documents name substances and say none are used', () => {
    const proposal = proposalWith([named('Dezinfectant')], [noneUsed]);
    const waiting = mapped(proposal);
    expect(substanceBlockers(waiting.blockers)).toEqual([
      { path: 'fireSafety.substancesState', code: 'choice' },
    ]);
    expect(waiting.payload.fire_substances).toEqual([]);

    const chosen = mapped(proposal, { 'fireSafety.substancesState': { option: 1 } });
    expect(substanceBlockers(chosen.blockers)).toEqual([]);
    expect(chosen.payload.fire_safety).toMatchObject({ substances_state: 'listed' });
    expect(chosen.payload.fire_substances).toEqual([{ name: 'Dezinfectant' }]);
  });

  it('leaves out a substance the member left out, and counts it', () => {
    const { payload } = mapped(twoNamed, {}, { 'substance-1': { included: false } });

    expect(payload.fire_substances).toEqual([{ name: 'Ulei uzat' }]);
    expect(payload.quality.substances).toEqual({ changed: 0, unticked: 1, kept: 0 });
  });

  it('writes no substance under another answer the member gave, and counts the change', () => {
    const undecided = mapped(twoNamed, { 'fireSafety.substancesState': { value: null } });
    expect(undecided.payload.fire_safety).not.toHaveProperty('substances_state');
    expect(undecided.payload.fire_substances).toEqual([]);
    expect(undecided.payload.quality.fireSafety.changed).toBe(1);

    const none = mapped(twoNamed, { 'fireSafety.substancesState': { value: 'none' } });
    expect(none.payload.fire_safety).toMatchObject({ substances_state: 'none' });
    expect(none.payload.fire_substances).toEqual([]);
    expect(none.payload.quality.fireSafety.changed).toBe(1);
  });

  it('writes the name the member gave a substance', () => {
    const { payload } = mapped(
      twoNamed,
      {},
      { 'substance-2': { values: { name: 'Ulei de motor' } } }
    );

    expect(payload.fire_substances).toEqual([{ name: 'Detergenți' }, { name: 'Ulei de motor' }]);
    expect(payload.quality.substances.changed).toBe(1);
  });

  it('gives an existing client whose answer is undecided the documents’ answer and substances', () => {
    const { payload, blockers } = mapped(twoNamed, {}, {}, existingClient('undecided'));

    expect(substanceBlockers(blockers)).toEqual([]);
    expect(payload.fire_safety).toMatchObject({ substances_state: 'listed' });
    expect(payload.fire_substances).toHaveLength(2);
  });

  it('keeps an existing client’s decided answer, and adds no substance under "none"', () => {
    const { payload, blockers } = mapped(twoNamed, {}, {}, existingClient('none'));

    expect(substanceBlockers(blockers)).toEqual([]);
    expect(payload.fire_safety).not.toHaveProperty('replace');
    expect(payload.fire_substances).toEqual([]);
    expect(payload.quality.fireSafety.kept).toBe(1);
  });

  it('keeps an existing client’s decided answer where the documents disagree, without waiting', () => {
    const { blockers } = mapped(
      proposalWith([named('Dezinfectant')], [noneUsed]),
      {},
      {},
      existingClient('none')
    );

    expect(substanceBlockers(blockers)).toEqual([]);
  });

  it('takes the documents’ answer over an existing client’s when the member does', () => {
    const { payload } = mapped(
      twoNamed,
      { 'fireSafety.substancesState': { replace: true } },
      {},
      existingClient('none')
    );

    expect(payload.fire_safety).toMatchObject({
      substances_state: 'listed',
      replace: ['substances_state'],
    });
    expect(payload.fire_substances).toHaveLength(2);
  });

  it('adds to an existing list only a substance it does not name already', () => {
    const { payload } = mapped(twoNamed, {}, {}, existingClient('listed', ['DETERGENTI']));

    expect(payload.fire_substances).toEqual([{ name: 'Ulei uzat' }]);
    expect(payload.quality.substances.kept).toBe(1);
  });

  it('waits on a declared "none" taken over a list the client keeps, which the database refuses', () => {
    const { blockers } = mapped(
      proposalWith([], [noneUsed]),
      { 'fireSafety.substancesState': { replace: true } },
      {},
      existingClient('listed', ['Propan'])
    );

    expect(substanceBlockers(blockers)).toEqual([
      { path: 'fireSafety.substancesState', code: 'invalid' },
    ]);
  });

  it('waits on a name the checks found too long until the member writes another', () => {
    const long = withChecks(proposalWith([named('x'.repeat(161))]), { files: {} });

    expect(substanceBlockers(mapped(long).blockers)).toEqual([
      { path: 'substances.0.name', code: 'invalid' },
    ]);
    expect(
      substanceBlockers(
        mapped(long, {}, { 'substance-1': { values: { name: 'Vopsea' } } }).blockers
      )
    ).toEqual([]);
  });

  it('confirms a proposal stored before the substances were read as before', () => {
    const stored = structuredClone(proposalOf(reading())) as unknown as Record<string, unknown>;
    delete stored.substances;
    delete (stored.fireSafety as Record<string, unknown>).substancesState;
    const { payload, blockers } = mapped(proposalSchema.parse(stored));

    expect(substanceBlockers(blockers)).toEqual([]);
    expect(payload.fire_substances).toEqual([]);
  });
});
