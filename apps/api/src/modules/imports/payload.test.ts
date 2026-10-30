import { type Proposal, type Reading, toProposal, withChecks } from '@ssm-usor/import';
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
    expect(payload.client).not.toHaveProperty('worker_training_interval_months');
    expect(payload.workplaces.map((row) => row.key)).toEqual(['workplace-1']);
    expect(payload.equipment[1]).toMatchObject({ quantity: 2 });
    // The emergency lighting stood at the workplace the member left out.
    expect(blockers).toEqual([
      { path: 'fireInstallations.0.workplace', code: 'unknown_reference' },
    ]);
    expect(payload.quality.client).toEqual({ changed: 2, unticked: 0, kept: 0 });
    expect(payload.quality.trainingSchedule).toEqual({ changed: 0, unticked: 1, kept: 0 });
    expect(payload.quality.workplaces).toEqual({ changed: 0, unticked: 1, kept: 0 });
    expect(payload.quality.protectiveEquipment).toEqual({ changed: 1, unticked: 0, kept: 0 });
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
        changes: { fields: {}, items },
        intoExistingClient: false,
        existing: noExistingRecords,
      });

    const { payload, blockers } = payloadWith({});
    expect(blockers).toEqual([]);
    expect(payload.client).toMatchObject({ administrative_training_not_applicable: true });
    expect(payload.fire_safety).toEqual({
      smoking_policy: 'forbidden_everywhere',
      waste_kinds: ['deșeuri menajere', 'carton'],
      waste_collectors: 'vânzătorii de serviciu',
      has_third_parties: false,
      worker_training_interval_months: 6,
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
                },
          items: {},
        },
        intoExistingClient: existing !== noExistingRecords,
        existing,
      });

    expect(payloadWith(null).blockers).toEqual([
      { path: 'fireSafety.smokingPolicy', code: 'choice' },
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

  it('blocks a category given both an interval and "not applicable"', () => {
    const base = reading();
    const { blockers } = toClientPayload({
      proposal: proposalOf(
        reading({
          facts: [...base.facts, fact('trainingSchedule.workerTrainingNotApplicable', 'da')],
        })
      ),
      changes: null,
      intoExistingClient: false,
      existing: noExistingRecords,
    });

    expect(blockers).toEqual([
      { path: 'trainingSchedule.workerTrainingNotApplicable', code: 'invalid' },
    ]);
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
      'fireSafety.administrativeTrainingIntervalMonths': { value: 6 },
    });
    expect(written.payload.fire_safety).toMatchObject({
      training_first_month: 9,
      administrative_training_interval_months: 6,
    });
  });

  it('writes a staff category none of the posts is in as without periodic training', () => {
    const base = reading();
    const category = (jobPosition: string) => ({
      jobPosition,
      field: 'staffCategory' as const,
      value: 'execution',
      ...quoted(),
    });
    const proposal = proposalOf(
      reading({ jobPositionFacts: [category('Brutar'), category('Vânzător')] })
    );

    const { payload, blockers } = toClientPayload({
      proposal,
      changes: null,
      intoExistingClient: false,
      existing: noExistingRecords,
    });

    expect(blockers).toEqual([]);
    expect(payload.client).toMatchObject({
      worker_training_interval_months: 6,
      administrative_training_not_applicable: true,
    });
    expect(base.facts).not.toContainEqual(
      expect.objectContaining({ field: 'trainingSchedule.administrativeTrainingNotApplicable' })
    );
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
