import { extractionRefused, type ExtractorService } from '@ssm-usor/contracts';
import {
  createModelClient,
  type EmployeeImportClient,
  employeeImportProposalSchema,
  instructionsProposalSchema,
  type LibraryModule,
  proposalSchema,
  risksProposalSchema,
} from '@ssm-usor/import';
import { strToU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AlertMessage } from '../../lib/alerts';
import { sha256 } from '../../lib/docx';
import type { ImportMessage } from '../../lib/env';
import { cleanUpImports, cleanUpLine } from './cleanup';
import { libraryReasons, riskReasons } from './library';
import {
  fileReasons,
  importReasons,
  maxReadingCharacters,
  maxReadWaits,
  type PipelineDeps,
  tooMuchText,
} from './pipeline';
import {
  consumeImportBatch,
  consumeImportDeadLetters,
  lastDelivery,
  maxDeferrals,
  type QueueMessage,
} from './queue';
import type {
  CopyToWrite,
  ImportRecord,
  ImportRecordRow,
  ImportRecords,
  OrganizationActivity,
  PartRecordRow,
} from './records';
import type { ClientSheets, RiskLibrary } from './risk-sheets';
import {
  type ImportCopy,
  type ImportFileRow,
  ImportLimitError,
  type ImportObjectList,
  type ImportRow,
  type ImportStore,
  type LibraryPartRow,
} from './store';

const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';
const importId = '6f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f';

function docx(lines: string[]) {
  const body = lines
    .map((line) => `<w:p><w:r><w:t xml:space="preserve">${line}</w:t></w:r></w:p>`)
    .join('');
  return zipSync({
    'word/document.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`
    ),
  });
}

const decisionLines = [
  'BRUTĂRIA FICTIVĂ S.R.L.',
  'CUI 12345674, J35/123/2015',
  'Administratorul societății, dl. Vasilescu Andrei, numește pe dna. Ionescu Maria, brutar.',
];
const fireLines = [
  'BRUTĂRIA FICTIVĂ S.R.L.',
  'Lista mijloacelor de stingere',
  '| Sediu | stingător P6 | 2 |',
  'Punct de adunare: parcarea din spate.',
];
const otherLines = ['ATELIERUL INVENTAT S.R.L.', 'CUI 87654329', 'Decizie privind instruirea'];
const scannedFirstPage =
  'BRUTĂRIA FICTIVĂ S.R.L. CUI 12345674. Decizia nr. 2 privind organizarea activității de prevenire și protecție, semnată de administrator.';

interface FileSpec {
  path: string;
  mime: string;
  bytes: Uint8Array;
}

const files: FileSpec[] = [
  {
    path: 'Dosar/Decizia 1.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: docx(decisionLines),
  },
  { path: 'Dosar/PSI/Lista mijloace.doc', mime: 'application/msword', bytes: strToU8('doc') },
  {
    path: 'Dosar/Scanate/Decizie semnata.pdf',
    mime: 'application/pdf',
    bytes: strToU8('%PDF scan'),
  },
  { path: 'Dosar/Poze/IMG_0042.HEIC', mime: 'image/heic', bytes: strToU8('heic') },
  { path: 'Dosar/Poze/plan.jpg', mime: 'image/jpeg', bytes: strToU8('jpeg-plan') },
  {
    path: 'Dosar/Altul/Decizie Atelier.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: docx(otherLines),
  },
  {
    path: 'Dosar/coperta.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: docx(['DOSAR SSM', '2025']),
  },
  { path: 'Dosar/stricat.pdf', mime: 'application/pdf', bytes: strToU8('%PDF locked') },
];

const extension: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'application/pdf': 'pdf',
  'image/heic': 'heic',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

class World {
  imports = new Map<string, ImportRow & Record<string, unknown>>();
  files = new Map<string, ImportFileRow & Record<string, unknown>>();
  objects = new Map<string, Uint8Array>();
  clientFiles = new Map<string, Uint8Array>();
  pageImages = new Map<string, { sizeBytes: number; sha256: string }>();
  usage: { fileId: string | null; step: string; input: number; cost: number }[] = [];
  sent: { id: string; body: ImportMessage; attempts: number; delaySeconds?: number }[] = [];
  failCopyAfter: number | null = null;
  sizeLimit: number | null = null;
  abandoned: ImportObjectList[] = [];
  toEmpty: ImportObjectList[] = [];
  copies = new Map<string, Uint8Array>();
  expiredCopies: ImportCopy[] = [];
  failRemovalOf = new Set<string>();
  calls: string[] = [];
  nextMessage = 0;
  sheetClient: EmployeeImportClient = { jobPositions: [], workplaces: [], employees: [] };
  scanCharges: string[] = [];
  settled: number[] = [];
  creditsCoverPages = true;
  parts = new Map<string, LibraryPartRow & Record<string, unknown>>();
  partUsage: { part: string; input: number; cost: number }[] = [];
  partCharges: string[] = [];
  library: LibraryModule[] = [];
  riskLibrary: RiskLibrary = { entries: [], names: [] };
  clientSheets: ClientSheets = { jobPositions: [], sensitiveGroups: 0, other: {} };
  alerts: AlertMessage[] = [];
  recordedCopies: string[] = [];
  uncopied: CopyToWrite[] = [];
  incomplete: CopyToWrite[] = [];
  completedCopies = new Set<string>();
  activity: OrganizationActivity = { startedLastHour: 0, spentTodayUsd: 0 };

  send(body: ImportMessage, delaySeconds?: number) {
    this.sent.push({ id: `message-${++this.nextMessage}`, body, attempts: 1, delaySeconds });
  }

  addImport(row: Partial<ImportRow> & Record<string, unknown> = {}) {
    this.imports.set(importId, {
      id: importId,
      organization_id: organizationId,
      kind: 'client',
      client_id: null,
      into_existing_client: false,
      status: 'preparing',
      company_name: null,
      company_cui: null,
      proposal: null,
      files_copied_at: null,
      created_by: null,
      created_at: '2026-10-28T09:00:00Z',
      ...row,
    });
  }

  addFile(spec: FileSpec, index: number, state: ImportFileRow['state'] = 'uploaded') {
    const id = `f0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    const storage = `${organizationId}/${importId}/${id}.${extension[spec.mime]}`;
    this.files.set(id, {
      id,
      import_id: importId,
      upload_path: spec.path,
      original_file_name: spec.path.split('/').at(-1)!,
      mime_type: spec.mime,
      size_bytes: spec.bytes.length,
      sha256: '0'.repeat(64),
      storage_path: storage,
      state,
      document_kind: null,
      reason: null,
      company_name: null,
      company_cui: null,
      page_count: null,
      is_scan: null,
      text_path: null,
      derived_path: null,
      declared_pages: null,
      document_domain: null,
    });
    this.objects.set(storage, spec.bytes);
    return id;
  }

  fileAt(path: string) {
    return [...this.files.values()].find((file) => file.upload_path === path)!;
  }

  record(id: string): ImportRecord | null {
    const row = this.imports.get(id);
    if (!row) return null;
    const cost =
      this.usage.reduce((sum, each) => sum + each.cost, 0) +
      this.partUsage.reduce((sum, each) => sum + each.cost, 0);
    const recordRow = {
      failure_reason: null,
      started_at: null,
      ready_at: null,
      failed_at: null,
      confirmed_at: null,
      abandoned_at: null,
      reported_at: null,
      changes: null,
      quality: null,
      reading_version: null,
      reading_flags: null,
      read_characters: null,
      input_tokens: 0,
      cached_input_tokens: 0,
      output_tokens: 0,
      cost_usd: cost,
      usage_by_step: null,
      ...row,
    } as unknown as ImportRecordRow;
    const parts = [...this.parts.values()]
      .filter((part) => part.import_id === id)
      .map(
        (part) =>
          ({
            failure_reason: null,
            read_at: null,
            failed_at: null,
            confirmed_at: null,
            reported_at: null,
            changes: null,
            quality: null,
            reading_version: null,
            reading_flags: null,
            input_tokens: 0,
            cached_input_tokens: 0,
            output_tokens: 0,
            cost_usd: this.partUsage
              .filter((each) => each.part === part.part)
              .reduce((sum, each) => sum + each.cost, 0),
            ...part,
          }) as unknown as PartRecordRow
      );
    const files = [...this.files.values()]
      .filter((file) => file.import_id === id)
      .sort((a, b) => a.upload_path.localeCompare(b.upload_path));
    return { row: recordRow, files, parts };
  }

  records(): ImportRecords {
    return {
      get: async (id) => this.record(id),
      recordCopy: async (id, part) => {
        this.recordedCopies.push(`${id}:${part ?? ''}`);
        this.completedCopies.delete(`${id}:${part ?? ''}`);
      },
      completeCopy: async (id, part) => {
        this.completedCopies.add(`${id}:${part ?? ''}`);
      },
      uncopied: async () => this.uncopied,
      incompleteCopies: async (ids) =>
        this.incomplete.filter(
          (copy) =>
            ids.includes(copy.importId) &&
            !this.completedCopies.has(`${copy.importId}:${copy.part ?? ''}`)
        ),
      claimExpensiveAlert: async (id) => {
        const row = this.imports.get(id);
        if (!row || row.expensive_alerted_at) return false;
        row.expensive_alerted_at = '2026-10-28T10:00:00Z';
        return true;
      },
      activity: async () => this.activity,
      between: async () => [],
    };
  }

  store(): ImportStore {
    return {
      getImport: async (id) => this.imports.get(id) ?? null,
      listFiles: async (id) =>
        [...this.files.values()]
          .filter((file) => file.import_id === id)
          .sort((a, b) => a.upload_path.localeCompare(b.upload_path)),
      updateFile: async (id, patch, from) => {
        const file = this.files.get(id)!;
        if (from && file.state !== from) return false;
        if (this.sizeLimit !== null && (patch.size_bytes ?? 0) > this.sizeLimit) {
          throw new ImportLimitError();
        }
        Object.assign(file, patch);
        return true;
      },
      advance: async (id, from, patch) => {
        const row = this.imports.get(id);
        if (!row || row.status !== from) return false;
        Object.assign(row, patch);
        return true;
      },
      recordUsage: async (_importId, fileId, step, usage, cost) => {
        this.usage.push({ fileId, step, input: usage.input, cost });
      },
      chargeScannedPage: async (_row, fileId, page) => {
        const key = `${fileId}:${page}`;
        if (!this.scanCharges.includes(key)) this.scanCharges.push(key);
      },
      settleSheetPages: async (_row, extra) => {
        this.settled.push(extra);
        return extra <= 0 || this.creditsCoverPages;
      },
      openLibraryParts: async (row, parts) => {
        for (const part of parts) {
          const key = `${row.id}:${part}`;
          if (!this.parts.has(key)) {
            this.parts.set(key, {
              import_id: row.id,
              part,
              status: 'reading',
              attempt: 1,
              proposal: null,
            });
          }
        }
        return [...this.parts.values()].filter(
          (part) => part.import_id === row.id && part.status === 'reading'
        );
      },
      getLibraryPart: async (id, part) => this.parts.get(`${id}:${part}`) ?? null,
      updateLibraryPart: async (id, part, attempt, patch) => {
        const row = this.parts.get(`${id}:${part}`);
        if (!row || row.status !== 'reading' || row.attempt !== attempt) return false;
        Object.assign(row, patch);
        return true;
      },
      recordLibraryPartUsage: async (_id, part, usage, cost) => {
        this.partUsage.push({ part, input: usage.input, cost });
      },
      chargeLibraryPart: async (_row, part, attempt) => {
        const key = `${part}:${attempt}`;
        if (!this.partCharges.includes(key)) this.partCharges.push(key);
      },
      libraryModules: async () => this.library,
      riskLibrary: async () => this.riskLibrary,
      clientSheets: async () => this.clientSheets,
      provider: async () => ({
        name: 'SERVICIUL EXTERN EXEMPLU S.R.L.',
        cui: '76543210',
        people: ['Marinescu Elena'],
      }),
      client: async () => null,
      employeeImportClient: async () => this.sheetClient,
      keepPageImage: async (fileId, page, image) => {
        this.pageImages.set(`${fileId}:${page}`, image);
      },
      folderCopies: async () =>
        [...this.files.values()]
          .filter((file) => file.state !== 'other_company' && file.state !== 'failed')
          .map((file) => ({
            source_path: file.storage_path,
            target_path: `${organizationId}/client/${file.id}`,
          })),
      markCopied: async (id) => {
        this.imports.get(id)!.files_copied_at = '2026-10-28T10:00:00Z';
      },
      uncopiedImports: async () =>
        [...this.imports.values()]
          .filter((row) => row.status === 'confirmed' && !row.files_copied_at)
          .map((row) => row.id),
      failStalled: async (reasons) => {
        this.calls.push(`failStalled ${reasons.stalled} | ${reasons.left}`);
        return ['stalled-import'];
      },
      failStalledLibraryParts: async (reasons) => {
        this.calls.push(`failStalledLibraryParts ${reasons.instructions} ${reasons.risks}`);
        return [{ importId: 'stalled-import', part: 'instructions_ssm' }];
      },
      listAbandoned: async () => this.abandoned,
      deleteAbandoned: async (ids) => {
        this.calls.push(`deleteAbandoned ${ids.join(',')}`);
        return ids;
      },
      dropProposals: async () => {
        this.calls.push('dropProposals');
        return 2;
      },
      listObjectsToRemove: async () => this.toEmpty,
      markObjectsRemoved: async (ids) => {
        this.calls.push(`markObjectsRemoved ${ids.join(',')}`);
        return ids;
      },
      listExpiredCopies: async () => this.expiredCopies,
      markCopiesRemoved: async (ids) => {
        if (ids.length > 0) this.calls.push(`markCopiesRemoved ${ids.join(',')}`);
        return ids;
      },
    };
  }
}

const extractor = {
  docToDocx: vi.fn(async () => docx(fireLines).buffer as ArrayBuffer),
  pdfText: vi.fn(async (pdf: ArrayBuffer) => {
    if (new TextDecoder().decode(pdf).includes('locked')) {
      throw new Error(extractionRefused('password_protected'));
    }
    return {
      pageCount: 2,
      pages: [
        { number: 1, text: scannedFirstPage, isScan: false },
        { number: 2, text: '', isScan: true },
      ],
    };
  }),
  pdfPageImage: vi.fn(async () => strToU8('jpeg-page').buffer as ArrayBuffer),
  imageToJpeg: vi.fn(
    async (image: ArrayBuffer) =>
      strToU8(`upright ${new TextDecoder().decode(image)}`).buffer as ArrayBuffer
  ),
} satisfies ExtractorService;

const quoted = (file: string, quote: string) => ({ file, quote, otherCompany: '' });

const emptyReading = {
  facts: [],
  workplaces: [],
  workplaceFacts: [],
  workplaceSuggestions: [],
  jobPositionFacts: [],
  jobPositions: [],
  responsiblePersons: [],
  fireEquipment: [],
  fireInstallations: [],
  substances: [],
  protectiveEquipment: [],
  employees: [],
  notes: [],
};

const answers = {
  sorting: {
    files: [
      {
        path: 'Dosar/Decizia 1.docx',
        kind: 'decision',
        companyName: 'BRUTĂRIA FICTIVĂ S.R.L.',
        companyCui: '12345674',
        carriesClientData: true,
      },
      {
        path: 'Dosar/PSI/Lista mijloace.doc',
        kind: 'fire_safety_document',
        companyName: 'BRUTĂRIA FICTIVĂ S.R.L.',
        companyCui: '',
        carriesClientData: true,
      },
      {
        path: 'Dosar/Scanate/Decizie semnata.pdf',
        kind: 'decision',
        companyName: 'Brutăria Fictivă SRL',
        companyCui: 'RO12345674',
        carriesClientData: true,
      },
      {
        path: 'Dosar/Altul/Decizie Atelier.docx',
        kind: 'decision',
        companyName: 'ATELIERUL INVENTAT S.R.L.',
        companyCui: '87654329',
        carriesClientData: true,
      },
      {
        path: 'Dosar/coperta.docx',
        kind: 'cover',
        companyName: '',
        companyCui: '',
        carriesClientData: false,
      },
    ],
  },
  documents: {
    ...emptyReading,
    facts: [
      {
        field: 'client.legalName',
        value: 'BRUTĂRIA FICTIVĂ S.R.L.',
        ...quoted('Dosar/Decizia 1.docx', 'BRUTĂRIA FICTIVĂ S.R.L.'),
      },
      { field: 'client.cui', value: '12345674', ...quoted('Dosar/Decizia 1.docx', 'CUI 12345674') },
      {
        field: 'client.legalRepresentativeName',
        value: 'Vasilescu Andrei',
        ...quoted('Dosar/Decizia 1.docx', 'dl. Vasilescu Andrei'),
      },
      {
        field: 'client.tradeRegisterNumber',
        value: 'J35/999/2015',
        ...quoted('Dosar/Scanate/Decizie semnata.pdf', 'J35/999/2015'),
      },
    ],
    workplaces: [
      {
        name: 'Sediu',
        county: 'TM',
        locality: 'Timișoara',
        addressLine: '',
        isRegisteredOffice: true,
        activity: '',
        rooms: [],
        ...quoted('Dosar/PSI/Lista mijloace.doc', '| Sediu | stingător P6 | 2 |'),
      },
    ],
    workplaceFacts: [
      {
        workplace: 'Sediu',
        field: 'assemblyPoint',
        value: 'parcarea din spate',
        ...quoted('Dosar/PSI/Lista mijloace.doc', 'Punct de adunare: parcarea din spate'),
      },
    ],
    fireEquipment: [
      {
        workplace: 'Sediu',
        room: '',
        kind: 'extinguisher',
        agent: 'powder',
        capacity: '6',
        wheeled: false,
        count: '2',
        ...quoted('Dosar/PSI/Lista mijloace.doc', 'stingător P6 | 2'),
      },
    ],
  },
  scannedPage: {
    ...emptyReading,
    facts: [
      {
        field: 'client.legalRepresentativeRole',
        value: 'Administrator',
        ...quoted('Dosar/Scanate/Decizie semnata.pdf (pagina 2)', 'Administrator'),
      },
    ],
  },
  photo: {
    ...emptyReading,
    fireInstallations: [
      {
        workplace: 'Sediu',
        kind: 'emergency_lighting',
        description: '',
        ...quoted('Dosar/Poze/plan.jpg', 'iluminat de siguranță'),
      },
    ],
  },
  trainingSheetTriage: {
    files: [
      {
        path: 'Dosar/Poze/IMG_0042.HEIC',
        kind: 'training_sheet',
        companyName: '',
        companyCui: '',
        carriesClientData: true,
      },
    ],
  },
  planTriage: {
    files: [
      {
        path: 'Dosar/Poze/plan.jpg',
        kind: 'fire_safety_document',
        companyName: '',
        companyCui: '',
        carriesClientData: true,
      },
    ],
  },
};

type Recorded = (request: { name: string; text: string; images: string[] }) => unknown;

const defaultModel: Recorded = ({ name, text, images }) => {
  if (name === 'import_sorting') {
    if (images.length === 0) return answers.sorting;
    return text.includes('IMG_0042') ? answers.trainingSheetTriage : answers.planTriage;
  }
  if (images.length === 0) return answers.documents;
  return text.includes('(pagina 2)') ? answers.scannedPage : answers.photo;
};

let world: World;
let model: Recorded;
let modelRequests: {
  name: string;
  images: string[];
  metadata: string | null;
  maxTokens: number;
  effort: string;
}[];

function completion(content: unknown) {
  return Response.json({
    choices: [
      {
        finish_reason: 'stop',
        message: { role: 'assistant', content: JSON.stringify(content), refusal: null },
      },
    ],
    usage: {
      prompt_tokens: 1000,
      completion_tokens: 100,
      prompt_tokens_details: { cached_tokens: 0 },
    },
  });
}

function deps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    store: world.store(),
    objects: {
      read: async (path) => {
        const bytes = world.objects.get(path);
        if (!bytes) throw new Error(`No object at ${path}`);
        return bytes;
      },
      write: async (path, bytes) => {
        world.objects.set(path, bytes);
      },
      create: async (path, bytes) => {
        if (world.objects.has(path)) return false;
        world.objects.set(path, bytes);
        return true;
      },
      list: async (folder) =>
        [...world.objects.keys()].flatMap((path) =>
          path.startsWith(`${folder}/`) && !path.slice(folder.length + 1).includes('/')
            ? [path.slice(folder.length + 1)]
            : []
        ),
      copy: async (from, to, bucket) => {
        if (world.failCopyAfter !== null && world.clientFiles.size >= world.failCopyAfter) {
          throw new Error('Storage is down');
        }
        if (bucket === 'client-files') world.clientFiles.set(to, world.objects.get(from)!);
        else world.objects.set(to, world.objects.get(from)!);
      },
      remove: vi.fn(async (paths: string[]) => {
        if (paths.some((path) => world.failRemovalOf.has(path))) throw new Error('Storage is down');
        world.calls.push(`remove ${paths.length}`);
        for (const path of paths) world.objects.delete(path);
      }),
    },
    copies: {
      list: async (folder) =>
        [...world.copies.keys()].filter((path) => path.startsWith(`${folder}/`)),
      remove: async (paths) => {
        if (paths.some((path) => world.failRemovalOf.has(path))) throw new Error('Storage is down');
        world.calls.push(`remove copies ${paths.length}`);
        for (const path of paths) world.copies.delete(path);
      },
      copyIn: async (from, to) => {
        const bytes = world.objects.get(from);
        if (!bytes) throw new Error(`No object at ${from}`);
        world.copies.set(to, bytes);
      },
      write: async (path, bytes) => {
        world.copies.set(path, bytes);
      },
    },
    records: world.records(),
    alerts: {
      enabled: true,
      send: async (message) => {
        world.alerts.push(message);
        return true;
      },
    },
    extractor,
    model: createModelClient({
      baseUrl: 'https://gateway.example/v1/account/ssm-usor',
      token: 'gateway-token',
      sleep: async () => {},
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as {
          response_format: { json_schema: { name: string } };
          max_completion_tokens: number;
          reasoning_effort: string;
          messages: {
            content: string | { type: string; text?: string; image_url?: { url: string } }[];
          }[];
        };
        const parts = body.messages.flatMap((message) =>
          typeof message.content === 'string'
            ? [{ type: 'text', text: message.content }]
            : message.content
        );
        const request = {
          name: body.response_format.json_schema.name,
          text: parts.map((part) => part.text ?? '').join('\n'),
          images: parts.flatMap((part) => (part.image_url ? [part.image_url.url] : [])),
        };
        modelRequests.push({
          name: request.name,
          images: request.images,
          metadata: new Headers(init?.headers).get('cf-aig-metadata'),
          maxTokens: body.max_completion_tokens,
          effort: body.reasoning_effort,
        });
        const answer = model(request);
        return answer instanceof Response ? answer : completion(answer);
      },
    }),
    registry: {
      lookup: async (cui) =>
        cui === '12345674'
          ? {
              cui,
              legalName: 'BRUTĂRIA FICTIVĂ S.R.L.',
              vatPayer: true,
              caenCode: '1071',
              tradeRegisterNumber: 'J35/123/2015',
              countyCode: 'TM',
              locality: 'Timișoara',
              addressLine: null,
              phone: null,
              iban: null,
              registrationStatus: null,
              inactive: false,
            }
          : null,
    },
    queue: {
      send: async (body, options) => {
        world.send(body, options?.delaySeconds);
      },
      sendBatch: async (messages) => {
        for (const message of messages) world.send(message.body);
      },
    },
    ...overrides,
  };
}

async function drain(pipeline: PipelineDeps, limit = 400) {
  const outcomes: { type: string; outcome: 'ack' | 'retry'; attempts: number }[] = [];
  for (let step = 0; step < limit && world.sent.length > 0; step++) {
    const next = world.sent.shift()!;
    const message = {
      id: next.id,
      body: next.body,
      attempts: next.attempts,
      ack: vi.fn(),
      retry: vi.fn(),
    } satisfies QueueMessage;
    await consumeImportBatch({ messages: [message] }, {}, pipeline);
    const retried = message.retry.mock.calls.length > 0;
    outcomes.push({
      type: next.body.type,
      outcome: retried ? 'retry' : 'ack',
      attempts: next.attempts,
    });
    if (retried) world.sent.push({ ...next, attempts: next.attempts + 1 });
  }
  return outcomes;
}

function startWith(specs: FileSpec[]) {
  world.addImport();
  for (const [index, spec] of specs.entries()) {
    const id = world.addFile(spec, index);
    world.send({ type: 'prepare', importId, fileId: id });
  }
}

beforeEach(() => {
  world = new World();
  model = defaultModel;
  modelRequests = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('the import queue', () => {
  it('takes a pack from its files to a checked proposal ready for review', async () => {
    startWith(files);
    const outcomes = await drain(deps());

    expect(outcomes.every((outcome) => outcome.outcome === 'ack')).toBe(true);
    const row = world.imports.get(importId)!;
    expect(row.status).toBe('ready');
    expect(row.company_name).toBe('BRUTĂRIA FICTIVĂ S.R.L.');
    expect(row.company_cui).toBe('12345674');

    const state = (path: string) => {
      const file = world.fileAt(path);
      return { state: file.state, kind: file.document_kind, reason: file.reason };
    };
    expect(state('Dosar/Decizia 1.docx')).toEqual({
      state: 'read',
      kind: 'decision',
      reason: null,
    });
    expect(state('Dosar/PSI/Lista mijloace.doc').state).toBe('read');
    expect(state('Dosar/Scanate/Decizie semnata.pdf').state).toBe('read');
    expect(state('Dosar/Poze/plan.jpg')).toEqual({
      state: 'read',
      kind: 'fire_safety_document',
      reason: null,
    });
    expect(state('Dosar/Poze/IMG_0042.HEIC')).toMatchObject({
      state: 'for_employees',
      kind: 'training_sheet',
    });
    expect(state('Dosar/coperta.docx')).toMatchObject({ state: 'set_aside', kind: 'cover' });
    expect(world.fileAt('Dosar/Altul/Decizie Atelier.docx')).toMatchObject({
      state: 'other_company',
      company_name: 'ATELIERUL INVENTAT S.R.L.',
      company_cui: '87654329',
    });
    expect(state('Dosar/stricat.pdf')).toEqual({
      state: 'failed',
      kind: null,
      reason: 'Fișierul este protejat cu parolă.',
    });

    const doc = world.fileAt('Dosar/PSI/Lista mijloace.doc');
    expect(doc.derived_path).toBe(doc.storage_path.replace(/\.doc$/, '.docx'));
    expect(new TextDecoder().decode(world.objects.get(doc.text_path!)!)).toContain(
      'Lista mijloacelor de stingere'
    );
    const heic = world.fileAt('Dosar/Poze/IMG_0042.HEIC');
    expect(heic.derived_path).toBe(heic.storage_path.replace(/\.heic$/, '.jpg'));
    const plan = world.fileAt('Dosar/Poze/plan.jpg');
    expect(plan.derived_path).toBe(plan.storage_path.replace(/\.jpg$/, '.jpeg'));
    expect(new TextDecoder().decode(world.objects.get(plan.derived_path!))).toBe(
      'upright jpeg-plan'
    );
    expect(new TextDecoder().decode(world.objects.get(plan.storage_path))).toBe('jpeg-plan');
    expect(extractor.imageToJpeg).toHaveBeenCalledTimes(2);

    const stored = row.proposal as { registeredCompany: unknown };
    const proposal = proposalSchema.parse(row.proposal);
    expect(proposal.client.legalName.options.map((option) => option.value)).toEqual([
      'BRUTĂRIA FICTIVĂ S.R.L.',
    ]);
    expect(proposal.client.legalRepresentativeRole.options[0]?.sources).toEqual([
      { file: 'Dosar/Scanate/Decizie semnata.pdf (pagina 2)', quote: 'Administrator' },
    ]);
    expect(proposal.fireInstallations).toHaveLength(1);
    expect(proposal.fireEquipment[0]?.workplace.id).toBe('workplace-1');
    expect(proposal.workplaces[0]).toMatchObject({
      assemblyPoint: 'parcarea din spate',
      fieldSources: {
        assemblyPoint: [
          { file: 'Dosar/PSI/Lista mijloace.doc', quote: 'Punct de adunare: parcarea din spate' },
        ],
      },
    });
    expect(proposal.flags).toEqual(
      expect.arrayContaining([
        {
          path: 'client.tradeRegisterNumber.options.0.sources.0',
          code: 'quote_not_found',
        },
      ])
    );
    expect(proposal.flags.some((flag) => flag.path.includes('pagina 2'))).toBe(false);
    expect(stored.registeredCompany).toEqual({
      cui: '12345674',
      legalName: 'BRUTĂRIA FICTIVĂ S.R.L.',
      vatPayer: true,
      inactive: false,
    });

    expect(modelRequests.map((request) => request.name).sort()).toEqual([
      'client_import',
      'client_import',
      'client_import',
      'import_sorting',
      'import_sorting',
      'import_sorting',
    ]);
    expect(
      modelRequests.every(
        (request) => request.metadata === JSON.stringify({ organizationId, importId })
      )
    ).toBe(true);
    expect(
      modelRequests.every(
        (request) => request.maxTokens === (request.name === 'import_sorting' ? 16_000 : 64_000)
      )
    ).toBe(true);
    const upright = `data:image/jpeg;base64,${btoa('upright jpeg-plan')}`;
    expect(
      modelRequests
        .filter((request) => request.images.includes(upright))
        .map((request) => request.name)
        .sort()
    ).toEqual(['client_import', 'import_sorting']);
    expect(world.usage).toHaveLength(6);
    expect(world.usage.filter((usage) => usage.fileId === null)).toHaveLength(2);
    expect(world.usage.map((usage) => usage.step).sort()).toEqual([
      'reading',
      'scanning',
      'scanning',
      'sorting',
      'sorting',
      'sorting',
    ]);
    const kept = [
      'Dosar/Decizia 1.docx',
      'Dosar/PSI/Lista mijloace.doc',
      'Dosar/Scanate/Decizie semnata.pdf',
    ];
    const keptText = kept.reduce((sum, path) => {
      const file = world.fileAt(path);
      const stored = new TextDecoder().decode(world.objects.get(file.text_path!)!);
      return sum + (path.endsWith('.pdf') ? scannedFirstPage.length : stored.length);
    }, 0);
    expect(row.read_characters).toBe(keptText);
    expect(world.scanCharges).toEqual([
      `${world.fileAt('Dosar/Scanate/Decizie semnata.pdf').id}:2`,
    ]);
    expect(world.settled).toEqual([]);
  });

  it('fails a file the model cannot read and still reads the others', async () => {
    model = (request) =>
      request.name === 'client_import' && request.images.length > 0
        ? { not: 'the schema' }
        : defaultModel(request);
    startWith([files[0]!, files[4]!]);
    await drain(deps());

    expect(world.imports.get(importId)!.status).toBe('ready');
    expect(world.fileAt('Dosar/Poze/plan.jpg')).toMatchObject({
      state: 'failed',
      reason: 'Modelul nu a dat un răspuns pe care să-l putem folosi pentru acest fișier.',
    });
    expect(
      world.usage.filter((usage) => usage.fileId === world.fileAt('Dosar/Poze/plan.jpg').id)
    ).toEqual([expect.objectContaining({ input: 1000 }), expect.objectContaining({ input: 2000 })]);
  });

  it('reads a PNG as the upright JPEG made of it and keeps the original as uploaded', async () => {
    const png = { path: 'Dosar/Poze/schita.png', mime: 'image/png', bytes: strToU8('png-schita') };
    startWith([files[0]!, png]);
    await drain(deps());

    const file = world.fileAt(png.path);
    expect(file.derived_path).toBe(file.storage_path.replace(/\.png$/, '.jpg'));
    expect(world.objects.get(file.storage_path)).toEqual(png.bytes);
    const images = modelRequests.flatMap((request) => request.images);
    expect(images).toContain(`data:image/jpeg;base64,${btoa('upright png-schita')}`);
    expect(images.some((image) => image.startsWith('data:image/png'))).toBe(false);
  });

  it('sends a photograph prepared without a converted JPEG as it was uploaded', async () => {
    startWith([files[4]!]);
    await drain(deps(), 1);
    const file = world.fileAt(files[4]!.path);
    world.objects.delete(file.derived_path!);
    Object.assign(file, { derived_path: null });
    await drain(deps());

    expect(world.fileAt(files[4]!.path).state).toBe('read');
    expect(modelRequests.flatMap((request) => request.images)).toContain(
      `data:image/jpeg;base64,${btoa('jpeg-plan')}`
    );
  });

  it('fails the import, without retrying, when the reading is cut off at its output cap', async () => {
    model = (request) =>
      request.name === 'client_import'
        ? Response.json({
            choices: [{ finish_reason: 'length', message: { content: '{"facts": [' } }],
            usage: { prompt_tokens: 1000, completion_tokens: 64_000 },
          })
        : defaultModel(request);
    startWith([files[0]!]);
    const outcomes = await drain(deps());

    expect(outcomes.filter((outcome) => outcome.type === 'read')).toEqual([
      { type: 'read', outcome: 'ack', attempts: 1 },
    ]);
    expect(world.imports.get(importId)).toMatchObject({
      status: 'failed',
      failure_reason: importReasons.modelFailed,
    });
    expect(world.usage.at(-1)).toMatchObject({ fileId: null, input: 1000 });
  });

  it('retries a step the gateway could not answer and fails the import on the last delivery', async () => {
    let calls = 0;
    model = (request) => {
      if (request.name !== 'client_import') return defaultModel(request);
      calls++;
      return new Response('upstream', { status: 503 });
    };
    startWith([files[0]!]);
    const outcomes = await drain(deps());

    const reads = outcomes.filter((outcome) => outcome.type === 'read');
    expect(reads.map((outcome) => outcome.outcome)).toEqual(['retry', 'retry', 'retry', 'ack']);
    expect(reads.at(-1)!.attempts).toBe(lastDelivery);
    expect(calls).toBe(4 * 4);
    expect(world.imports.get(importId)).toMatchObject({
      status: 'failed',
      failure_reason: importReasons.unavailable,
    });
  });

  it('fails the import whose documents have more text than one reading takes, naming the longest', async () => {
    const word = (path: string, characters: number): FileSpec => ({
      ...files[0]!,
      path,
      bytes: docx(['x'.repeat(characters)]),
    });
    startWith([
      word('Dosar/Evaluare riscuri.docx', 300_000),
      word('Dosar/Decizia 1.docx', 240_000),
      word('Dosar/Tematica.docx', 120_000),
      word('Dosar/Plan de prevenire.docx', 60_000),
    ]);
    await drain(deps());

    expect(world.imports.get(importId)).toMatchObject({
      status: 'failed',
      read_characters: 720_000,
      failure_reason:
        'Documentele au cu 20% mai mult text decât încape într-un import. Cele mai lungi: „Evaluare riscuri.docx” (42% din text), „Decizia 1.docx” (33%) și „Tematica.docx” (17%). Scoate-le pe cele care nu trebuie citite.',
    });
    expect(modelRequests.map((request) => request.name)).toEqual(['import_sorting']);
  });

  it('sets own instructions aside with a reason of their own, and offers the names they spell otherwise', async () => {
    const instructions: FileSpec = {
      ...files[0]!,
      path: 'Dosar/IPSSM.docx',
      bytes: docx([
        'BRUTĂRIA FICTIVĂ S.R.L.',
        'Instrucțiuni proprii de securitate și sănătate',
        'Aprobat: administrator Vasilesu Andrei',
      ]),
    };
    model = (request) =>
      request.name === 'import_sorting' && request.images.length === 0
        ? {
            files: [
              ...answers.sorting.files,
              {
                path: 'Dosar/IPSSM.docx',
                kind: 'own_instructions',
                companyName: 'BRUTĂRIA FICTIVĂ S.R.L.',
                companyCui: '',
                carriesClientData: true,
              },
            ],
          }
        : defaultModel(request);
    startWith([files[0]!, instructions]);
    await drain(deps());

    expect(world.imports.get(importId)!.status).toBe('ready');
    expect(world.fileAt('Dosar/IPSSM.docx')).toMatchObject({
      state: 'set_aside',
      document_kind: 'own_instructions',
      reason: fileReasons.ownInstructions,
    });
    const stored = proposalSchema.parse(world.imports.get(importId)!.proposal);
    expect(stored.client.legalRepresentativeName.options).toEqual([
      expect.objectContaining({ value: 'Vasilescu Andrei' }),
      {
        value: 'Vasilesu Andrei',
        sources: [{ file: 'Dosar/IPSSM.docx', quote: 'Aprobat: administrator Vasilesu Andrei' }],
        otherCompanyName: null,
      },
    ]);
    expect(stored.flags.filter((flag) => flag.path.startsWith('client.legalRep'))).toEqual([]);
  });

  it('sets the general training material aside by its kind, even when told it carries client data', async () => {
    const material: FileSpec = {
      ...files[0]!,
      path: 'Dosar/MISSMIG.docx',
      bytes: docx(['BRUTĂRIA FICTIVĂ S.R.L.', 'Material de instruire introductiv-generală']),
    };
    model = (request) =>
      request.name === 'import_sorting' && request.images.length === 0
        ? {
            files: [
              ...answers.sorting.files,
              {
                path: 'Dosar/MISSMIG.docx',
                kind: 'training_material',
                companyName: 'BRUTĂRIA FICTIVĂ S.R.L.',
                companyCui: '',
                carriesClientData: true,
              },
            ],
          }
        : defaultModel(request);
    startWith([files[0]!, material]);
    await drain(deps());

    expect(world.imports.get(importId)!.status).toBe('ready');
    expect(world.fileAt('Dosar/MISSMIG.docx')).toMatchObject({
      state: 'set_aside',
      document_kind: 'training_material',
      reason:
        'Material de instruire introductiv-generală: text general, nu conține date despre client. Îl citim doar dacă ceri.',
    });
  });

  it('fails the import when no file could be prepared', async () => {
    startWith([files[7]!]);
    await drain(deps());

    expect(world.imports.get(importId)).toMatchObject({
      status: 'failed',
      failure_reason: importReasons.nothingPrepared,
    });
    expect(modelRequests).toEqual([]);
  });

  it('does a step only once when its message comes twice', async () => {
    startWith([files[0]!]);
    world.send(world.sent[0]!.body);
    await drain(deps());

    expect(world.imports.get(importId)!.status).toBe('ready');
    expect(modelRequests.map((request) => request.name)).toEqual([
      'import_sorting',
      'client_import',
    ]);
  });

  it('copies a confirmed folder again from where an interrupted copy stopped', async () => {
    world.addImport({ status: 'confirmed' });
    for (const [index, spec] of files.slice(0, 4).entries()) world.addFile(spec, index, 'read');
    world.failCopyAfter = 2;
    world.sent.push({ id: 'copy', body: { type: 'copy', importId }, attempts: lastDelivery });
    const outcomes = await drain(deps());

    expect(outcomes).toEqual([{ type: 'copy', outcome: 'ack', attempts: lastDelivery }]);
    expect(world.clientFiles.size).toBe(2);
    expect(world.imports.get(importId)!.files_copied_at).toBeNull();

    world.failCopyAfter = null;
    const result = await cleanUpImports(deps(), new Date('2026-10-29T10:00:00Z'));

    expect(result).toMatchObject({ copied: 1, uncopied: 0 });
    expect(world.clientFiles.size).toBe(4);
    expect(world.imports.get(importId)!.files_copied_at).not.toBeNull();
  });
});

const longScan: FileSpec = {
  path: 'Dosar/Scanate/Dosar complet.pdf',
  mime: 'application/pdf',
  bytes: strToU8('%PDF long scan'),
};

function scannedPdf(pageCount: number): Partial<ExtractorService> {
  return {
    pdfText: async () => ({
      pageCount,
      pages: Array.from({ length: pageCount }, (_, index) => ({
        number: index + 1,
        text: index === 0 ? scannedFirstPage : '',
        isScan: index > 0,
      })),
    }),
  };
}

const sortingOf = (path: string) => ({
  files: [
    {
      path,
      kind: 'decision',
      companyName: 'BRUTĂRIA FICTIVĂ S.R.L.',
      companyCui: '12345674',
      carriesClientData: true,
    },
  ],
});

describe('tooMuchText', () => {
  it('lets text up to the cap through', () => {
    expect(tooMuchText([{ name: 'Decizia 1.docx', characters: maxReadingCharacters }])).toBeNull();
  });

  it('names a single file over the cap, shortened', () => {
    const name = `${'Instructiuni proprii '.repeat(4)}.docx`;
    expect(tooMuchText([{ name, characters: maxReadingCharacters + 1 }])).toBe(
      `Documentele au cu 1% mai mult text decât încape într-un import. Tot textul este în „${name.slice(0, 59)}…”.`
    );
  });
});

describe('a scan', () => {
  it('reads a long scan in batches of pages, each page once, and gathers the readings', async () => {
    model = (request) =>
      request.name === 'import_sorting'
        ? sortingOf(longScan.path)
        : request.images.length > 0
          ? answers.scannedPage
          : answers.documents;
    startWith([longScan]);
    const outcomes = await drain(deps({ extractor: { ...extractor, ...scannedPdf(12) } }));

    expect(outcomes.filter((outcome) => outcome.type === 'scan')).toHaveLength(1 + 3);
    expect(world.imports.get(importId)!.status).toBe('ready');
    const file = world.fileAt(longScan.path);
    expect(file.state).toBe('read');
    const pages = modelRequests.filter(
      (request) => request.name === 'client_import' && request.images.length > 0
    );
    expect(pages).toHaveLength(11);
    const prepared = JSON.parse(new TextDecoder().decode(world.objects.get(file.text_path!)!)) as {
      readings: Record<string, unknown>;
    };
    expect(Object.keys(prepared.readings)).toHaveLength(11);
    expect(prepared.readings[`${longScan.path} (pagina 12)`]).toBeDefined();
    expect(world.pageImages.size).toBe(0);
    expect(world.scanCharges).toEqual(
      Array.from({ length: 11 }, (_, index) => `${file.id}:${index + 2}`)
    );
  });

  it('reads the pages of a scan whose step was sent twice only once', async () => {
    world.addImport({ status: 'reading' });
    const id = world.addFile(longScan, 0, 'prepared');
    world.files.get(id)!.text_path = world.files.get(id)!.storage_path.replace(/\.pdf$/, '.json');
    world.files.get(id)!.document_kind = 'decision';
    world.objects.set(
      world.files.get(id)!.text_path!,
      strToU8(JSON.stringify(await scannedPdf(7).pdfText!(new ArrayBuffer(0))))
    );
    world.send({ type: 'scan', importId, fileId: id });
    world.send({ type: 'scan', importId, fileId: id });
    world.send({ type: 'read', importId, waits: 0 });
    await drain(deps());

    expect(world.fileAt(longScan.path).state).toBe('read');
    expect(modelRequests.filter((request) => request.images.length > 0)).toHaveLength(6);
    expect(world.scanCharges).toHaveLength(6);
  });

  it('gives up on the scans only after half an hour in which no page was read', async () => {
    world.addImport({ status: 'reading' });
    world.addFile(longScan, 0, 'prepared');
    world.send({ type: 'read', importId, waits: maxReadWaits - 1, progress: 3 });
    await drain(deps(), 1);

    expect(world.sent.map((message) => message.body)).toEqual([
      { type: 'read', importId, waits: 0, progress: 0 },
    ]);
    world.sent[0]!.body = { type: 'read', importId, waits: maxReadWaits - 1, progress: 0 };
    await drain(deps(), 1);

    expect(world.imports.get(importId)).toMatchObject({
      status: 'failed',
      failure_reason: importReasons.scansUnfinished,
    });
  });
});

describe('a file whose upload was not what was declared', () => {
  it('fails the file and records its real size', async () => {
    startWith([files[0]!]);
    world.fileAt(files[0]!.path).size_bytes = 10;
    await drain(deps());

    expect(world.fileAt(files[0]!.path)).toMatchObject({
      state: 'failed',
      reason: fileReasons.sizeMismatch,
      size_bytes: files[0]!.bytes.length,
    });
    expect(world.imports.get(importId)).toMatchObject({
      status: 'failed',
      failure_reason: importReasons.nothingPrepared,
    });
  });

  it('fails the import, without retrying, when its real size breaks the caps', async () => {
    startWith([files[0]!, files[4]!]);
    world.fileAt(files[0]!.path).size_bytes = 10;
    world.sizeLimit = 100;
    const outcomes = await drain(deps());

    expect(outcomes.every((outcome) => outcome.outcome === 'ack')).toBe(true);
    expect(world.imports.get(importId)).toMatchObject({
      status: 'failed',
      failure_reason: importReasons.overLimits.client,
    });
    expect(modelRequests).toEqual([]);
  });
});

describe('an unavailable extractor', () => {
  it('defers the file with longer and longer waits, then retries and fails it', async () => {
    startWith([files[2]!]);
    const pipeline = deps({
      extractor: {
        ...extractor,
        pdfText: async () => {
          throw new Error('extraction_failed');
        },
      },
    });
    const outcomes = await drain(pipeline);

    const prepares = outcomes.filter((outcome) => outcome.type === 'prepare');
    expect(prepares).toHaveLength(maxDeferrals + lastDelivery);
    expect(prepares.slice(0, maxDeferrals + 1).every((outcome) => outcome.attempts === 1)).toBe(
      true
    );
    expect(world.fileAt(files[2]!.path)).toMatchObject({
      state: 'failed',
      reason: fileReasons.unavailable,
    });
  });

  it('fails at once a file the extractor refused as too slow', async () => {
    startWith([files[2]!]);
    const outcomes = await drain(
      deps({
        extractor: {
          ...extractor,
          pdfText: async () => {
            throw new Error(extractionRefused('timeout'));
          },
        },
      })
    );

    expect(outcomes.filter((outcome) => outcome.type === 'prepare')).toEqual([
      { type: 'prepare', outcome: 'ack', attempts: 1 },
    ]);
    expect(world.fileAt(files[2]!.path)).toMatchObject({
      state: 'failed',
      reason: fileReasons.timeout,
    });
  });

  it('waits longer each time it defers', async () => {
    world.addImport();
    const id = world.addFile(files[2]!, 0);
    world.send({ type: 'prepare', importId, fileId: id, deferred: 2 });
    await drain(
      deps({
        extractor: {
          ...extractor,
          pdfText: async () => {
            throw new Error('extraction_failed');
          },
        },
      }),
      1
    );

    expect(world.sent).toEqual([
      expect.objectContaining({
        body: { type: 'prepare', importId, fileId: id, deferred: 3 },
        delaySeconds: 240,
      }),
    ]);
  });
});

describe('a step that finishes after the import failed', () => {
  it('leaves the import failed', async () => {
    startWith([files[0]!]);
    await drain(deps(), 1);
    world.imports.get(importId)!.status = 'failed';
    await drain(deps());

    expect(world.imports.get(importId)!.status).toBe('failed');
    expect(modelRequests).toEqual([]);
  });
});

describe('consumeImportDeadLetters', () => {
  const dead = (body: ImportMessage) =>
    ({ id: 'dead', body, attempts: 1, ack: vi.fn(), retry: vi.fn() }) satisfies QueueMessage;

  it('fails the file whose scan every delivery lost, and the import whose step it lost', async () => {
    world.addImport({ status: 'reading' });
    const id = world.addFile(longScan, 0, 'prepared');
    const scan = dead({ type: 'scan', importId, fileId: id, pages: [2, 3] });
    await consumeImportDeadLetters({ messages: [scan] }, {}, deps());

    expect(scan.ack).toHaveBeenCalled();
    expect(world.fileAt(longScan.path)).toMatchObject({
      state: 'failed',
      reason: fileReasons.stopped,
    });

    const read = dead({ type: 'read', importId, waits: 3 });
    await consumeImportDeadLetters({ messages: [read] }, {}, deps());
    expect(world.imports.get(importId)).toMatchObject({
      status: 'failed',
      failure_reason: importReasons.failed,
    });
  });
});

describe('cleanUpImports', () => {
  const folder = `${organizationId}/old-import`;

  it('fails what stalled, removes objects before the rows that name them, and keeps what it could not remove', async () => {
    world.objects.set(`${folder}/a.pdf`, strToU8('a'));
    world.objects.set(`${folder}/a.json`, strToU8('a'));
    world.objects.set(`${folder}/a.page-2.json`, strToU8('a'));
    world.objects.set(`${organizationId}/stuck/b.pdf`, strToU8('b'));
    world.abandoned = [
      { importId: 'old-import', paths: [`${folder}/a.json`, `${folder}/a.pdf`] },
      { importId: 'stuck', paths: [`${organizationId}/stuck/b.pdf`] },
      { importId: 'empty', paths: [] },
    ];
    world.toEmpty = [{ importId: 'done', paths: [`${organizationId}/done/c.docx`] }];
    world.failRemovalOf.add(`${organizationId}/stuck/b.pdf`);
    const result = await cleanUpImports(deps());

    expect(world.calls).toEqual([
      `failStalled ${importReasons.stalled} | ${importReasons.left}`,
      `failStalledLibraryParts ${libraryReasons.stalled} ${riskReasons.stalled}`,
      'remove 3',
      'remove 0',
      'deleteAbandoned old-import,empty',
      'dropProposals',
      'remove 1',
      'markObjectsRemoved done',
    ]);
    expect(world.objects.has(`${folder}/a.page-2.json`)).toBe(false);
    expect(world.objects.has(`${organizationId}/stuck/b.pdf`)).toBe(true);
    expect(result).toMatchObject({
      failed: 1,
      failedParts: 1,
      deleted: 2,
      dropped: 2,
      emptied: 1,
      left: 1,
    });
  });

  it("removes the copies past their 12 months, leaving an import's parts that are not", async () => {
    const old = `${organizationId}/old-import`;
    world.copies.set(`${old}/proposal.json`, strToU8('{}'));
    world.copies.set(`${old}/files/a.pdf`, strToU8('a'));
    world.copies.set(`${old}/parts/instructions_ssm/proposal.json`, strToU8('{}'));
    world.copies.set(`${old}/parts/risk_evaluations/proposal.json`, strToU8('{}'));
    world.copies.set(`${organizationId}/stuck/proposal.json`, strToU8('{}'));
    world.expiredCopies = [
      { id: 'own', part: null, folder: old },
      { id: 'risks', part: 'risk_evaluations', folder: `${old}/parts/risk_evaluations` },
      { id: 'stuck', part: null, folder: `${organizationId}/stuck` },
    ];
    world.failRemovalOf.add(`${organizationId}/stuck/proposal.json`);
    const result = await cleanUpImports(deps());

    expect(world.calls.slice(-3)).toEqual([
      'remove copies 2',
      'remove copies 1',
      'markCopiesRemoved own,risks',
    ]);
    expect([...world.copies.keys()]).toEqual([
      `${old}/parts/instructions_ssm/proposal.json`,
      `${organizationId}/stuck/proposal.json`,
    ]);
    expect(result).toMatchObject({ copiesRemoved: 2, left: 1 });
  });

  it('marks a copy whose folder holds nothing of its own removed without calling Storage', async () => {
    const parted = `${organizationId}/parted-import`;
    world.copies.set(`${parted}/parts/instructions_ssm/proposal.json`, strToU8('{}'));
    world.expiredCopies = [
      { id: 'gone', part: null, folder: `${organizationId}/gone-import` },
      { id: 'parted', part: null, folder: parted },
    ];
    const result = await cleanUpImports(deps());

    expect(world.calls.filter((call) => call.startsWith('remove copies'))).toEqual([]);
    expect(world.calls.at(-1)).toBe('markCopiesRemoved gone,parted');
    expect(world.copies.has(`${parted}/parts/instructions_ssm/proposal.json`)).toBe(true);
    expect(result).toMatchObject({ copiesRemoved: 2 });
  });
});

describe('an employee import', () => {
  const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
  const positionId = 'b0000000-0000-4000-8000-000000000001';

  const sheetFiles: FileSpec[] = [
    { path: 'Fise/Popescu 1.jpg', mime: 'image/jpeg', bytes: strToU8('jpeg-popescu-1') },
    { path: 'Fise/Popescu 2.jpg', mime: 'image/jpeg', bytes: strToU8('jpeg-popescu-2') },
    { path: 'Fise/Ionescu.pdf', mime: 'application/pdf', bytes: strToU8('%PDF ionescu') },
  ];

  const noPerson = { lastName: null, firstName: null, cnp: null, employeeNumber: null };
  const noFields = {
    birthDate: null,
    birthPlace: null,
    homeAddress: null,
    education: null,
    qualification: null,
    bloodGroup: null,
    rhFactor: null,
    jobTitle: null,
    hiredAt: null,
    leftOn: null,
    workplace: null,
    commuteRoute: null,
    commuteMinutes: null,
  };

  const sheet = (overrides: Record<string, unknown>) => ({
    pageKind: 'ssm_sheet_front',
    person: noPerson,
    fields: noFields,
    admission: { admittedOn: null, admittedByName: null, admittedByJobTitle: null },
    trainings: [],
    unreadable: [],
    notes: [],
    ...overrides,
  });

  const row = (overrides: Record<string, unknown>) => ({
    domain: 'ssm',
    phase: 'introductory_general',
    annualTest: false,
    heldOn: '2015-03-02',
    durationMinutes: 480,
    trainerName: 'Vasile Georgescu',
    trainerJobTitle: 'Inspector SSM',
    verifierName: 'Elena Marin',
    verifierJobTitle: 'Administrator',
    material: 'Legislația SSM',
    supplementaryReason: null,
    traineeSignature: 'present',
    trainerSignature: 'present',
    verifierSignature: 'present',
    ...overrides,
  });

  const sheetAnswers: Record<string, unknown> = {
    'Fise/Popescu 1.jpg': sheet({
      person: { ...noPerson, lastName: 'Popescu', firstName: 'Ion' },
      fields: { ...noFields, jobTitle: 'Vânzător', hiredAt: '2015-03-02' },
      trainings: [row({})],
    }),
    'Fise/Popescu 2.jpg': sheet({
      pageKind: 'ssm_periodic',
      trainings: [
        row({
          phase: 'periodic',
          heldOn: '2023-05-10',
          durationMinutes: 60,
          trainerName: null,
          trainerJobTitle: null,
          verifierName: null,
          verifierJobTitle: null,
          material: 'IPSSM',
          verifierSignature: 'no_box',
        }),
      ],
    }),
    'Fise/Ionescu.pdf (pagina 1)': sheet({
      person: { ...noPerson, lastName: 'Ionescu', firstName: 'Maria' },
      fields: { ...noFields, jobTitle: 'Vânzătoare', hiredAt: '2019-01-07' },
    }),
    'Fise/Ionescu.pdf (pagina 2)': sheet({
      pageKind: 'su_sheet_front',
      person: { ...noPerson, lastName: 'Ionescu', firstName: 'Maria' },
    }),
  };

  const sheetModel =
    (answers: Record<string, unknown>): Recorded =>
    ({ name, text }) => {
      if (name !== 'sheet_page') throw new Error(`Unexpected request ${name}`);
      const label = Object.keys(answers).find((each) => text.includes(`=== FILE: ${each} ===`));
      return label === undefined ? { unexpected: true } : answers[label];
    };

  function startEmployees(specs: FileSpec[]) {
    world.addImport({ kind: 'employees', client_id: clientId, into_existing_client: true });
    for (const [index, spec] of specs.entries()) {
      const id = world.addFile(spec, index);
      world.send({ type: 'prepare', importId, fileId: id });
    }
  }

  beforeEach(() => {
    world.sheetClient = {
      jobPositions: [{ id: positionId, name: 'Vânzător' }],
      workplaces: [],
      employees: [],
    };
    extractor.pdfPageImage.mockClear();
  });

  it('reads every photograph and PDF page on its own, without sorting, into people ready for review', async () => {
    model = sheetModel(sheetAnswers);
    startEmployees([
      ...sheetFiles,
      {
        path: 'Fise/nota.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        bytes: docx(['O notă']),
      },
    ]);
    const outcomes = await drain(deps());

    expect(outcomes.every((outcome) => outcome.outcome === 'ack')).toBe(true);
    const imported = world.imports.get(importId)!;
    expect(imported.status).toBe('ready');
    expect(modelRequests).toHaveLength(4);
    expect(
      modelRequests.every(
        (request) =>
          request.name === 'sheet_page' &&
          request.effort === 'medium' &&
          request.maxTokens === 16_000 &&
          request.images.length === 1 &&
          request.metadata === JSON.stringify({ organizationId, importId })
      )
    ).toBe(true);
    const pdf = world.fileAt('Fise/Ionescu.pdf');
    const photo = world.fileAt('Fise/Popescu 1.jpg');
    const second = world.fileAt('Fise/Popescu 2.jpg');
    expect(world.usage.map((usage) => `${usage.step} ${usage.fileId}`).sort()).toEqual(
      [
        `scanning ${pdf.id}`,
        `scanning ${pdf.id}`,
        `scanning ${photo.id}`,
        `scanning ${second.id}`,
      ].sort()
    );
    expect(extractor.pdfPageImage).toHaveBeenCalledTimes(2);
    const pageImage = strToU8('jpeg-page');
    for (const page of [1, 2]) {
      expect(world.objects.get(pdf.storage_path.replace(/\.pdf$/, `.page-${page}.jpg`))).toEqual(
        pageImage
      );
    }
    expect(Object.fromEntries(world.pageImages)).toEqual({
      [`${pdf.id}:1`]: { sizeBytes: pageImage.length, sha256: await sha256(pageImage) },
      [`${pdf.id}:2`]: { sizeBytes: pageImage.length, sha256: await sha256(pageImage) },
    });
    expect(
      modelRequests.filter((request) =>
        request.images.includes(`data:image/jpeg;base64,${btoa('upright jpeg-popescu-1')}`)
      )
    ).toHaveLength(1);
    for (const spec of sheetFiles) {
      expect(world.fileAt(spec.path)).toMatchObject({ state: 'read', is_scan: true });
    }
    expect(world.fileAt('Fise/nota.docx')).toMatchObject({
      state: 'set_aside',
      reason: fileReasons.notASheet,
    });

    const proposal = employeeImportProposalSchema.parse(imported.proposal);
    expect(proposal.pages.map((page) => [page.label, page.page, page.fileId])).toEqual([
      ['Fise/Ionescu.pdf (pagina 1)', 1, pdf.id],
      ['Fise/Ionescu.pdf (pagina 2)', 2, pdf.id],
      ['Fise/Popescu 1.jpg', null, photo.id],
      ['Fise/Popescu 2.jpg', null, second.id],
    ]);
    expect(proposal.people).toHaveLength(2);
    const popescu = proposal.people.find(
      (person) => person.fields.lastName.options[0]?.value === 'Popescu'
    )!;
    expect(popescu.pageIds).toEqual(['page-3', 'page-4']);
    expect(proposal.pages[3]!.placement).toBe('placed_by_order');
    expect(proposal.jobTitles.find((group) => group.title === 'Vânzător')).toMatchObject({
      match: 'exact',
      proposedId: positionId,
    });
    expect(proposal.pages[3]!.rows[0]).toMatchObject({
      trainerName: null,
      trainerJobTitle: null,
      material: 'IPSSM',
      fromThemes: [],
    });
    expect(proposal.pages[2]!.rows[0]!.test).toMatchObject({ test: 'hiring', verified: true });
  });

  it('places a nameless page after the page numbered before it, not after the name sorted before it', async () => {
    const scans: FileSpec[] = [
      { path: 'Fise/Scan 1.jpg', mime: 'image/jpeg', bytes: strToU8('jpeg-scan-1') },
      { path: 'Fise/Scan 10.jpg', mime: 'image/jpeg', bytes: strToU8('jpeg-scan-10') },
      { path: 'Fise/Scan 2.jpg', mime: 'image/jpeg', bytes: strToU8('jpeg-scan-2') },
    ];
    model = sheetModel({
      'Fise/Scan 1.jpg': sheetAnswers['Fise/Popescu 1.jpg'],
      'Fise/Scan 2.jpg': sheetAnswers['Fise/Popescu 2.jpg'],
      'Fise/Scan 10.jpg': sheetAnswers['Fise/Ionescu.pdf (pagina 1)'],
    });
    startEmployees(scans);
    await drain(deps());

    const proposal = employeeImportProposalSchema.parse(world.imports.get(importId)!.proposal);
    expect(proposal.pages.map((page) => page.label)).toEqual([
      'Fise/Scan 1.jpg',
      'Fise/Scan 2.jpg',
      'Fise/Scan 10.jpg',
    ]);
    const popescu = proposal.people.find(
      (person) => person.fields.lastName.options[0]?.value === 'Popescu'
    )!;
    expect(popescu.pageIds).toEqual(['page-1', 'page-2']);
  });

  it('keeps a page the model cannot answer for as unread, and reads the rest', async () => {
    const answers = { ...sheetAnswers };
    delete answers['Fise/Popescu 2.jpg'];
    model = sheetModel(answers);
    startEmployees(sheetFiles);
    await drain(deps());

    const imported = world.imports.get(importId)!;
    expect(imported.status).toBe('ready');
    expect(world.fileAt('Fise/Popescu 2.jpg').state).toBe('read');
    const proposal = employeeImportProposalSchema.parse(imported.proposal);
    expect(proposal.pages[3]).toMatchObject({
      kind: null,
      personId: null,
      placement: 'unplaced',
      rows: [],
    });
    expect(proposal.people).toHaveLength(2);
  });

  it('keeps a page the gateway refuses as unread, and keeps the PDF pages already read', async () => {
    model = (request) =>
      request.text.includes('=== FILE: Fise/Ionescu.pdf (pagina 2) ===')
        ? new Response('too large', { status: 413 })
        : sheetModel(sheetAnswers)(request);
    startEmployees(sheetFiles);
    await drain(deps());

    const imported = world.imports.get(importId)!;
    expect(imported.status).toBe('ready');
    expect(world.fileAt('Fise/Ionescu.pdf').state).toBe('read');
    const proposal = employeeImportProposalSchema.parse(imported.proposal);
    expect(proposal.pages[0]!.kind).toBe('ssm_sheet_front');
    expect(proposal.pages[1]).toMatchObject({ kind: null, placement: 'unplaced', rows: [] });
  });

  it('reads a page again after the gateway was busy', async () => {
    let busy = 8;
    model = (request) =>
      request.text.includes('=== FILE: Fise/Popescu 2.jpg ===') && busy-- > 0
        ? new Response('busy', { status: 503 })
        : sheetModel(sheetAnswers)(request);
    startEmployees(sheetFiles);
    const outcomes = await drain(deps());

    expect(outcomes.some((outcome) => outcome.outcome === 'retry')).toBe(true);
    const proposal = employeeImportProposalSchema.parse(world.imports.get(importId)!.proposal);
    expect(proposal.pages[3]!.kind).toBe('ssm_periodic');
  });

  it('settles the start on the pages the extractor counted: one more than the browser for a PDF it could not count', async () => {
    model = sheetModel(sheetAnswers);
    startEmployees(sheetFiles);
    await drain(deps());

    expect(world.settled).toEqual([1]);
    expect(world.imports.get(importId)!.status).toBe('ready');
    expect(world.scanCharges).toEqual([]);
  });

  it('gives back the pages the browser counted that the PDF does not have', async () => {
    model = sheetModel(sheetAnswers);
    startEmployees(sheetFiles);
    world.fileAt('Fise/Ionescu.pdf').declared_pages = 5;
    await drain(deps());

    expect(world.settled).toEqual([-3]);
    expect(world.imports.get(importId)!.status).toBe('ready');
  });

  it('fails the import before any page is read when the credits do not cover the pages counted past the start', async () => {
    model = sheetModel(sheetAnswers);
    world.creditsCoverPages = false;
    startEmployees(sheetFiles);
    await drain(deps());

    expect(world.imports.get(importId)).toMatchObject({
      status: 'failed',
      failure_reason: importReasons.creditsShort,
    });
    expect(modelRequests).toHaveLength(0);
  });

  it('fails the import past 500 pages, before any page is read', async () => {
    model = sheetModel(sheetAnswers);
    extractor.pdfText.mockResolvedValueOnce({
      pageCount: 501,
      pages: Array.from({ length: 501 }, (_, index) => ({
        number: index + 1,
        text: '',
        isScan: true,
      })),
    });
    startEmployees([sheetFiles[2]!]);
    await drain(deps());

    expect(world.imports.get(importId)).toMatchObject({
      status: 'failed',
      failure_reason: importReasons.tooManyScans.employees,
    });
    expect(modelRequests).toHaveLength(0);
  });

  it('fails the import that holds no photograph and no PDF', async () => {
    startEmployees([
      {
        path: 'Fise/nota.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        bytes: docx(['O notă']),
      },
    ]);
    await drain(deps());

    expect(world.imports.get(importId)).toMatchObject({
      status: 'failed',
      failure_reason: importReasons.noSheets,
    });
  });

  it('fails the import when no page could be read', async () => {
    model = sheetModel(sheetAnswers);
    extractor.pdfPageImage.mockRejectedValueOnce(new Error(extractionRefused('too_large')));
    startEmployees([sheetFiles[2]!]);
    await drain(deps());

    expect(world.fileAt('Fise/Ionescu.pdf').state).toBe('failed');
    expect(world.imports.get(importId)).toMatchObject({
      status: 'failed',
      failure_reason: importReasons.noSheetRead,
    });
  });
});

describe('the own instructions', () => {
  const grinderHeading =
    'Subcapitolul XIII.I. Instrucțiuni proprii privind utilizarea mașinii de tocat carne la brutăria din curte';
  const tillHeading =
    'Subcapitolul XIII.II. Instrucțiuni proprii privind lucrul la casa de marcat și la cântarul electronic din magazin';
  const grinderEnd = 'Înainte de curățare mașina se oprește și se scoate ștecherul din priză.';
  const tillEnd = 'Cântarul electronic se verifică metrologic la termenele prevăzute de lege.';
  const tillFirst =
    'Casa de marcat se folosește numai de lucrătorii instruiți de furnizorul ei autorizat.';
  const word = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  const packFiles: FileSpec[] = [
    files[0]!,
    {
      path: 'Dosar/IPSSM.docx',
      mime: word,
      bytes: docx([
        'Capitolul I. Informații generale',
        'Art. 1. Prezentele instrucțiuni se aplică tuturor lucrătorilor brutăriei.',
        grinderHeading,
        'Art. 2. Mașina de tocat se pornește numai cu capacul de protecție montat și închis.',
        `Art. 3. ${grinderEnd}`,
        tillHeading,
        `Art. 4. ${tillFirst}`,
        `Art. 5. ${tillEnd}`,
      ]),
    },
    {
      path: 'Dosar/Tematica.docx',
      mime: word,
      bytes: docx(['TEMATICA DE INSTRUIRE', 'FUNCȚIA : BRUTAR', 'IPSSM Art. 1 – 5']),
    },
  ];

  const sorting = {
    files: [
      { ...answers.sorting.files[0]!, domain: '' },
      {
        path: 'Dosar/IPSSM.docx',
        kind: 'own_instructions',
        companyName: 'BRUTĂRIA FICTIVĂ S.R.L.',
        companyCui: '',
        carriesClientData: true,
        domain: 'ssm',
      },
      {
        path: 'Dosar/Tematica.docx',
        kind: 'training_themes',
        companyName: 'BRUTĂRIA FICTIVĂ S.R.L.',
        companyCui: '',
        carriesClientData: true,
        domain: 'ssm',
      },
    ],
  };

  const instructions = {
    instructions: [
      {
        file: 'Dosar/IPSSM.docx',
        number: 'XIII.I',
        title:
          'Instrucțiuni proprii privind utilizarea mașinii de tocat carne la brutăria din curte',
        category: 'work_equipment',
        startWords: grinderHeading,
        endWords: grinderEnd,
      },
      {
        file: 'Dosar/IPSSM.docx',
        number: 'XIII.II',
        title:
          'Instrucțiuni proprii privind lucrul la casa de marcat și la cântarul electronic din magazin',
        category: 'work_equipment',
        startWords: tillHeading,
        endWords: tillEnd,
      },
    ],
    positions: [
      {
        post: 'BRUTAR',
        variant: '',
        clientPost: '',
        section: 'workplace',
        citation: 'IPSSM Art. 1 – 5',
        file: 'Dosar/Tematica.docx',
        quote: 'FUNCȚIA : BRUTAR',
      },
    ],
  };

  const till: LibraryModule = {
    id: 'b1000000-0000-4000-8000-000000000001',
    title: 'Lucrul la casa de marcat',
    category: 'work_equipment',
    domain: 'ssm',
    body: {
      blocks: [
        { kind: 'article', paragraphs: [tillFirst] },
        { kind: 'article', paragraphs: [tillEnd] },
      ],
    },
  };

  const packModel =
    (answer: unknown = instructions): Recorded =>
    (request) => {
      if (request.name === 'import_sorting') return sorting;
      if (request.name === 'import_instructions_ssm') return answer;
      return defaultModel(request);
    };

  const part = () => world.parts.get(`${importId}:instructions_ssm`)!;

  it('reads them for the library once the client is ready, apart from the client reading', async () => {
    world.library = [till];
    model = packModel();
    startWith(packFiles);
    const outcomes = await drain(deps());

    expect(outcomes.every((outcome) => outcome.outcome === 'ack')).toBe(true);
    expect(world.imports.get(importId)!.status).toBe('ready');
    expect(world.fileAt('Dosar/IPSSM.docx')).toMatchObject({
      state: 'set_aside',
      document_domain: 'ssm',
      reason: 'Instrucțiuni proprii: le citim pentru biblioteca ta de instrucțiuni proprii.',
    });
    expect(world.fileAt('Dosar/Tematica.docx')).toMatchObject({
      state: 'read',
      document_domain: 'ssm',
    });
    expect(world.fileAt('Dosar/Decizia 1.docx').document_domain).toBeNull();
    expect(world.parts.has(`${importId}:instructions_su`)).toBe(false);

    expect(part()).toMatchObject({ status: 'to_review', attempt: 1 });
    const proposal = instructionsProposalSchema.parse(part().proposal);
    expect(
      proposal.instructions.map((instruction) => [
        instruction.title,
        instruction.status,
        instruction.articleCount,
        instruction.match?.moduleId ?? null,
      ])
    ).toEqual([
      ['Utilizarea mașinii de tocat carne la brutăria din curte', 'new', 2, null],
      ['Lucrul la casa de marcat și la cântarul electronic din magazin', 'identical', 2, till.id],
    ]);
    expect(proposal.positions[0]).toMatchObject({
      post: 'BRUTAR',
      resolution: { kind: 'resolved' },
    });

    const reading = modelRequests.find((request) => request.name === 'client_import')!;
    const read = modelRequests.find((request) => request.name === 'import_instructions_ssm')!;
    expect(reading.metadata).toBe(JSON.stringify({ organizationId, importId }));
    expect(read.metadata).toBe(
      JSON.stringify({ organizationId, importId, part: 'instructions_ssm' })
    );
    expect(read.maxTokens).toBe(16_000);
    expect(world.partCharges).toEqual(['instructions_ssm:1']);
    expect(world.partUsage).toEqual([
      { part: 'instructions_ssm', input: 1000, cost: expect.any(Number) },
    ]);
    expect(world.usage.map((usage) => usage.step).sort()).toEqual(['reading', 'sorting']);
  });

  it('proposes the client’s name after a title a fire-safety module already has', async () => {
    world.library = [
      {
        ...till,
        id: 'b1000000-0000-4000-8000-000000000002',
        title: 'Utilizarea mașinii de tocat carne la brutăria din curte',
        category: 'premises_activity',
        domain: 'su',
        body: { blocks: [{ kind: 'article', paragraphs: ['Stingătorul stă lângă ușă.'] }] },
      },
    ];
    model = packModel();
    startWith(packFiles);
    await drain(deps());

    const proposal = instructionsProposalSchema.parse(part().proposal);
    expect(proposal.instructions[0]).toMatchObject({
      status: 'new',
      title: 'Utilizarea mașinii de tocat carne la brutăria din curte (Brutăria Fictivă)',
    });
  });

  it('says nothing is new when every instruction is in the library already', async () => {
    world.library = [till];
    model = packModel({ ...instructions, instructions: [instructions.instructions[1]!] });
    startWith(packFiles);
    await drain(deps());

    expect(part().status).toBe('nothing_new');
  });

  it('fails the part, not the import, when the answer cannot be used', async () => {
    model = packModel({ not: 'the schema' });
    startWith(packFiles);
    const outcomes = await drain(deps());

    expect(outcomes.every((outcome) => outcome.outcome === 'ack')).toBe(true);
    expect(world.imports.get(importId)!.status).toBe('ready');
    expect(part()).toMatchObject({
      status: 'failed',
      failure_reason: libraryReasons.modelFailed,
    });
    expect(world.partCharges).toEqual(['instructions_ssm:1']);
  });

  it("keeps the part's reading version and flags", async () => {
    world.library = [till];
    model = packModel();
    startWith(packFiles);
    await drain(deps());

    expect(part().reading_version).toEqual({
      models: { instructions: 'gpt-6.1-terra', similarity: 'gpt-6-luna' },
      prompts: expect.stringMatching(/^[0-9a-f]{12}$/),
    });
    expect(part().reading_flags).toMatchObject({
      found: { instructions: 2, unread: 0 },
      nothingFound: [],
    });
    expect(world.recordedCopies).toEqual([]);
  });

  it("writes the part's copy beside the import's when it fails", async () => {
    model = packModel({ not: 'the schema' });
    startWith(packFiles);
    await drain(deps());

    expect(part().status).toBe('failed');
    expect(world.recordedCopies).toEqual([`${importId}:instructions_ssm`]);
    const folder = `${organizationId}/${importId}/parts/instructions_ssm`;
    expect([...world.copies.keys()].filter((path) => path.startsWith(folder)).sort()).toEqual([
      `${folder}/files/instructions_ssm.1.claim.json`,
      `${folder}/record.json`,
    ]);
    const record = JSON.parse(new TextDecoder().decode(world.copies.get(`${folder}/record.json`)));
    expect(record).toMatchObject({
      import: importId,
      part: 'instructions_ssm',
      status: 'failed',
      failureReason: libraryReasons.modelFailed,
      importStatus: 'ready',
      objects: ['files/instructions_ssm.1.claim.json'],
    });
    expect(world.alerts.map((alert) => alert.title)).toContain('Failed on our side');
  });

  it('reads a retried part under its next attempt, once, and ignores the message of the one before', async () => {
    model = packModel({ not: 'the schema' });
    startWith(packFiles);
    await drain(deps());
    Object.assign(part(), { status: 'reading', attempt: 2, failure_reason: null });
    model = packModel();
    modelRequests = [];
    world.send({ type: 'read-instructions', importId, part: 'instructions_ssm', attempt: 1 });
    world.send({ type: 'read-instructions', importId, part: 'instructions_ssm', attempt: 2 });
    world.send({ type: 'read-instructions', importId, part: 'instructions_ssm', attempt: 2 });
    await drain(deps());

    expect(part()).toMatchObject({ status: 'to_review', attempt: 2 });
    expect(world.partCharges).toEqual(['instructions_ssm:1', 'instructions_ssm:2']);
    expect(
      modelRequests.filter((request) => request.name === 'import_instructions_ssm')
    ).toHaveLength(1);
  });

  it('fails a part whose files are too long for one reading, before anything is charged', async () => {
    const long = Array.from(
      { length: 8_200 },
      (_, index) => `Art. ${index + 1}. ${'x'.repeat(95)}`
    );
    model = packModel();
    startWith([files[0]!, { ...packFiles[1]!, bytes: docx(long) }, packFiles[2]!]);
    await drain(deps());

    expect(part().status).toBe('failed');
    expect(part().failure_reason).toMatch(/mai mult decât încap într-o citire \(800\.000\)\.$/);
    expect(world.partCharges).toEqual([]);
    expect(modelRequests.some((request) => request.name === 'import_instructions_ssm')).toBe(false);
  });

  it('fails the part whose step every delivery lost', async () => {
    world.addImport({ status: 'ready' });
    world.parts.set(`${importId}:instructions_ssm`, {
      import_id: importId,
      part: 'instructions_ssm',
      status: 'reading',
      attempt: 1,
      proposal: null,
    });
    const message = {
      id: 'lost',
      body: { type: 'read-instructions', importId, part: 'instructions_ssm', attempt: 1 },
      attempts: 1,
      ack: vi.fn(),
      retry: vi.fn(),
    } satisfies QueueMessage;
    await consumeImportDeadLetters({ messages: [message] }, {}, deps());

    expect(part()).toMatchObject({ status: 'failed', failure_reason: libraryReasons.failed });
  });
});

describe('the risk evaluations', () => {
  const word = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const bakerHeading =
    'SUBCAPITOLUL V.I. EVALUAREA RISCURILOR PENTRU LOCUL DE MUNCĂ : BRUTĂRIE, POSTUL DE LUCRU : BRUTAR';
  const sensitiveHeading =
    'SUBCAPITOLUL V.II. EVALUAREA RISCURILOR PENTRU LOCUL DE MUNCĂ : GRUPURI SENSIBILE';
  const mixer =
    '| MIJLOACE DE PRODUCŢIE | Factori de risc mecanic | F1. Prinderea degetelor în malaxorul de aluat pornit. | ITM / 45-180 zile | 3 | 3 | 3 |';

  const assessment: FileSpec = {
    path: 'Dosar/Evaluarea riscurilor.docx',
    mime: word,
    bytes: docx([
      'BRUTĂRIA FICTIVĂ S.R.L.',
      bakerHeading,
      '2. Mijloace de producţie :',
      'Cuptor electric cu trei vetre și malaxor de aluat.',
      '| COMPONENTA | FACTORI | FORMA | CONSECINŢA | GRAVITATE | PROBABILITATE | NIVEL |',
      mixer,
      '| MIJLOACE DE PRODUCŢIE | Factori de risc mecanic | F2. Tăierea mâinilor cu cuțitul de feliat pâine. | ITM / 3-45 zile | 2 | 5 | 3 |',
      sensitiveHeading,
      mixer,
    ]),
  };

  const sorting = {
    files: [
      answers.sorting.files[0]!,
      {
        path: assessment.path,
        kind: 'risk_assessment',
        companyName: 'BRUTĂRIA FICTIVĂ S.R.L.',
        companyCui: '',
        carriesClientData: true,
      },
    ],
  };

  const documents = {
    ...answers.documents,
    jobPositions: [
      {
        name: 'Brutar',
        trainingIntervalMonths: null,
        workZone: null,
        managementOnly: false,
        needsProtectiveEquipment: null,
        ...quoted(assessment.path, 'POSTUL DE LUCRU : BRUTAR'),
      },
    ],
  };

  const none = { startWords: '', endWords: '' };
  const columns = {
    component: 1,
    group: 2,
    description: 3,
    consequence: 4,
    gravity: 5,
    probability: 6,
    level: 7,
  };
  const sheet = {
    file: assessment.path,
    columns,
    workEnvironment: none,
    exposure: none,
    factorCount: 2,
  };
  const risks = {
    sheets: [
      {
        ...sheet,
        heading: bakerHeading,
        kind: 'job_position',
        name: 'BRUTAR',
        posts: ['Brutar'],
        workName: 'Producție de panificație',
        firstRow: 'R2',
        lastRow: 'R3',
        meansOfProduction: {
          startWords: 'Cuptor electric cu trei vetre',
          endWords: 'și malaxor de aluat.',
        },
      },
      {
        ...sheet,
        heading: sensitiveHeading,
        kind: 'sensitive_groups',
        name: 'GRUPURI SENSIBILE',
        posts: [],
        firstRow: 'R4',
        lastRow: 'R4',
        meansOfProduction: none,
      },
    ],
    measures: [],
    planTables: [],
    plan: [],
  };

  const packModel =
    (answer: unknown = risks): Recorded =>
    (request) => {
      if (request.name === 'import_sorting') return sorting;
      if (request.name === 'import_risks') return answer;
      if (request.name === 'client_import') return documents;
      return defaultModel(request);
    };

  const part = () => world.parts.get(`${importId}:risk_evaluations`)!;

  it('reads them once the client is ready, from files the client reading reads too', async () => {
    model = packModel();
    startWith([files[0]!, assessment]);
    const outcomes = await drain(deps());

    expect(outcomes.every((outcome) => outcome.outcome === 'ack')).toBe(true);
    expect(outcomes.map((outcome) => outcome.type)).toContain('read-risks');
    expect(world.imports.get(importId)!.status).toBe('ready');
    expect(world.fileAt(assessment.path)).toMatchObject({
      state: 'read',
      document_kind: 'risk_assessment',
    });
    expect(world.parts.has(`${importId}:instructions_ssm`)).toBe(false);

    expect(part()).toMatchObject({ status: 'to_review', attempt: 1 });
    const proposal = risksProposalSchema.parse(part().proposal);
    expect(
      proposal.sheets.map((each) => [
        each.kind,
        each.posts.map((post) => post.name),
        each.factors.length,
        each.status,
        each.choice,
      ])
    ).toEqual([
      ['job_position', ['Brutar'], 2, 'new', 'add'],
      ['sensitive_groups', [], 1, 'new', 'skip'],
    ]);
    expect(proposal.sheets[0]).toMatchObject({
      libraryName: 'Producție de panificație',
      workplace: 'Brutărie',
      meansOfProduction: 'Cuptor electric cu trei vetre și malaxor de aluat.',
    });

    const read = modelRequests.find((request) => request.name === 'import_risks')!;
    expect(read.metadata).toBe(
      JSON.stringify({ organizationId, importId, part: 'risk_evaluations' })
    );
    expect(read.maxTokens).toBe(32_000);
    expect(world.partCharges).toEqual(['risk_evaluations:1']);
    expect(world.partUsage).toEqual([
      { part: 'risk_evaluations', input: 1000, cost: expect.any(Number) },
    ]);
  });

  const bakerInLibrary = () => {
    world.riskLibrary = {
      names: ['Brutar'],
      entries: [
        {
          id: 'c1000000-0000-4000-8000-000000000001',
          name: 'Brutar',
          factors: [
            {
              id: 'c2000000-0000-4000-8000-000000000001',
              component: 'means_of_production',
              description: 'Prinderea degetelor în malaxorul de aluat pornit.',
              gravityClass: 3,
              probabilityClass: 3,
              measures: [],
            },
            {
              id: 'c2000000-0000-4000-8000-000000000002',
              component: 'means_of_production',
              description: 'Tăierea mâinilor cu cuțitul de feliat pâine.',
              gravityClass: 2,
              probabilityClass: 5,
              measures: [],
            },
          ],
        },
      ],
    };
  };

  it('finds a sheet the library already has, and still asks to confirm the factors it writes on the client', async () => {
    bakerInLibrary();
    model = packModel({ ...risks, sheets: [risks.sheets[0]] });
    startWith([files[0]!, assessment]);
    await drain(deps());

    expect(part().status).toBe('to_review');
    const [baker] = risksProposalSchema.parse(part().proposal).sheets;
    expect(baker).toMatchObject({
      status: 'identical',
      choice: 'use_existing',
      match: { evaluationId: 'c1000000-0000-4000-8000-000000000001' },
    });
  });

  it('says nothing is new when every sheet is in the library and none is written to the client', async () => {
    bakerInLibrary();
    model = packModel({ ...risks, sheets: [{ ...risks.sheets[0], posts: [] }] });
    startWith([files[0]!, assessment]);
    await drain(deps());

    expect(part().status).toBe('nothing_new');
    const [baker] = risksProposalSchema.parse(part().proposal).sheets;
    expect(baker).toMatchObject({ status: 'identical', undecided: true });
  });

  it('counts the factors a post of an existing client already has', async () => {
    world.clientSheets = {
      jobPositions: [{ id: 'd1000000-0000-4000-8000-000000000001', name: 'BRUTAR', factors: 18 }],
      sensitiveGroups: 0,
      other: {},
    };
    model = packModel();
    startWith([files[0]!, assessment]);
    world.imports.get(importId)!.client_id = 'e1000000-0000-4000-8000-000000000001';
    await drain(deps());

    const [baker] = risksProposalSchema.parse(part().proposal).sheets;
    expect(baker!.posts).toEqual([{ name: 'Brutar', existingFactors: 18, choice: 'keep' }]);
  });

  it('sends a scanned page of the assessment as its image, charged once', async () => {
    const scan: FileSpec = { ...files[2]!, path: 'Dosar/Scanate/Evaluare.pdf' };
    model = (request) => {
      if (request.name === 'import_sorting') {
        return {
          files: [
            {
              path: scan.path,
              kind: 'risk_assessment',
              companyName: 'BRUTĂRIA FICTIVĂ S.R.L.',
              companyCui: '12345674',
              carriesClientData: true,
            },
          ],
        };
      }
      if (request.name === 'import_risks') return { ...risks, sheets: [] };
      return defaultModel(request);
    };
    startWith([scan]);
    await drain(deps());

    const read = modelRequests.find((request) => request.name === 'import_risks')!;
    expect(read.images).toHaveLength(1);
    expect(world.scanCharges).toHaveLength(1);
    expect(part().status).toBe('nothing_new');
  });

  it('writes out a PDF sheet with its measures in a request of its own, kept by the sheets it asks for', async () => {
    const pdf: FileSpec = { ...files[2]!, path: 'Dosar/Evaluarea riscurilor.pdf' };
    const noColumns = Object.fromEntries(Object.keys(columns).map((key) => [key, '']));
    model = (request) => {
      if (request.name === 'import_sorting') {
        return {
          files: [
            {
              path: pdf.path,
              kind: 'risk_assessment',
              companyName: 'BRUTĂRIA FICTIVĂ S.R.L.',
              companyCui: '12345674',
              carriesClientData: true,
            },
          ],
        };
      }
      if (request.name === 'import_risks') {
        return {
          ...risks,
          sheets: [
            {
              ...risks.sheets[0],
              file: pdf.path,
              heading: 'Decizia nr. 2',
              firstRow: '',
              lastRow: '',
              columns: noColumns,
              meansOfProduction: none,
              factorCount: 1,
            },
          ],
        };
      }
      if (request.name === 'import_risks_retyped') {
        return {
          sheets: [
            {
              file: pdf.path,
              heading: 'Decizia nr. 2',
              factors: [
                {
                  component: 'MIJLOACE DE PRODUCȚIE',
                  group: 'Factori de risc mecanic',
                  description: 'F1. Prinderea degetelor în malaxor.',
                  consequence: 'ITM 45-180 zile',
                  gravity: '3',
                  probability: '3',
                  level: '3',
                  quote: 'privind organizarea activității',
                  measuresFrom: 'plan',
                  measures: [{ kind: 'technical', description: 'Protecția malaxorului.' }],
                  actions: '',
                  deadline: 'Imediat',
                  responsiblePerson: 'Administrator',
                  observations: '',
                },
              ],
            },
          ],
        };
      }
      return defaultModel(request);
    };
    startWith([pdf]);
    await drain(deps());

    expect(modelRequests.filter((request) => request.name === 'import_risks_retyped')).toEqual([
      expect.objectContaining({ maxTokens: 32_000 }),
    ]);
    expect(
      world.objects.has(`${organizationId}/${importId}/risk_evaluations.1.retyped-1.json`)
    ).toBe(true);
    const [written] = risksProposalSchema.parse(part().proposal).sheets;
    expect(written!.factors.map((factor) => [factor.description, factor.flags[0]])).toEqual([
      ['Prinderea degetelor în malaxor.', { kind: 'retyped' }],
    ]);
    expect(written!.factors[0]).toMatchObject({
      measures: [{ kind: 'technical', description: 'Protecția malaxorului.' }],
      measuresFrom: 'plan',
      deadline: 'Imediat',
      responsiblePerson: 'Administrator',
      actions: null,
    });
  });

  it('fails the part, not the import, when the answer cannot be used', async () => {
    model = packModel({ not: 'the schema' });
    startWith([files[0]!, assessment]);
    const outcomes = await drain(deps());

    expect(outcomes.every((outcome) => outcome.outcome === 'ack')).toBe(true);
    expect(world.imports.get(importId)!.status).toBe('ready');
    expect(part()).toMatchObject({ status: 'failed', failure_reason: riskReasons.modelFailed });
    expect(world.partCharges).toEqual(['risk_evaluations:1']);
  });

  it('reads a retried part under its next attempt, and ignores the message of the one before', async () => {
    model = packModel({ not: 'the schema' });
    startWith([files[0]!, assessment]);
    await drain(deps());
    Object.assign(part(), { status: 'reading', attempt: 2, failure_reason: null });
    model = packModel();
    modelRequests = [];
    world.send({ type: 'read-risks', importId, attempt: 1 });
    world.send({ type: 'read-risks', importId, attempt: 2 });
    world.send({ type: 'read-risks', importId, attempt: 2 });
    await drain(deps());

    expect(part()).toMatchObject({ status: 'to_review', attempt: 2 });
    expect(world.partCharges).toEqual(['risk_evaluations:1', 'risk_evaluations:2']);
    expect(modelRequests.filter((request) => request.name === 'import_risks')).toHaveLength(1);
  });

  it('fails the part whose step every delivery lost', async () => {
    world.addImport({ status: 'ready' });
    world.parts.set(`${importId}:risk_evaluations`, {
      import_id: importId,
      part: 'risk_evaluations',
      status: 'reading',
      attempt: 1,
      proposal: null,
    });
    const message = {
      id: 'lost',
      body: { type: 'read-risks', importId, attempt: 1 },
      attempts: 1,
      ack: vi.fn(),
      retry: vi.fn(),
    } satisfies QueueMessage;
    await consumeImportDeadLetters({ messages: [message] }, {}, deps());

    expect(part()).toMatchObject({ status: 'failed', failure_reason: riskReasons.failed });
  });
});

describe('what a reading leaves (ADR 037)', () => {
  const text = (alert: AlertMessage) => [alert.title, ...alert.lines].join('\n');

  it("keeps the reading's version and flags, and tells support of the file it could not open, by its place", async () => {
    startWith(files);
    await drain(deps());

    const row = world.imports.get(importId)!;
    expect(row.reading_version).toEqual({
      models: { sorting: 'gpt-6-luna', scanning: 'gpt-6.1-terra', reading: 'gpt-6.1-terra' },
      prompts: expect.stringMatching(/^[0-9a-f]{12}$/),
    });
    const place = [...world.files.values()]
      .map((file) => file.upload_path)
      .sort((a, b) => a.localeCompare(b))
      .indexOf('Dosar/stricat.pdf');
    expect(row.reading_flags).toMatchObject({
      files: {
        total: 8,
        unreadable: [{ file: place + 1, kind: 'pdf' }],
        setAside: 1,
        forEmployees: 1,
        otherCompany: 1,
      },
      emptyRequired: ['jobPositions'],
      checks: expect.objectContaining({ quote_not_found: expect.any(Number) }),
    });
    expect(world.alerts.map((alert) => alert.title)).toEqual(['Files we could not open']);
    expect(text(world.alerts[0]!)).toContain(`file ${place + 1} of 8, pdf`);
    for (const alert of world.alerts) {
      expect(text(alert)).not.toMatch(/stricat|Dosar|BRUTĂRIA|Vasilescu|12345674/);
    }
    expect(world.recordedCopies).toEqual([]);
  });

  it('writes the copy of a failed import, its record first, by a message of its own', async () => {
    model = (request) =>
      request.name === 'client_import'
        ? Response.json({
            choices: [{ finish_reason: 'length', message: { content: '{"facts": [' } }],
            usage: { prompt_tokens: 1000, completion_tokens: 64_000 },
          })
        : defaultModel(request);
    startWith([files[0]!]);
    const outcomes = await drain(deps());

    expect(outcomes.map((outcome) => outcome.type).slice(-1)).toEqual(['keep']);
    expect(world.recordedCopies).toEqual([`${importId}:`]);
    const folder = `${organizationId}/${importId}`;
    const file = world.fileAt('Dosar/Decizia 1.docx');
    const name = file.storage_path.split('/').at(-1)!;
    expect([...world.copies.keys()].sort()).toEqual(
      [
        `${folder}/files/${name}`,
        `${folder}/files/${name.replace('.docx', '.txt')}`,
        `${folder}/record.json`,
      ].sort()
    );
    expect(world.copies.get(`${folder}/files/${name}`)).toEqual(
      world.objects.get(file.storage_path)
    );
    const record = JSON.parse(new TextDecoder().decode(world.copies.get(`${folder}/record.json`)));
    expect(record).toMatchObject({
      status: 'failed',
      failureReason: importReasons.modelFailed,
      readingVersion: { prompts: expect.any(String) },
      readingFlags: { files: { total: 1 } },
      files: [{ place: 1, id: file.id, state: 'read', kind: 'decision' }],
    });
    expect(world.alerts.map((alert) => alert.title)).toEqual(['Failed on our side']);
    expect(text(world.alerts[0]!)).toContain('Reason: import.modelFailed');
  });

  it('queues the copies the clean-up finds missing, and writes one itself before its import loses its objects', async () => {
    world.addImport({ status: 'abandoned', abandoned_at: '2026-10-01T00:00:00Z' });
    const id = world.addFile(files[0]!, 0, 'read');
    const path = world.files.get(id)!.storage_path;
    const missing = { importId, part: null, recorded: true };
    world.uncopied = [missing];
    world.incomplete = [missing];
    world.abandoned = [{ importId, paths: [path] }];
    const result = await cleanUpImports(deps());

    expect(world.sent.map((message) => message.body)).toEqual([{ type: 'keep', importId }]);
    expect(
      world.copies.get(`${organizationId}/${importId}/files/${path.split('/').at(-1)}`)
    ).toEqual(files[0]!.bytes);
    expect(world.completedCopies.has(`${importId}:`)).toBe(true);
    expect(world.objects.has(path)).toBe(false);
    expect(result).toMatchObject({ copiesQueued: 1, copiesNotQueued: 0, held: 0, deleted: 1 });
  });

  it('keeps the objects of an import whose copy cannot be written, abandoned or confirmed, until the next day', async () => {
    world.addImport({ status: 'abandoned', abandoned_at: '2026-10-01T00:00:00Z' });
    const id = world.addFile(files[0]!, 0, 'read');
    const path = world.files.get(id)!.storage_path;
    world.incomplete = [{ importId, part: null, recorded: true }];
    world.abandoned = [{ importId, paths: [path] }];
    const failing = deps();
    failing.copies.copyIn = async () => {
      throw new Error('Storage is down');
    };
    const result = await cleanUpImports(failing);
    world.abandoned = [];
    world.toEmpty = [{ importId, paths: [path] }];
    const confirmed = await cleanUpImports(failing);

    expect(world.objects.has(path)).toBe(true);
    expect(
      world.calls.filter((call) => /^(deleteAbandoned|markObjectsRemoved)/.test(call))
    ).toEqual([
      'deleteAbandoned ',
      'markObjectsRemoved ',
      'deleteAbandoned ',
      'markObjectsRemoved ',
    ]);
    expect(result).toMatchObject({ held: 1, deleted: 0 });
    expect(confirmed).toMatchObject({ held: 1, emptied: 0 });
    expect(cleanUpLine(result)).toContain('1 imports kept until their copies are written');
  });

  it('tells support of an import the clean-up failed as stalled, and of one left after its reading', async () => {
    world.addImport({
      status: 'failed',
      failure_reason: importReasons.stalled,
      failed_at: '2026-11-04T02:41:00Z',
    });
    const store = world.store();
    await cleanUpImports(deps({ store: { ...store, failStalled: async () => [importId] } }));
    world.imports.get(importId)!.failure_reason = importReasons.left;
    world.imports.get(importId)!.ready_at = '2026-10-20T10:00:00Z';
    await cleanUpImports(deps({ store: { ...store, failStalled: async () => [importId] } }));

    expect(world.alerts.map((alert) => alert.title)).toEqual([
      'Stuck',
      'Abandoned after a reading',
    ]);
  });
});
