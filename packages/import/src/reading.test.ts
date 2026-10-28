import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { proposalChoices, proposedIncluded } from './proposal';
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
