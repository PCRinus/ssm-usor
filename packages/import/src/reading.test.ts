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

  it('corrects capitals and diacritics and keeps the document’s spelling beside', () => {
    expect(proposal.protectiveEquipment[0]).toMatchObject({
      risk: 'Arsuri',
      item: 'Mănuși termorezistente',
      spelling: { risk: 'ARSURI', item: 'Manusi termorezistente' },
    });
    expect(proposal.jobPositions[0]!.spelling).toEqual({});
    expect(proposal.client.legalName.options[0]!.value).toBe('BRUTĂRIA FICTIVĂ S.R.L.');
  });

  it('corrects a text field’s options, a waste kind at a time, and leaves names as written', () => {
    const answer = wireAnswer();
    answer.facts.push(
      {
        field: 'fireSafety.smokingPlace',
        value: 'ÎN CURTEA INTERIOARĂ',
        file: 'Dosar/Decizia 1.docx',
        quote: 'Locul pentru fumat: IN CURTEA INTERIOARA',
        otherCompany: '',
      },
      {
        field: 'client.legalRepresentativeRole',
        value: 'ADMINISTRATOR',
        file: 'Dosar/Decizia 1.docx',
        quote: 'ADMINISTRATOR',
        otherCompany: '',
      }
    );
    answer.facts = answer.facts.map((fact) =>
      fact.field === 'fireSafety.wasteKinds'
        ? { ...fact, value: 'DEȘEURI MENAJERE; PET', quote: 'DESEURI MENAJERE, PET' }
        : fact.field === 'client.legalRepresentativeName'
          ? { ...fact, value: fact.value.toUpperCase() }
          : fact
    );
    answer.workplaces[1]!.name = 'MAGAZIN CENTRAL';
    answer.workplaces[1]!.addressLine = 'STR. PIAȚA MICĂ NR. 2';

    const read = fromWire(answer);

    expect(read.fireSafety.smokingPlace.options).toEqual([
      expect.objectContaining({ value: 'În curtea interioară', spelling: 'IN CURTEA INTERIOARA' }),
    ]);
    expect(read.fireSafety.wasteKinds.options[0]).toMatchObject({
      value: 'Deșeuri menajere; PET',
      spelling: 'DESEURI MENAJERE; PET',
    });
    expect(read.client.legalRepresentativeRole.options.map((option) => option.value)).toEqual([
      'Administrator',
    ]);
    expect(read.client.legalRepresentativeName.options[0]).toMatchObject({
      value: 'VASILESCU ANDREI',
    });
    expect(read.client.legalRepresentativeName.options[0]).not.toHaveProperty('spelling');
    expect(read.workplaces[1]).toMatchObject({
      name: 'Magazin central',
      addressLine: 'STR. PIAȚA MICĂ NR. 2',
      spelling: { name: 'MAGAZIN CENTRAL' },
    });
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

  it('reads a Romanian date, a role once with its passage, and drops blank notes', () => {
    expect(proposal.employees[0]).toMatchObject({ hiredAt: '2020-03-01', cnp: null });
    expect(proposal.responsiblePersons[0]!.roles).toEqual(['workplace_manager', 'first_aid']);
    expect(proposal.responsiblePersons[0]!.roleSources).toEqual({
      workplace_manager: [
        { file: 'Dosar/Decizia 1.docx', quote: 'conducător al locului de muncă' },
      ],
      first_aid: [
        {
          file: 'Dosar/Decizia 1.docx',
          quote: 'lucrător desemnat pentru acordarea primului ajutor',
        },
      ],
    });
    expect(proposal.notes).toEqual(['Decizia de numire a echipei de intervenție lipsește.']);
    expect(proposal.flags).toEqual([]);
  });

  it('refuses a role outside the schema', () => {
    const answer = wireAnswer();
    answer.responsiblePersons[0]!.roles[0]!.role = 'site_manager';

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
          trainingIntervalMonths: null,
          workZone: 'Magazin',
          managementOnly: false,
          needsProtectiveEquipment: null,
          ...quoted,
        },
      ],
      jobPositionFacts: [
        { jobPosition: 'Vânzător', field: 'staffCategory', value: 'execuție', ...quoted },
      ],
      responsiblePersons: [
        {
          fullName: 'IONESCU MARIA',
          jobTitle: null,
          roles: [{ role: 'fire_safety_coordinator', file: scanFile, quote: 'responsabil PSI' }],
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
      fieldSources: { staffCategory: [{ file: scanFile, quote: 'str. Exemplului nr. 5' }] },
    });
    expect(proposal.responsiblePersons).toHaveLength(1);
    expect(proposal.responsiblePersons[0]!.roles).toEqual([
      'workplace_manager',
      'first_aid',
      'fire_safety_coordinator',
    ]);
    expect(proposal.responsiblePersons[0]!.roleSources.fire_safety_coordinator).toEqual([
      { file: scanFile, quote: 'responsabil PSI' },
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
  const post = (name: string, managementOnly: boolean) => ({
    name,
    trainingIntervalMonths: '',
    workZone: '',
    managementOnly,
    needsProtectiveEquipment: '',
    file: evaluation,
    quote: name,
    otherCompany: '',
  });

  it('is proposed unticked, while a post that adds a trade is proposed ticked', () => {
    const answer = wireAnswer();
    answer.jobPositions.push(post('Administrator', true), post('Administrator – vânzător', false));
    answer.jobPositionFacts.push({
      jobPosition: 'Administrator',
      field: 'activities',
      value: 'conducerea firmei, conduce autoturismul în interes de serviciu',
      file: evaluation,
      quote: 'conducerea firmei',
      otherCompany: '',
    });

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

describe('a responsible person’s roles', () => {
  const decision = 'Dosar/Decizia 1.docx';
  const psi = 'Dosar/PSI/Decizia PSI.docx';
  const page = 'Dosar/Decizii scanate.pdf (pagina 2)';
  const person = (
    fullName: string,
    file: string,
    quote: string,
    roles: { role: string; file: string; quote: string }[]
  ) => ({ fullName, jobTitle: '', roles, workplace: '', file, quote, otherCompany: '' });
  const readingWith = (persons: ReturnType<typeof person>[]) =>
    readingAnswer.parse({ ...wireAnswer(), responsiblePersons: persons });

  it('join across files and scanned pages, each role keeping its own passages', () => {
    const documents = readingWith([
      person('Cimpean Ramona Barbara', decision, 'dna. Cimpean Ramona Barbara', [
        { role: 'workplace_manager', file: decision, quote: 'conducător al locului de muncă' },
        { role: 'first_aid', file: decision, quote: 'acordarea primului ajutor' },
      ]),
      person('CIMPEAN Ramona Barbara', psi, 'CIMPEAN Ramona Barbara', [
        { role: 'fire_safety_coordinator', file: psi, quote: 'responsabil cu apărarea' },
        { role: 'first_aid', file: psi, quote: 'cursul de prim ajutor' },
      ]),
    ]);
    const scan = readingWith([
      person('Cimpean Ramona Barbara', `${page} (image follows)`, 'Cimpean Ramona', [
        {
          role: 'risk_evaluation_team',
          file: `${page} (image follows)`,
          quote: 'echipa de evaluare',
        },
        { role: 'first_aid', file: decision, quote: 'acordarea primului ajutor' },
      ]),
    ]);

    const [joined, ...rest] = toProposal(documents, scan).responsiblePersons;

    expect(rest).toEqual([]);
    expect(joined!.roles).toEqual([
      'workplace_manager',
      'first_aid',
      'fire_safety_coordinator',
      'risk_evaluation_team',
    ]);
    expect(joined!.roleSources).toEqual({
      workplace_manager: [{ file: decision, quote: 'conducător al locului de muncă' }],
      first_aid: [
        { file: decision, quote: 'acordarea primului ajutor' },
        { file: psi, quote: 'cursul de prim ajutor' },
      ],
      fire_safety_coordinator: [{ file: psi, quote: 'responsabil cu apărarea' }],
      risk_evaluation_team: [{ file: page, quote: 'echipa de evaluare' }],
    });
    expect(joined!.sources).toEqual([
      { file: decision, quote: 'dna. Cimpean Ramona Barbara' },
      { file: psi, quote: 'CIMPEAN Ramona Barbara' },
      { file: page, quote: 'Cimpean Ramona' },
    ]);
  });

  it('stand on the person’s passage from a scan’s page read before roles had their own', () => {
    const old = readingAnswer.parse(wireAnswer());
    (old.responsiblePersons[0] as { roles: unknown }).roles = ['first_aid', 'imminent_danger'];

    const [read] = toProposal(old).responsiblePersons;

    expect(read!.roles).toEqual(['first_aid', 'imminent_danger']);
    expect(read!.roleSources.imminent_danger).toEqual(read!.sources);
  });
});

describe('a post’s category and activities', () => {
  const evaluation = 'Dosar/Evaluare riscuri.docx';
  const fact = (jobPosition: string, field: string, value: string, otherCompany = '') => ({
    jobPosition,
    field,
    value,
    file: evaluation,
    quote: value,
    otherCompany,
  });

  it('fill the post they name, each with its own passage', () => {
    const [baker, seller] = fromWire(wireAnswer()).jobPositions;

    expect(baker).toMatchObject({ staffCategory: 'execution', activities: null });
    expect(baker!.fieldSources).toEqual({
      staffCategory: [
        { file: 'Dosar/Decizia 1.docx', quote: 'la 6 luni pentru personalul de execuție' },
      ],
    });
    expect(baker!.sources).toEqual([
      { file: 'Dosar/Decizia 1.docx', quote: 'Ionescu Maria, brutar' },
    ]);
    expect(seller).toMatchObject({ staffCategory: null, fieldSources: {} });
  });

  it('keep the first value, leave another company’s or an unknown category, and note a post none matches', () => {
    const answer = wireAnswer();
    answer.jobPositionFacts.push(
      fact('Brutar', 'staffCategory', 'tehnico-administrativ'),
      fact('Brutar', 'activities', 'coace pâinea'),
      fact('Vânzător', 'activities', 'vinde produsele', 'ATELIERUL INVENTAT'),
      fact('Vânzător', 'staffCategory', 'personal sezonier'),
      fact('Ospătar', 'activities', 'servește clienții')
    );

    const proposal = fromWire(answer);

    expect(
      proposal.jobPositions.map((position) => [position.staffCategory, position.activities])
    ).toEqual([
      ['execution', 'coace pâinea'],
      [null, null],
    ]);
    expect(proposal.jobPositions[0]!.fieldSources.staffCategory).toHaveLength(1);
    expect(proposal.notes.at(-1)).toContain('«Ospătar»');
  });

  it('place a post under a fire-safety theme’s auxiliary staff with the execution staff', () => {
    const answer = wireAnswer();
    answer.jobPositionFacts.push(
      fact('Vânzător', 'staffCategory', 'Personal auxiliar (vanzator, femeie de serviciu)')
    );

    expect(fromWire(answer).jobPositions[1]!.staffCategory).toBe('execution');
  });

  it('read a category’s interval as the training themes write it', () => {
    const answer = wireAnswer();
    answer.facts.push(
      {
        ...answer.facts[0]!,
        field: 'trainingSchedule.administrativeTrainingIntervalMonths',
        value: 'SEMESTRIAL',
        quote: 'FUNCTIA : CONTABIL … PERIODICITATE : SEMESTRIAL',
      },
      {
        ...answer.facts[0]!,
        field: 'fireSafety.workerTrainingIntervalMonths',
        value: '1 an',
        quote: 'o dată la 1 an',
      }
    );

    const proposal = fromWire(answer);

    expect(proposal.trainingSchedule.administrativeTrainingIntervalMonths.options[0]!.value).toBe(
      6
    );
    expect(proposal.fireSafety.workerTrainingIntervalMonths.options[0]!.value).toBe(12);
  });

  it('come with a post that is another company’s as a whole', () => {
    const answer = wireAnswer();
    answer.jobPositions[1]!.otherCompany = 'ATELIERUL INVENTAT';
    answer.jobPositionFacts.push(fact('Vânzător', 'activities', 'vinde', 'ATELIERUL INVENTAT'));

    expect(fromWire(answer).jobPositions[1]!.activities).toBe('vinde');
  });

  it('are taken from the post on a scan’s page read before they had passages of their own', () => {
    const old = readingAnswer.parse({ ...wireAnswer(), jobPositionFacts: [] });
    Object.assign(old.jobPositions[1]!, { staffCategory: 'execution', activities: 'vinde' });

    const [, seller] = toProposal(old).jobPositions;

    expect(seller).toMatchObject({ staffCategory: 'execution', activities: 'vinde' });
    expect(seller!.fieldSources.activities).toEqual(seller!.sources);
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

describe('a proposal or a scan’s page that predates the fire-safety values and the passages', () => {
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
    for (const position of stored.jobPositions) {
      delete position.needsProtectiveEquipment;
      delete position.fieldSources;
    }
    for (const person of stored.responsiblePersons) delete person.roleSources;
    for (const list of ['workplaces', 'jobPositions', 'fireEquipment', 'protectiveEquipment']) {
      for (const item of stored[list]) delete item.spelling;
    }

    const parsed = proposalSchema.parse(stored);
    expect(parsed.fireSafety.hasThirdParties).toEqual({ options: [] });
    expect(parsed.trainingSchedule.workerTrainingNotApplicable).toEqual({ options: [] });
    expect(parsed.workplaces[0]).toMatchObject({ floorAreaM2: null, fieldSources: {} });
    expect(parsed.jobPositions[0]).toMatchObject({
      needsProtectiveEquipment: null,
      fieldSources: {},
    });
    expect(parsed.responsiblePersons[0]!.roleSources).toEqual({});
    expect(parsed.protectiveEquipment[0]!.spelling).toEqual({});
    expect(parsed.fireEquipment[0]!.spelling).toEqual({});
  });
});

describe('a value written two ways', () => {
  const written = (field: string, value: string, file = 'Dosar/Decizia 1.docx') => ({
    field,
    value,
    file,
    quote: value,
    otherCompany: '',
  });
  const workplace = (
    name: string,
    locality: string,
    addressLine: string,
    isRegisteredOffice: boolean,
    file: string,
    activity = ''
  ) => ({
    name,
    county: 'TM',
    locality,
    addressLine,
    isRegisteredOffice,
    activity,
    rooms: [],
    file,
    quote: addressLine,
    otherCompany: '',
  });

  it('is one option for a company name, a phone number or an address, keeping the first spelling', () => {
    const answer = wireAnswer();
    answer.facts = [
      written('client.legalName', 'S.C. VASILESCU EXEMPLU S.R.L.'),
      written('client.legalName', 'Vasilescu Exemplu SRL', 'Dosar/Contract.pdf'),
      written('client.legalName', 'SC VASILESCU EXEMPLU SRL', 'Dosar/PSI/Decizia 1.1.doc'),
      written('client.contactPhone', '0700 123456'),
      written('client.contactPhone', '0700 123 456', 'Dosar/Contract.pdf'),
      written('client.contactPhone', '+40 700 123 456', 'Dosar/PSI/Decizia 1.1.doc'),
      written('client.addressLine', 'Str. Exemplului , Nr.8 , Camera 2'),
      written('client.addressLine', 'STR. EXEMPLULUI, NR. 8, CAM. 2', 'Dosar/Contract.pdf'),
    ];

    const proposal = fromWire(answer);

    expect(proposal.client.legalName.options).toEqual([
      expect.objectContaining({
        value: 'S.C. VASILESCU EXEMPLU S.R.L.',
        sources: [
          { file: 'Dosar/Decizia 1.docx', quote: 'S.C. VASILESCU EXEMPLU S.R.L.' },
          { file: 'Dosar/Contract.pdf', quote: 'Vasilescu Exemplu SRL' },
          { file: 'Dosar/PSI/Decizia 1.1.doc', quote: 'SC VASILESCU EXEMPLU SRL' },
        ],
      }),
    ]);
    expect(proposal.client.contactPhone.options.map((option) => option.value)).toEqual([
      '0700 123456',
    ]);
    expect(proposal.client.contactPhone.options[0]!.sources).toHaveLength(3);
    expect(proposal.client.addressLine.options.map((option) => option.value)).toEqual([
      'Str. Exemplului , Nr.8 , Camera 2',
    ]);
  });

  it('stays a choice when the values really differ', () => {
    const answer = wireAnswer();
    answer.facts = [
      written('client.legalName', 'VASILESCU EXEMPLU S.R.L.'),
      written('client.legalName', 'VASILESCU EXEMPLU CONSTRUCT S.R.L.', 'Dosar/Contract.pdf'),
      written('client.contactPhone', '0700 123 456'),
      written('client.contactPhone', '0700 123 457', 'Dosar/Contract.pdf'),
      written('client.addressLine', 'Str. Exemplului nr. 8'),
      written('client.addressLine', 'Str. Exemplului nr. 18', 'Dosar/Contract.pdf'),
    ];

    expect(proposalChoices(fromWire(answer)).map((choice) => choice.path)).toEqual([
      'client.legalName',
      'client.addressLine',
      'client.contactPhone',
    ]);
  });

  it('is one workplace for an address written with another street type or abbreviations', () => {
    const answer = wireAnswer();
    answer.workplaces = [
      workplace('Sediu social', 'Dumbravita', 'Str. Exemplului , Nr.8 , Camera 2', true, 'A.doc'),
      workplace('Punct de lucru Timișoara', 'Timisoara', 'Calea Inventată ,Nr. 6', false, 'A.doc'),
      workplace(
        'Punctul de lucru, Timișoara, str. Inventată nr. 6',
        'Timișoara',
        'str. Inventată nr. 6',
        false,
        'B.doc',
        'Sertizarea furtunurilor hidraulice'
      ),
      workplace('Sediu social', 'DUMBRAVITA', 'STR. EXEMPLULUI, NR. 8, CAM. 2', true, 'C.doc'),
    ];
    answer.workplaceFacts = [];

    const { workplaces, notes } = fromWire(answer);

    expect(
      workplaces.map((each) => [
        each.name,
        each.addressLine,
        each.isRegisteredOffice,
        each.activity,
      ])
    ).toEqual([
      ['Sediu social', 'Str. Exemplului , Nr.8 , Camera 2', true, null],
      [
        'Punct de lucru Timișoara',
        'Calea Inventată ,Nr. 6',
        false,
        'Sertizarea furtunurilor hidraulice',
      ],
    ]);
    expect(workplaces[1]!.sources.map((source) => source.file)).toEqual(['A.doc', 'B.doc']);
    expect(notes.filter((note) => note.includes('sediul social'))).toEqual([]);
  });

  it('is one registered office, keeping the first and noting the other address', () => {
    const answer = wireAnswer();
    answer.workplaces = [
      workplace(
        'Sediu social',
        'Timișoara',
        'Str. Exemplului , Nr.19, Sc. B , Ap. 17',
        true,
        'A.doc'
      ),
      workplace('Punct de lucru', 'Timișoara', 'str. Piața Mică nr. 2', false, 'A.doc'),
      workplace(
        'Sediul firmei',
        'Timișoara',
        'Str. Vechi nr. 3',
        true,
        'B.doc',
        'Atelier croitorie'
      ),
      workplace(
        'Sediu social',
        'Timișoara',
        'Strada EXEMPLULUI, Nr. 19, Scara B, Ap. 17',
        true,
        'C.doc'
      ),
    ];
    answer.workplaceFacts = [];
    const installation = {
      workplace: 'Sediul firmei',
      kind: 'detection_alarm',
      description: '',
      file: 'B.doc',
      quote: 'Str. Vechi nr. 3',
      otherCompany: '',
    };

    const proposal = fromWire({ ...answer, fireInstallations: [installation] });

    expect(
      proposal.workplaces.map((each) => [
        each.name,
        each.addressLine,
        each.isRegisteredOffice,
        each.activity,
      ])
    ).toEqual([
      ['Sediu social', 'Str. Exemplului , Nr.19, Sc. B , Ap. 17', true, 'Atelier croitorie'],
      ['Punct de lucru', 'str. Piața Mică nr. 2', false, null],
    ]);
    expect(proposal.workplaces[0]!.sources.map((source) => source.file)).toEqual([
      'A.doc',
      'C.doc',
      'B.doc',
    ]);
    expect(proposal.fireInstallations[0]!.workplace.id).toBe('workplace-1');
    expect(proposal.notes).toContain(
      'Documentele dau sediul social și la adresa «Str. Vechi nr. 3», care nu a fost preluată.'
    );
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
