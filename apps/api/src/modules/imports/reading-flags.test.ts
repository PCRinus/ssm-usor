import {
  type EmployeeImportProposal,
  type InstructionsProposal,
  type RisksProposal,
  toProposal,
} from '@ssm-usor/import';
import { describe, expect, it } from 'vitest';

import {
  changedShare,
  clientReadingFlags,
  employeeReadingFlags,
  type FileForFlags,
  instructionsQuality,
  instructionsReadingFlags,
  risksQuality,
  risksReadingFlags,
} from './reading-flags';

const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const file = (id: string, path: string, overrides: Partial<FileForFlags> = {}): FileForFlags => ({
  id,
  upload_path: path,
  mime_type: docx,
  state: 'read',
  document_kind: 'decision',
  document_domain: null,
  ...overrides,
});

const position = (name: string) => ({
  name,
  staffCategory: null,
  trainingIntervalMonths: null,
  workZone: null,
  activities: null,
  managementOnly: false,
  needsProtectiveEquipment: null,
  file: 'Dosar/Decizia 1.docx',
  quote: name,
  otherCompany: null,
});

const reading = {
  facts: [
    {
      field: 'client.legalName',
      value: 'BRUTĂRIA FICTIVĂ S.R.L.',
      file: 'Dosar/Decizia 1.docx',
      quote: 'BRUTĂRIA',
      otherCompany: null,
    },
  ],
  workplaces: [],
  workplaceFacts: [],
  jobPositionFacts: [],
  jobPositions: [position('Brutar'), position('Șofer')],
  responsiblePersons: [],
  fireEquipment: [],
  fireInstallations: [],
  protectiveEquipment: [],
  employees: [],
  notes: [],
};

describe('clientReadingFlags', () => {
  const files = [
    file('a', 'Dosar/Decizia 1.docx'),
    file('b', 'Dosar/coperta.docx', { state: 'set_aside', document_kind: 'cover' }),
    file('c', 'Dosar/stricat.pdf', {
      state: 'failed',
      document_kind: null,
      mime_type: 'application/pdf',
    }),
    file('d', 'Dosar/IMG_1.jpg', {
      state: 'for_employees',
      document_kind: 'training_sheet',
      mime_type: 'image/jpeg',
    }),
  ];

  it('counts the files by kind, what was found, what is missing and the checks, never a value', () => {
    const proposal = {
      ...toProposal(reading),
      flags: [
        { path: 'client.legalName.options.0.sources.0', code: 'quote_not_found' as const },
        { path: 'jobPositions.1.sources.0', code: 'quote_not_found' as const },
        { path: 'client.cui', code: 'missing' as const },
      ],
    };
    const flags = clientReadingFlags(files, proposal);

    expect(flags).toEqual({
      files: {
        total: 4,
        byKind: { decision: 1, cover: 1, pdf: 1, training_sheet: 1 },
        unreadable: [{ file: 3, kind: 'pdf' }],
        setAside: 1,
        forEmployees: 1,
        otherCompany: 0,
      },
      found: {
        clientFields: 1,
        workplaces: 0,
        jobPositions: 2,
        responsiblePersons: 0,
        fireEquipment: 0,
        fireInstallations: 0,
        protectiveEquipment: 0,
        employees: 0,
      },
      emptyRequired: ['client.cui'],
      checks: { quote_not_found: 2, missing: 1 },
      proposedValues: 3,
    });
    expect(JSON.stringify(flags)).not.toMatch(/BRUTĂRIA|Brutar|Dosar|stricat/);
  });

  it('keeps only the files of a reading that failed before its proposal', () => {
    expect(clientReadingFlags(files, null)).toEqual({
      files: expect.objectContaining({ total: 4 }),
      found: {},
      checks: {},
    });
  });

  it('names every required value a reading that found nothing left empty', () => {
    expect(
      clientReadingFlags(files, toProposal({ ...reading, facts: [], jobPositions: [] }))
        .emptyRequired
    ).toEqual(['client.legalName', 'client.cui', 'jobPositions']);
  });

  it('counts the means files count differently once, as one file’s entries', () => {
    const office = {
      name: 'Sediu',
      county: null,
      locality: 'Cluj-Napoca',
      addressLine: 'Str. Florilor nr. 3',
      isRegisteredOffice: true,
      activity: null,
      rooms: [],
      file: 'Dosar/Decizia 1.docx',
      quote: 'Sediu',
      otherCompany: null,
    };
    const powder = (file: string, count: number, room: string | null) => ({
      workplace: 'Sediu',
      room,
      kind: 'extinguisher' as const,
      agent: 'powder' as const,
      capacity: 6,
      wheeled: false,
      count,
      file,
      quote: 'P6',
      otherCompany: null,
    });
    const proposal = toProposal({
      ...reading,
      workplaces: [office],
      fireEquipment: [
        powder('Dosar/Decizia 7.docx', 4, 'bucătărie'),
        powder('Dosar/Decizia 7.docx', 1, 'bar'),
        powder('Dosar/Lista mijloacelor.docx', 3, null),
      ],
    });

    expect(clientReadingFlags(files, proposal)).toMatchObject({
      found: { fireEquipment: 3 },
      proposedValues: 6,
    });
  });
});

describe('employeeReadingFlags', () => {
  const files = [
    file('a', 'Fise/Popescu.jpg', { mime_type: 'image/jpeg', document_kind: null }),
    file('b', 'Fise/Ionescu.jpg', { mime_type: 'image/jpeg', document_kind: null }),
  ];
  const row = (flags: string[], test: object | null = null) => ({ flags, test });
  const proposal = {
    pages: [
      { fileId: 'a', personId: 'person-1', kind: 'training_sheet', rows: [row(['unsigned'])] },
      { fileId: 'b', personId: null, kind: null, rows: [] },
    ],
    people: [{ flags: [{ code: 'invalid_cnp' }, { code: 'month_only' }] }],
  } as unknown as EmployeeImportProposal;

  it('counts the pages, people and rows, and the sheet that gave no person', () => {
    expect(employeeReadingFlags(files, proposal)).toEqual({
      files: expect.objectContaining({ total: 2, byKind: { photo: 2 } }),
      found: { pages: 2, unreadablePages: 1, people: 1, trainingRows: 1, tests: 0 },
      checks: { 'person.invalid_cnp': 1, 'person.month_only': 1, 'row.unsigned': 1 },
      nothingFound: [{ file: 2, kind: 'training_sheet' }],
    });
  });
});

describe('instructionsReadingFlags', () => {
  it("counts what was cut and the checks' flags, and the pack of the domain that gave nothing", () => {
    const files = [
      file('a', 'Dosar/IPSSM.docx', { document_kind: 'own_instructions', document_domain: 'ssm' }),
      file('b', 'Dosar/IPSSM 2.docx', {
        state: 'set_aside',
        document_kind: 'own_instructions',
        document_domain: 'ssm',
      }),
      file('c', 'Dosar/IPSU.docx', { document_kind: 'own_instructions', document_domain: 'su' }),
    ];
    const proposal = {
      instructions: [
        { file: 'Dosar/IPSSM.docx', flags: [{ kind: 'end_not_found' }] },
        { file: 'Dosar/IPSSM.docx', flags: [] },
      ],
      unread: [{ reason: 'start_not_found' }],
      positions: [{ resolution: { kind: 'undecided' } }, { resolution: { kind: 'resolved' } }],
    } as unknown as InstructionsProposal;

    expect(instructionsReadingFlags(files, 'ssm', proposal)).toEqual({
      found: { instructions: 2, unread: 1, positions: 2, undecidedPositions: 1 },
      checks: { 'instruction.end_not_found': 1, 'unread.start_not_found': 1 },
      nothingFound: [{ file: 2, kind: 'own_instructions' }],
    });
  });
});

describe('risksReadingFlags', () => {
  it('counts sheets and factors with their flags, and the assessment that gave no factor', () => {
    const files = [
      file('a', 'Dosar/Evaluare.docx', { document_kind: 'risk_assessment' }),
      file('b', 'Dosar/Plan.pdf', {
        document_kind: 'risk_assessment',
        mime_type: 'application/pdf',
      }),
    ];
    const proposal = {
      sheets: [
        {
          file: 'Dosar/Evaluare.docx',
          flags: [{ kind: 'rows_not_found' }],
          factors: [
            { flags: [{ kind: 'level_mismatch' }, { kind: 'class_missing' }] },
            { flags: [{ kind: 'level_mismatch' }] },
          ],
        },
        { file: 'Dosar/Plan.pdf', flags: [{ kind: 'no_factors' }], factors: [] },
      ],
      unplacedRows: [{}],
      unmatchedPlanRows: [],
      unmatchedMeasureRows: [],
    } as unknown as RisksProposal;

    expect(risksReadingFlags(files, proposal)).toEqual({
      found: {
        evaluationSheets: 2,
        sheetsWithoutFactors: 1,
        factors: 2,
        unplacedRows: 1,
        unmatchedPlanRows: 0,
        unmatchedMeasureRows: 0,
      },
      checks: {
        'sheet.rows_not_found': 1,
        'sheet.no_factors': 1,
        'factor.level_mismatch': 2,
        'factor.class_missing': 1,
      },
      nothingFound: [{ file: 2, kind: 'risk_assessment' }],
    });
  });
});

describe('the quality of a part', () => {
  it("counts an instruction unticked, changed or kept as the member's changes leave it", () => {
    const proposal = {
      instructions: [{ key: 'one' }, { key: 'two' }, { key: 'three' }, { key: 'four' }],
    } as unknown as InstructionsProposal;
    expect(
      instructionsQuality(proposal, {
        instructions: {
          one: { included: false },
          two: { title: 'Alt titlu' },
          three: { included: true },
        },
      })
    ).toEqual({ instructions: { changed: 1, unticked: 1, kept: 2 } });
    expect(instructionsQuality(proposal, null)).toEqual({
      instructions: { changed: 0, unticked: 0, kept: 4 },
    });
  });

  it('counts the sheets and the factors read for them, a sheet with every factor removed as unticked', () => {
    const factor = (key: string, included = true) => ({ key, included });
    const proposal = {
      sheets: [
        { key: 's1', choice: 'add', factors: [factor('f1'), factor('f2'), factor('f3', false)] },
        { key: 's2', choice: 'add', factors: [factor('f4')] },
        { key: 's3', choice: 'add', factors: [] },
      ],
    } as unknown as RisksProposal;
    expect(
      risksQuality(proposal, {
        sheets: {
          s1: {
            libraryName: 'Brutar',
            factors: { f1: { included: false }, f2: { gravityClass: 3 }, f3: { included: true } },
          },
          s2: { factors: { f4: { included: false } } },
        },
      })
    ).toEqual({
      sheets: { changed: 1, unticked: 1, kept: 1 },
      factors: { changed: 2, unticked: 2, kept: 0 },
    });
  });
});

describe('changedShare', () => {
  it('is what the member changed or unticked of what was proposed', () => {
    expect(
      changedShare({
        people: { changed: 2, unticked: 1, kept: 3 },
        rows: { changed: 0, unticked: 0, kept: 4 },
      })
    ).toEqual({ changed: 3, whole: 10, share: 0.3 });
  });

  it("takes a client import's whole from the values proposed, its kept counting only part", () => {
    expect(changedShare({ client: { changed: 2, unticked: 0, kept: 0 } }, 40)).toEqual({
      changed: 2,
      whole: 40,
      share: 0.05,
    });
  });

  it('is null when nothing was proposed or no counts were kept', () => {
    expect(changedShare(null)).toBeNull();
    expect(changedShare({ people: { changed: 0, unticked: 0, kept: 0 } })).toBeNull();
  });
});
