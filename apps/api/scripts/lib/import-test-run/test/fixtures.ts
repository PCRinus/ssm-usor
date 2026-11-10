// Invented documents, readings and copies for the test runner's tests; no name or number here is
// real. The CNP is made valid with the contracts' control digit.

import {
  type EmployeeImportProposal,
  type InstructionsProposal,
  type Proposal,
  type ProposedInstruction,
  type ProposedRiskFactor,
  type ProposedRiskSheet,
  type Reading,
  type RisksProposal,
  type SheetPage,
  type SheetRow,
  toEmployeeProposal,
  toProposal,
} from '@ssm-usor/import';

import type { CopyContext } from '../../../../src/modules/imports/copies';
import {
  type CopySource,
  type ImportCopyRecord,
  type KeptCopy,
  MissingObjectError,
  type PartCopyRecord,
} from '../cases';

export const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';
export const today = '2026-11-05';
export const comanCnp = '2850615320013';

const decision = 'Dosar/Decizia 1.docx';
const quoted = { file: decision, quote: 'citat', otherCompany: null };
const fact = (field: string, value: string) => ({ field, value, ...quoted });

export function clientReading(overrides: Partial<Reading> = {}): Reading {
  return {
    facts: [
      fact('client.legalName', 'BRUTĂRIA FICTIVĂ S.R.L.'),
      fact('client.cui', '12345674'),
      fact('client.countyCode', 'TM'),
      fact('client.locality', 'Timișoara'),
      fact('client.legalRepresentativeName', 'Vasilescu Andrei'),
    ],
    workplaces: [
      {
        name: 'Sediu',
        county: 'TM',
        locality: 'Timișoara',
        addressLine: 'str. Exemplului nr. 5',
        isRegisteredOffice: true,
        activity: null,
        rooms: [],
        ...quoted,
      },
      {
        name: 'Magazin',
        county: null,
        locality: 'Timișoara',
        addressLine: 'str. Piața Mică nr. 2',
        isRegisteredOffice: false,
        activity: 'Comerț',
        rooms: [],
        ...quoted,
      },
    ],
    workplaceFacts: [],
    jobPositions: ['Brutar', 'Vânzător'].map((name) => ({
      name,
      trainingIntervalMonths: null,
      workZone: null,
      managementOnly: false,
      needsProtectiveEquipment: null,
      ...quoted,
    })),
    jobPositionFacts: [],
    responsiblePersons: [],
    fireEquipment: [],
    fireInstallations: [],
    substances: [],
    protectiveEquipment: [],
    employees: [],
    notes: [],
    ...overrides,
  };
}

export const clientProposal = (reading: Reading = clientReading()): Proposal => toProposal(reading);

export function sheetPage(parts: {
  person?: Partial<SheetPage['person']>;
  fields?: Partial<SheetPage['fields']>;
  trainings?: SheetRow[];
}): SheetPage {
  return {
    pageKind: 'ssm_sheet_front',
    person: {
      lastName: 'Coman',
      firstName: 'Daniela',
      cnp: comanCnp,
      employeeNumber: '12',
      ...parts.person,
    },
    fields: {
      birthDate: '1985-06-15',
      birthPlace: 'Sibiu',
      homeAddress: null,
      education: null,
      qualification: null,
      bloodGroup: null,
      rhFactor: null,
      jobTitle: 'Patiseră',
      hiredAt: '2021-01-18',
      leftOn: null,
      workplace: null,
      commuteRoute: null,
      commuteMinutes: null,
      ...parts.fields,
    },
    admission: { admittedOn: null, admittedByName: null, admittedByJobTitle: null },
    trainings: parts.trainings ?? [sheetRow({})],
    unreadable: [],
    notes: [],
  };
}

export function sheetRow(parts: Partial<SheetRow>): SheetRow {
  return {
    domain: 'ssm',
    phase: 'periodic',
    annualTest: false,
    heldOn: '2025-07-14',
    durationMinutes: 120,
    trainerName: 'Barbu Ionuț',
    trainerJobTitle: 'Inspector SSM',
    verifierName: null,
    verifierJobTitle: null,
    material: 'Riscuri la cuptor și malaxor',
    supplementaryReason: null,
    traineeSignature: 'present',
    trainerSignature: 'present',
    verifierSignature: 'absent',
    ...parts,
  };
}

export const photoId = 'f0000000-0000-4000-8000-000000000002';

export const employeeProposal = (reading: SheetPage): EmployeeImportProposal =>
  toEmployeeProposal({
    pages: [{ id: 'page-1', fileId: photoId, page: null, label: 'Fise/Coman.jpg', reading }],
    client: { jobPositions: [], workplaces: [], employees: [] },
    themes: () => null,
    today,
  });

export function instruction(parts: Partial<ProposedInstruction> & { number: string }) {
  const title = parts.title ?? `Instrucțiunea ${parts.number}`;
  return {
    key: `instruction-${parts.number}`,
    file: 'Instructiuni proprii.docx',
    writtenTitle: title,
    title,
    category: 'work_equipment',
    body: { blocks: [{ kind: 'article', paragraphs: [`Textul instrucțiunii ${parts.number}.`] }] },
    articleCount: 1,
    sourceNumbers: [1],
    location: {
      file: 'Instructiuni proprii.docx',
      start: 0,
      end: 10,
      firstParagraph: 0,
      lastParagraph: 1,
    },
    status: 'new',
    match: null,
    choice: null,
    posts: ['position-1'],
    flags: [],
    sameAs: [],
    ...parts,
  } satisfies ProposedInstruction;
}

export const instructionsProposal = (
  instructions: ProposedInstruction[]
): InstructionsProposal => ({
  domain: 'ssm',
  instructions,
  unread: [],
  positions: [
    {
      key: 'position-1',
      post: 'Brutar',
      variant: '',
      clientPost: 'Brutar',
      citations: [],
      resolution: { kind: 'resolved', instructions: instructions.map((each) => each.key) },
      missing: [],
    },
  ],
});

export function riskFactor(
  parts: Partial<ProposedRiskFactor> & { key: string; description: string }
): ProposedRiskFactor {
  return {
    row: null,
    source: null,
    component: 'means_of_production',
    writtenComponent: 'Mijloace de producție',
    group: 'Pericol de arsuri',
    code: null,
    consequence: 'Arsuri',
    gravityClass: 3,
    probabilityClass: 4,
    printedLevel: null,
    measures: [{ kind: 'technical', description: 'Mănuși termorezistente' }],
    measuresFrom: 'sheet',
    actions: null,
    deadline: null,
    responsiblePerson: null,
    observations: null,
    flags: [],
    included: true,
    level: 3,
    ...parts,
  };
}

export function riskSheet(factors: ProposedRiskFactor[]): ProposedRiskSheet {
  return {
    key: 'sheet-1',
    file: 'Evaluare riscuri.docx',
    heading: 'Fișa de evaluare a postului Brutar',
    kind: 'job_position',
    name: 'Brutar',
    rows: null,
    meansOfProduction: 'Cuptor, malaxor',
    workEnvironment: null,
    exposure: '8 ore/zi',
    flags: [],
    posts: [{ name: 'Brutar', existingFactors: 0, choice: null }],
    undecided: false,
    existing: null,
    libraryName: 'Brutar',
    status: 'new',
    match: null,
    choice: 'add',
    sameAs: [],
    copyOf: null,
    factors,
  };
}

export const risksProposal = (sheets: ProposedRiskSheet[]): RisksProposal => ({
  sheets,
  unplacedRows: [],
  unmatchedPlanRows: [],
  unmatchedMeasureRows: [],
});

const encoder = new TextEncoder();

export const copyContext: CopyContext = {
  createdBy: null,
  provider: {
    name: 'SERVICIUL EXTERN EXEMPLU S.R.L.',
    cui: '76543210',
    people: ['Marinescu Elena'],
  },
  existingClient: null,
  registeredCompany: null,
};

export function importRecord(
  overrides: Partial<ImportCopyRecord> & Pick<ImportCopyRecord, 'import' | 'kind'>
): ImportCopyRecord {
  return {
    organization: organizationId,
    status: 'confirmed',
    failureReason: null,
    clientId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    intoExistingClient: false,
    times: {
      createdAt: '2026-11-03T09:00:00Z',
      startedAt: '2026-11-03T09:01:00Z',
      readyAt: '2026-11-03T09:10:00Z',
      failedAt: null,
      confirmedAt: '2026-11-03T10:00:00Z',
      abandonedAt: null,
      reportedAt: null,
    },
    context: copyContext,
    files: [],
    proposal: null,
    changes: null,
    quality: null,
    readingVersion: { models: { reading: 'gpt-6.1-terra' }, prompts: '0123456789ab' },
    readingFlags: null,
    usage: {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      readCharacters: null,
      bySteps: null,
    },
    parts: [],
    ...overrides,
  };
}

export function partRecord(
  overrides: Partial<PartCopyRecord> & Pick<PartCopyRecord, 'import' | 'part'>
): PartCopyRecord {
  return {
    organization: organizationId,
    status: 'confirmed',
    attempt: 1,
    failureReason: null,
    importStatus: 'confirmed',
    times: { readAt: null, failedAt: null, confirmedAt: '2026-11-04T10:00:00Z', reportedAt: null },
    context: copyContext,
    proposal: null,
    changes: null,
    quality: null,
    readingVersion: { models: { risks: 'gpt-6.1-terra' }, prompts: 'abcdef012345' },
    readingFlags: null,
    usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: 0 },
    objects: [],
    ...overrides,
  };
}

export function memoryBucket() {
  const objects = new Map<string, Uint8Array>();
  const kept: KeptCopy[] = [];
  const reads: string[] = [];
  const unavailable = new Set<string>();
  const put = (path: string, value: string | Uint8Array | object) =>
    objects.set(
      path,
      value instanceof Uint8Array
        ? value
        : encoder.encode(typeof value === 'string' ? value : JSON.stringify(value))
    );
  const source: CopySource = {
    async list(filter) {
      return kept.filter(
        (copy) =>
          (filter.imports.length === 0 || filter.imports.includes(copy.importId)) &&
          (filter.organization === null || filter.organization === copy.organizationId)
      );
    },
    async read(path) {
      reads.push(path);
      if (unavailable.has(path)) throw new Error('Storage is unavailable.');
      const bytes = objects.get(path);
      if (!bytes) throw new MissingObjectError(path);
      return bytes;
    },
  };
  return {
    source,
    reads,
    put,
    unavailable,
    keepImport(record: ImportCopyRecord, files: Record<string, string | Uint8Array | object>) {
      const folder = `${record.organization}/${record.import}`;
      for (const [name, value] of Object.entries(files)) put(`${folder}/files/${name}`, value);
      put(`${folder}/record.json`, record);
      kept.push({ organizationId: record.organization, importId: record.import, part: null });
    },
    keepPart(record: PartCopyRecord) {
      const folder = `${record.organization}/${record.import}`;
      put(`${folder}/parts/${record.part}/record.json`, record);
      kept.push({
        organizationId: record.organization,
        importId: record.import,
        part: record.part,
      });
    },
  };
}
