import { extractionRefused, type ExtractorService } from '@ssm-usor/contracts';
import { createModelClient, proposalSchema } from '@ssm-usor/import';
import { strToU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImportMessage } from '../../lib/env';
import { cleanUpImports } from './cleanup';
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
import {
  type ImportFileRow,
  ImportLimitError,
  type ImportObjectList,
  type ImportRow,
  type ImportStore,
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
};

class World {
  imports = new Map<string, ImportRow & Record<string, unknown>>();
  files = new Map<string, ImportFileRow & Record<string, unknown>>();
  objects = new Map<string, Uint8Array>();
  clientFiles = new Map<string, Uint8Array>();
  usage: { fileId: string | null; step: string; input: number; cost: number }[] = [];
  sent: { id: string; body: ImportMessage; attempts: number; delaySeconds?: number }[] = [];
  failCopyAfter: number | null = null;
  sizeLimit: number | null = null;
  abandoned: ImportObjectList[] = [];
  toEmpty: ImportObjectList[] = [];
  failRemovalOf = new Set<string>();
  calls: string[] = [];
  nextMessage = 0;

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
    });
    this.objects.set(storage, spec.bytes);
    return id;
  }

  fileAt(path: string) {
    return [...this.files.values()].find((file) => file.upload_path === path)!;
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
      provider: async () => ({
        name: 'SERVICIUL EXTERN EXEMPLU S.R.L.',
        cui: '76543210',
        people: ['Marinescu Elena'],
      }),
      client: async () => null,
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
  heicToJpeg: vi.fn(async () => strToU8('jpeg-heic').buffer as ArrayBuffer),
} satisfies ExtractorService;

const quoted = (file: string, quote: string) => ({ file, quote, otherCompany: '' });

const emptyReading = {
  facts: [],
  workplaces: [],
  workplaceFacts: [],
  jobPositions: [],
  responsiblePersons: [],
  fireEquipment: [],
  fireInstallations: [],
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
    extractor,
    model: createModelClient({
      baseUrl: 'https://gateway.example/v1/account/ssm-usor',
      token: 'gateway-token',
      sleep: async () => {},
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as {
          response_format: { json_schema: { name: string } };
          max_completion_tokens: number;
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
    expect(world.fileAt('Dosar/Poze/plan.jpg').derived_path).toBeNull();
    expect(extractor.heicToJpeg).toHaveBeenCalledTimes(1);

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
    const photo = modelRequests.find(
      (request) =>
        request.name === 'client_import' && request.images[0]?.startsWith('data:image/jpeg;base64,')
    );
    expect(photo).toBeDefined();
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

  it('sets own instructions aside with a reason of their own', async () => {
    const instructions: FileSpec = {
      ...files[0]!,
      path: 'Dosar/IPSSM.docx',
      bytes: docx(['BRUTĂRIA FICTIVĂ S.R.L.', 'Instrucțiuni proprii de securitate și sănătate']),
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
      failure_reason: importReasons.overLimits,
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
      'remove 3',
      'remove 0',
      'deleteAbandoned old-import,empty',
      'dropProposals',
      'remove 1',
      'markObjectsRemoved done',
    ]);
    expect(world.objects.has(`${folder}/a.page-2.json`)).toBe(false);
    expect(world.objects.has(`${organizationId}/stuck/b.pdf`)).toBe(true);
    expect(result).toMatchObject({ failed: 1, deleted: 2, dropped: 2, emptied: 1, left: 1 });
  });
});
