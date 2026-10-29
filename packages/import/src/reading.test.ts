import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { proposalChoices, proposalSchema, proposedIncluded } from './proposal';
import { fromWire, type Reading, readingAnswer, toProposal } from './reading';
import { wireAnswer } from './test/fixtures';

describe('fromWire', () => {
  const proposal = fromWire(wireAnswer());

  it('merges values that differ only in diacritics and keeps every source', () => {
    expect(proposal.client.legalName.options).toEqual([
      {
        value: 'BRUTĂRIA FICTIVĂ S.R.L.',
        sources: [
          { file: 'Dosar/Decizia 1.docx', quote: 'BRUTĂRIA FICTIVĂ S.R.L.' },
          { file: 'Dosar/PSI/Lista mijloace.doc', quote: 'BRUTĂRIA FICTIVĂ S.R.L.' },
        ],
        otherCompanyName: null,
      },
    ]);
  });

  it('turns documents that disagree into a choice, marking another company’s value', () => {
    expect(proposalChoices(proposal)).toEqual([
      {
        path: 'client.legalRepresentativeName',
        options: [
          expect.objectContaining({ value: 'Vasilescu Andrei', otherCompanyName: null }),
          expect.objectContaining({
            value: 'Petrescu Ion',
            otherCompanyName: 'ATELIERUL INVENTAT S.R.L.',
          }),
        ],
      },
    ]);
  });

  it('normalises the CUI, the county and the numbers', () => {
    expect(proposal.client.cui.options[0]!.value).toBe('12345674');
    expect(proposal.client.countyCode.options[0]!.value).toBe('TM');
    expect(proposal.trainingSchedule.workerTrainingIntervalMonths.options[0]!.value).toBe(6);
    expect(proposal.fireEquipment[0]!.capacity).toBe(6);
    expect(proposal.client.contactName.options).toEqual([]);
  });

  it('reads Bucharest’s county however it is written', () => {
    const counties = ['Mun. București', 'Municipiul Bucuresti, Sector 3', 'Sector 3', 'sectorul 6'];
    for (const county of counties) {
      const answer = wireAnswer();
      answer.workplaces[0]!.county = county;
      expect(fromWire(answer).workplaces[0]!.countyCode, county).toBe('B');
    }
  });

  it('ties equipment to its workplace and gathers the workplace’s rooms', () => {
    const [office] = proposal.workplaces;
    expect(proposal.fireEquipment.map((equipment) => equipment.workplace)).toEqual([
      { name: 'Sediu', id: office!.id },
      { name: 'Sediul', id: office!.id },
    ]);
    expect(office!.rooms).toEqual(['laborator', 'birou']);
  });

  it('gives an equipment table naming several positions to each of them', () => {
    expect(
      proposal.protectiveEquipment.map((entry) => [entry.jobPosition.name, entry.item])
    ).toEqual([
      ['Brutar', 'Mănuși termorezistente'],
      ['Vânzător', 'Mănuși termorezistente'],
    ]);
    expect(proposal.protectiveEquipment.map((entry) => entry.jobPosition.id)).toEqual(
      proposal.jobPositions.map((position) => position.id)
    );
  });

  it('keeps an equipment entry that names no post, with its post unresolved', () => {
    const answer = wireAnswer();
    answer.protectiveEquipment[0]!.jobPositions = [];

    expect(fromWire(answer).protectiveEquipment).toEqual([
      expect.objectContaining({
        item: 'Mănuși termorezistente',
        jobPosition: { name: null, id: null },
      }),
    ]);
  });

  it('reads a Romanian date, a role once, and drops blank notes', () => {
    expect(proposal.employees[0]).toMatchObject({ hiredAt: '2020-03-01', cnp: null });
    expect(proposal.responsiblePersons[0]!.roles).toEqual(['workplace_manager', 'first_aid']);
    expect(proposal.notes).toEqual(['Decizia de numire a echipei de intervenție lipsește.']);
    expect(proposal.flags).toEqual([]);
  });

  it('refuses a role outside the schema', () => {
    const answer = wireAnswer();
    answer.responsiblePersons[0]!.roles = ['site_manager'];

    expect(() => fromWire(answer)).toThrow(ZodError);
  });
});

describe('toProposal', () => {
  it('joins the readings of the documents and of a scan into one proposal', () => {
    const documents = readingAnswer.parse(wireAnswer());
    const scan = readingAnswer.parse({
      ...wireAnswer(),
      facts: [
        {
          field: 'client.tradeRegisterNumber',
          value: 'J35/456/2015',
          file: 'Dosar/Scan.pdf',
          quote: 'J35/456/2015',
          otherCompany: '',
        },
      ],
      workplaces: [],
      fireEquipment: [],
      protectiveEquipment: [],
      employees: [],
      notes: [],
    });

    const proposal = toProposal(documents, scan);

    expect(proposal.client.tradeRegisterNumber.options.map((option) => option.value)).toEqual([
      'J35/123/2015',
      'J35/456/2015',
    ]);
    expect(proposal.jobPositions.map((position) => [position.id, position.name])).toEqual([
      ['position-1', 'Brutar'],
      ['position-2', 'Vânzător'],
    ]);
  });

  const scanOf = (overrides: Partial<Reading>): Reading =>
    readingAnswer.parse({
      ...wireAnswer(),
      facts: [],
      workplaces: [],
      jobPositions: [],
      responsiblePersons: [],
      fireEquipment: [],
      protectiveEquipment: [],
      employees: [],
      notes: [],
      ...overrides,
    });
  const scanFile = 'Dosar/Contract 2019.pdf (pagina 1)';
  const quoted = { file: scanFile, quote: 'str. Exemplului nr. 5', otherCompany: null };

  it('joins a workplace a scan names otherwise at the same address, and its references', () => {
    const documents = readingAnswer.parse(wireAnswer());
    const scan = scanOf({
      workplaces: [
        {
          name: 'Sediu social',
          county: 'TM',
          locality: 'Timișoara',
          addressLine: 'Str. Exemplului, nr. 5',
          isRegisteredOffice: true,
          activity: 'Producție',
          rooms: ['vestiar'],
          ...quoted,
        },
      ],
      fireInstallations: [
        { workplace: 'Sediu social', kind: 'detection_alarm', description: null, ...quoted },
      ],
    });

    const proposal = toProposal(documents, scan);

    expect(proposal.workplaces).toHaveLength(2);
    const [office] = proposal.workplaces;
    expect(office).toMatchObject({
      id: 'workplace-1',
      name: 'Sediu',
      isRegisteredOffice: true,
      activity: 'Producție',
      rooms: ['laborator', 'vestiar', 'birou'],
    });
    expect(office!.sources.map((source) => source.file)).toEqual([
      'Dosar/Decizia 1.docx',
      scanFile,
    ]);
    expect(proposal.fireInstallations[0]!.workplace).toEqual({
      name: 'Sediu social',
      id: 'workplace-1',
    });
  });

  it('keeps workplaces at different addresses or with no address apart', () => {
    const documents = readingAnswer.parse(wireAnswer());
    const scan = scanOf({
      workplaces: [
        {
          name: 'Depozit',
          county: 'TM',
          locality: 'Lugoj',
          addressLine: 'str. Exemplului nr. 5',
          isRegisteredOffice: false,
          activity: null,
          rooms: [],
          ...quoted,
        },
        {
          name: 'Chioșc',
          county: null,
          locality: null,
          addressLine: null,
          isRegisteredOffice: false,
          activity: null,
          rooms: [],
          ...quoted,
        },
      ],
    });

    expect(toProposal(documents, scan).workplaces.map((workplace) => workplace.name)).toEqual([
      'Sediu',
      'Magazin',
      'Depozit',
      'Chioșc',
    ]);
  });

  it('joins the same position, person and employee read twice, filling what one lacks', () => {
    const documents = readingAnswer.parse(wireAnswer());
    const scan = scanOf({
      jobPositions: [
        {
          name: 'vânzător',
          staffCategory: 'execution',
          trainingIntervalMonths: null,
          workZone: 'Magazin',
          activities: null,
          managementOnly: false,
          needsProtectiveEquipment: null,
          ...quoted,
        },
      ],
      responsiblePersons: [
        {
          fullName: 'IONESCU MARIA',
          jobTitle: null,
          roles: ['fire_safety_coordinator'],
          workplace: null,
          ...quoted,
        },
      ],
      employees: [
        {
          role: 'workers_representative',
          lastName: 'Georgescu',
          firstName: 'Dan',
          cnp: '1850315350011',
          birthDate: null,
          jobTitle: null,
          hiredAt: null,
          ...quoted,
        },
      ],
    });

    const proposal = toProposal(documents, scan);

    expect(proposal.jobPositions[1]).toMatchObject({
      id: 'position-2',
      name: 'Vânzător',
      staffCategory: 'execution',
      workZone: 'Magazin',
    });
    expect(proposal.responsiblePersons).toHaveLength(1);
    expect(proposal.responsiblePersons[0]!.roles).toEqual([
      'workplace_manager',
      'first_aid',
      'fire_safety_coordinator',
    ]);
    expect(proposal.employees).toEqual([
      expect.objectContaining({
        id: 'employee-1',
        cnp: '1850315350011',
        jobTitle: 'vânzător',
        hiredAt: '2020-03-01',
      }),
    ]);
    expect(proposal.employees[0]!.sources).toHaveLength(2);
  });

  it('keeps apart two employees of one name whose CNPs differ', () => {
    const employee = {
      role: 'workers_representative' as const,
      lastName: 'Pop',
      firstName: 'Maria',
      birthDate: null,
      jobTitle: 'vânzător',
      hiredAt: null,
      ...quoted,
    };
    const proposal = toProposal(
      scanOf({
        employees: [
          { ...employee, cnp: '2850315350016' },
          { ...employee, cnp: '2900101350010' },
          { ...employee, cnp: null },
        ],
      })
    );

    expect(proposal.employees.map((each) => each.cnp)).toEqual(['2850315350016', '2900101350010']);
  });

  it('takes the marker of an image label off a source’s file, keeping its page', () => {
    const proposal = toProposal(
      scanOf({
        facts: [
          {
            field: 'client.legalName',
            value: 'BRUTĂRIA FICTIVĂ S.R.L.',
            file: `${scanFile} (image follows)`,
            quote: 'BRUTĂRIA FICTIVĂ',
            otherCompany: null,
          },
          {
            field: 'client.cui',
            value: '12345674',
            file: `=== FILE: ${scanFile} ===`,
            quote: '12345674',
            otherCompany: null,
          },
        ],
      })
    );

    expect(proposal.client.legalName.options[0]!.sources[0]!.file).toBe(scanFile);
    expect(proposal.client.cui.options[0]!.sources[0]!.file).toBe(scanFile);
  });
});

describe('a post that is only the running of the firm', () => {
  const evaluation = 'Dosar/Evaluare riscuri.docx';
  const post = (name: string, managementOnly: boolean, activities = '') => ({
    name,
    staffCategory: 'technical_administrative',
    trainingIntervalMonths: '',
    workZone: '',
    activities,
    managementOnly,
    needsProtectiveEquipment: '',
    file: evaluation,
    quote: name,
    otherCompany: '',
  });

  it('is proposed unticked, while a post that adds a trade is proposed ticked', () => {
    const answer = wireAnswer();
    answer.jobPositions.push(
      post('Administrator', true, 'conducerea firmei, conduce autoturismul în interes de serviciu'),
      post('Administrator – vânzător', false)
    );

    const positions = fromWire(answer).jobPositions;

    expect(positions.map((position) => [position.name, proposedIncluded(position)])).toEqual([
      ['Brutar', true],
      ['Vânzător', true],
      ['Administrator', false],
      ['Administrator – vânzător', true],
    ]);
    expect(positions[2]).toMatchObject({
      managementOnly: true,
      activities: 'conducerea firmei, conduce autoturismul în interes de serviciu',
    });
  });

  it('is ticked when another reading shows someone holding it', () => {
    const documents = readingAnswer.parse({
      ...wireAnswer(),
      jobPositions: [post('Administrator', true)],
    });
    const scan = readingAnswer.parse({
      ...wireAnswer(),
      jobPositions: [post('ADMINISTRATOR', false)],
    });

    const [position] = toProposal(documents, scan).jobPositions;

    expect(position).toMatchObject({ name: 'Administrator', managementOnly: false });
    expect(proposedIncluded(position!)).toBe(true);
  });

  it('is ticked from a scan’s page read before the reading said it', () => {
    const page = readingAnswer.parse(wireAnswer());
    for (const position of page.jobPositions) {
      delete (position as { managementOnly?: boolean }).managementOnly;
    }

    expect(toProposal(page).jobPositions.map((position) => position.managementOnly)).toEqual([
      false,
      false,
    ]);
  });

  it('is read from a stored proposal that predates it as ticked', () => {
    const stored = JSON.parse(JSON.stringify(fromWire(wireAnswer())));
    for (const position of stored.jobPositions) delete position.managementOnly;

    expect(
      proposalSchema.parse(stored).jobPositions.map((position) => proposedIncluded(position))
    ).toEqual([true, true]);
  });
});

describe('a workplace’s fire-safety values', () => {
  const fire = 'Dosar/PSI/Lista mijloace.doc';

  it('fill the workplace they name, each with its own passage', () => {
    const [office, shop] = fromWire(wireAnswer()).workplaces;

    expect(office).toMatchObject({
      kind: null,
      floorAreaM2: 1250,
      extinguisherNorm: 'commercial_200',
      assemblyPoint: 'parcarea din spatele clădirii',
      combustibleMaterials: 'făină, ambalaje din carton',
      ignitionSources: null,
    });
    expect(office!.fieldSources.floorAreaM2).toEqual([
      { file: fire, quote: 'suprafața utilă 1.250 mp' },
    ]);
    expect(office!.sources).toHaveLength(1);
    expect(shop).toMatchObject({ floorAreaM2: null, assemblyPoint: null, fieldSources: {} });
  });

  it('keep the first value, leave another company’s, and note a workplace none matches', () => {
    const answer = wireAnswer();
    const [area] = answer.workplaceFacts;
    answer.workplaceFacts.push(
      { ...area!, value: '1250', quote: 'aria 1250 mp' },
      { ...area!, value: '900' },
      { ...area!, field: 'ignitionSources', value: 'cuptor', otherCompany: 'ATELIERUL INVENTAT' },
      { ...area!, workplace: 'Depozit Arad', field: 'kind', value: 'șantier mobil' }
    );

    const proposal = fromWire(answer);

    expect(proposal.workplaces[0]).toMatchObject({ floorAreaM2: 1250, ignitionSources: null });
    expect(proposal.workplaces[0]!.fieldSources.floorAreaM2).toHaveLength(2);
    expect(proposal.notes.at(-1)).toContain('«Depozit Arad»');
  });

  it('read a mobile site, an area written with decimals, and an unknown norm as written', () => {
    const answer = wireAnswer();
    answer.workplaceFacts = [
      {
        ...answer.workplaceFacts[0]!,
        workplace: 'Magazin',
        field: 'kind',
        value: 'Șantier temporar',
      },
      { ...answer.workplaceFacts[0]!, workplace: 'Magazin', value: '84,6 m²' },
      {
        ...answer.workplaceFacts[0]!,
        workplace: 'Magazin',
        field: 'extinguisherNorm',
        value: '1/200 mp',
      },
    ];

    expect(fromWire(answer).workplaces[1]).toMatchObject({
      kind: 'mobile_site',
      floorAreaM2: 85,
      extinguisherNorm: '1/200 mp',
    });
  });

  it('go to the only workplace when the passage names none the reading has', () => {
    const answer = wireAnswer();
    answer.workplaces.pop();
    answer.workplaceFacts[0]!.workplace = 'Laborator';

    expect(fromWire(answer).workplaces[0]!.floorAreaM2).toBe(1250);
  });
});

describe('the client’s waste, third parties and training without a period', () => {
  const proposal = fromWire(wireAnswer());

  it('are read as yes or no, and the waste kinds once each', () => {
    expect(proposal.fireSafety.wasteKinds.options.map((option) => option.value)).toEqual([
      'deșeuri menajere; carton și hârtie',
    ]);
    expect(proposal.fireSafety.wasteCollectors.options[0]!.value).toBe('vânzătorii de serviciu');
    expect(proposal.fireSafety.hasThirdParties.options[0]!.value).toBe('true');
    expect(
      proposal.trainingSchedule.administrativeTrainingNotApplicable.options.map(
        (option) => option.value
      )
    ).toEqual(['true']);
    expect(proposal.trainingSchedule.workerTrainingNotApplicable.options).toEqual([]);
  });

  it('drop a yes or no the model wrote otherwise', () => {
    const answer = wireAnswer();
    const fact = answer.facts.find((each) => each.field === 'fireSafety.hasThirdParties')!;
    fact.value = 'posibil';

    expect(fromWire(answer).fireSafety.hasThirdParties.options).toEqual([]);
  });
});

describe('a post’s protective equipment decision', () => {
  it('is that it needs some when it has entries, and none when the list says so', () => {
    const answer = wireAnswer();
    answer.jobPositions.push({
      ...answer.jobPositions[0]!,
      name: 'Contabil',
      needsProtectiveEquipment: 'false',
    });
    answer.jobPositions[0]!.needsProtectiveEquipment = 'false';

    expect(
      fromWire(answer).jobPositions.map((position) => [
        position.name,
        position.needsProtectiveEquipment,
      ])
    ).toEqual([
      ['Brutar', true],
      ['Vânzător', true],
      ['Contabil', false],
    ]);
  });

  it('is undecided when the list does not name the post', () => {
    const answer = wireAnswer();
    answer.protectiveEquipment = [];

    expect(
      fromWire(answer).jobPositions.map((position) => position.needsProtectiveEquipment)
    ).toEqual([true, null]);
  });
});

describe('a proposal or a scan’s page that predates the fire-safety values', () => {
  it('reads with them empty', () => {
    const page = readingAnswer.parse(wireAnswer()) as Partial<Reading>;
    delete page.workplaceFacts;
    for (const position of page.jobPositions!) {
      delete (position as { needsProtectiveEquipment?: unknown }).needsProtectiveEquipment;
    }
    const fromPage = toProposal(page as Reading);
    expect(fromPage.workplaces[0]!.floorAreaM2).toBeNull();

    const stored = JSON.parse(JSON.stringify(fromWire(wireAnswer())));
    delete stored.trainingSchedule.administrativeTrainingNotApplicable;
    delete stored.trainingSchedule.workerTrainingNotApplicable;
    for (const name of ['wasteKinds', 'wasteCollectors', 'hasThirdParties']) {
      delete stored.fireSafety[name];
    }
    for (const workplace of stored.workplaces) {
      for (const name of ['kind', 'floorAreaM2', 'fieldSources', 'assemblyPoint']) {
        delete workplace[name];
      }
    }
    for (const position of stored.jobPositions) delete position.needsProtectiveEquipment;

    const parsed = proposalSchema.parse(stored);
    expect(parsed.fireSafety.hasThirdParties).toEqual({ options: [] });
    expect(parsed.trainingSchedule.workerTrainingNotApplicable).toEqual({ options: [] });
    expect(parsed.workplaces[0]).toMatchObject({ floorAreaM2: null, fieldSources: {} });
    expect(parsed.jobPositions[0]!.needsProtectiveEquipment).toBeNull();
  });
});

describe('proposedIncluded', () => {
  it('proposes the legal representative as an employee unticked, the workers’ one ticked', () => {
    const proposal = fromWire(wireAnswer());
    const employee = proposal.employees[0]!;

    expect(proposedIncluded(employee)).toBe(true);
    expect(proposedIncluded({ ...employee, role: 'legal_representative' })).toBe(false);
    expect(proposedIncluded({ ...employee, otherCompanyName: 'ATELIERUL INVENTAT S.R.L.' })).toBe(
      false
    );
    expect(proposedIncluded(proposal.workplaces[0]!)).toBe(true);
  });
});
