import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AlertMessage, AlertSender } from '../../lib/alerts';
import type { ImportMessage } from '../../lib/env';
import {
  keepChunkObjects,
  keepCopy,
  keepMissingCopies,
  keepStep,
  sweptCopiesPerRun,
  withCopiesKept,
} from './copies';
import { type ImportCopyObjects, importReasons, type PipelineDeps } from './pipeline';
import type { CopyToWrite, ImportRecord, ImportRecords, PartRecordRow } from './records';
import type { ImportFileRow } from './store';

const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';
const importId = '6f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
const folder = `${organizationId}/${importId}`;
const fileId = 'f0000000-0000-4000-8000-000000000001';

const file: ImportFileRow = {
  id: fileId,
  import_id: importId,
  upload_path: 'Dosar/Decizia 1.docx',
  original_file_name: 'Decizia 1.docx',
  mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  size_bytes: 1200,
  sha256: 'a'.repeat(64),
  storage_path: `${folder}/${fileId}.docx`,
  state: 'read',
  document_kind: 'decision',
  reason: null,
  company_name: 'BRUTĂRIA FICTIVĂ S.R.L.',
  company_cui: '12345674',
  page_count: null,
  is_scan: false,
  text_path: `${folder}/${fileId}.txt`,
  derived_path: null,
  declared_pages: null,
  document_domain: null,
};

function part(overrides: Partial<PartRecordRow> = {}): PartRecordRow {
  return {
    part: 'risk_evaluations',
    status: 'to_review',
    attempt: 1,
    failure_reason: null,
    read_at: '2026-11-03T09:20:00Z',
    failed_at: null,
    confirmed_at: null,
    reported_at: null,
    proposal: { sheets: [] },
    changes: null,
    quality: null,
    reading_version: { models: { risks: 'gpt-6.1-terra' }, prompts: 'abcdef012345' },
    reading_flags: { found: { evaluationSheets: 0 }, checks: {} },
    input_tokens: 10,
    cached_input_tokens: 0,
    output_tokens: 5,
    cost_usd: '0.200000' as unknown as number,
    ...overrides,
  };
}

const registered = {
  cui: '12345674',
  legalName: 'BRUTĂRIA FICTIVĂ S.R.L.',
  vatPayer: true,
  inactive: false,
};

const provider = {
  name: 'SERVICIUL EXTERN EXEMPLU S.R.L.',
  cui: '76543210',
  people: ['Marinescu Elena'],
};

function record(status: ImportRecord['row']['status'], parts: PartRecordRow[] = []): ImportRecord {
  return {
    row: {
      id: importId,
      organization_id: organizationId,
      kind: 'client',
      status,
      client_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      into_existing_client: false,
      failure_reason: status === 'failed' ? importReasons.modelFailed : null,
      created_at: '2026-11-03T09:00:00Z',
      started_at: '2026-11-03T09:01:00Z',
      ready_at: '2026-11-03T09:10:00Z',
      failed_at: null,
      confirmed_at: status === 'confirmed' ? '2026-11-03T10:00:00Z' : null,
      abandoned_at: status === 'abandoned' ? '2026-11-03T10:00:00Z' : null,
      reported_at: null,
      created_by: '0f7c8d96-479c-47b3-b49e-01f4555a0221',
      expensive_alerted_at: null,
      proposal: { client: {}, registeredCompany: registered },
      changes: { fields: {}, items: {} },
      quality: { client: { changed: 1, unticked: 0, kept: 0 } },
      reading_version: { models: { reading: 'gpt-6.1-terra' }, prompts: '0123456789ab' },
      reading_flags: { found: {}, checks: {} },
      read_characters: 1000,
      input_tokens: 1000,
      cached_input_tokens: 200,
      output_tokens: 300,
      cost_usd: 0.42,
      usage_by_step: { reading: { cost_usd: 0.42 } },
    },
    files: [file],
    parts,
  };
}

let calls: string[];
let copies: Map<string, Uint8Array>;
let alerts: AlertMessage[];
let objects: string[];
let found: ImportRecord | null;
let uncopied: CopyToWrite[];
let incomplete: CopyToWrite[];
let queued: ImportMessage[];
let withQueue: boolean;

function deps(): PipelineDeps {
  const records: ImportRecords = {
    get: async () => found,
    recordCopy: async (id, part) => {
      calls.push(`record ${id}${part ? ` ${part}` : ''}`);
    },
    completeCopy: async (id, part) => {
      calls.push(`complete ${id}${part ? ` ${part}` : ''}`);
    },
    uncopied: async () => uncopied,
    incompleteCopies: async (ids) => incomplete.filter((copy) => ids.includes(copy.importId)),
    claimExpensiveAlert: async () => true,
    activity: async () => ({ startedLastHour: 0, spentTodayUsd: 0 }),
    between: async () => [],
  };
  const copied: ImportCopyObjects = {
    list: async () => [],
    remove: async () => {},
    copyIn: async (from, to) => {
      if (from.includes('broken')) throw new Error('Storage is down');
      calls.push(`copy ${from} -> ${to}`);
      copies.set(to, new Uint8Array());
    },
    write: async (path, bytes) => {
      calls.push(`write ${path}`);
      copies.set(path, bytes);
    },
  };
  const sender: AlertSender = {
    enabled: true,
    send: async (message) => {
      alerts.push(message);
      return true;
    },
  };
  const queue = {
    send: async (body: ImportMessage) => {
      queued.push(body);
    },
    sendBatch: async (messages: Iterable<{ body: ImportMessage }>) => {
      for (const message of messages) queued.push(message.body);
    },
  };
  return {
    records,
    store: {
      provider: async () => provider,
      client: async () => ({ legalName: 'BRUTĂRIA FICTIVĂ S.R.L.', cui: '12345674' }),
    },
    objects: { list: async () => objects },
    copies: copied,
    alerts: sender,
    queue: withQueue ? queue : null,
  } as unknown as PipelineDeps;
}

const json = (path: string) => JSON.parse(new TextDecoder().decode(copies.get(path)));

beforeEach(() => {
  calls = [];
  copies = new Map();
  alerts = [];
  uncopied = [];
  incomplete = [];
  queued = [];
  withQueue = true;
  objects = [
    `${fileId}.docx`,
    `${fileId}.txt`,
    `${fileId}.scan.json`,
    'risk_evaluations.1.claim.json',
    'risk_evaluations.1.answer.json',
  ];
  found = record('confirmed', [part()]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('keepCopy', () => {
  it("records the copy first, then copies the import's objects by Storage, writes its record, and marks it complete", async () => {
    expect(await keepCopy(deps(), importId, null)).toMatchObject({ done: true, copied: 3 });

    expect(calls).toEqual([
      `record ${importId}`,
      `copy ${folder}/${fileId}.docx -> ${folder}/files/${fileId}.docx`,
      `copy ${folder}/${fileId}.scan.json -> ${folder}/files/${fileId}.scan.json`,
      `copy ${folder}/${fileId}.txt -> ${folder}/files/${fileId}.txt`,
      `write ${folder}/record.json`,
      `complete ${importId}`,
    ]);
  });

  it("copies where a page writes its values beside the page's reading, under its file", async () => {
    objects = [`${fileId}.jpg`, `${fileId}.page-1.json`, `${fileId}.page-1.locations.json`];
    await keepCopy(deps(), importId, null);

    expect(calls).toContain(
      `copy ${folder}/${fileId}.page-1.locations.json -> ${folder}/files/${fileId}.page-1.locations.json`
    );
    expect(json(`${folder}/record.json`).files[0].objects).toContain(
      `files/${fileId}.page-1.locations.json`
    );
  });

  it('writes what the import was, what the reading was given, how each file was sorted, the proposal and the changes, and its counts', async () => {
    await keepCopy(deps(), importId, null);

    expect(json(`${folder}/record.json`)).toEqual({
      import: importId,
      organization: organizationId,
      kind: 'client',
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
      context: {
        createdBy: '0f7c8d96-479c-47b3-b49e-01f4555a0221',
        provider,
        existingClient: null,
        registeredCompany: registered,
      },
      files: [
        {
          place: 1,
          id: fileId,
          uploadPath: 'Dosar/Decizia 1.docx',
          originalFileName: 'Decizia 1.docx',
          storagePath: `${folder}/${fileId}.docx`,
          textPath: `${folder}/${fileId}.txt`,
          derivedPath: null,
          mimeType: file.mime_type,
          sizeBytes: 1200,
          sha256: 'a'.repeat(64),
          pageCount: null,
          declaredPages: null,
          isScan: false,
          state: 'read',
          kind: 'decision',
          domain: null,
          reason: null,
          company: { name: 'BRUTĂRIA FICTIVĂ S.R.L.', cui: '12345674' },
          objects: [`files/${fileId}.docx`, `files/${fileId}.scan.json`, `files/${fileId}.txt`],
        },
      ],
      proposal: { client: {}, registeredCompany: registered },
      changes: { fields: {}, items: {} },
      quality: { client: { changed: 1, unticked: 0, kept: 0 } },
      readingVersion: { models: { reading: 'gpt-6.1-terra' }, prompts: '0123456789ab' },
      readingFlags: { found: {}, checks: {} },
      usage: {
        inputTokens: 1000,
        cachedInputTokens: 200,
        outputTokens: 300,
        costUsd: 0.42,
        readCharacters: 1000,
        bySteps: { reading: { cost_usd: 0.42 } },
      },
      parts: ['risk_evaluations'],
    });
  });

  it('names the existing client the reading was given, and no ANAF answer where the check kept none', async () => {
    found = record('confirmed');
    found.row.into_existing_client = true;
    found.row.proposal = { client: {} };
    await keepCopy(deps(), importId, null);

    expect(json(`${folder}/record.json`).context).toEqual({
      createdBy: '0f7c8d96-479c-47b3-b49e-01f4555a0221',
      provider,
      existingClient: { legalName: 'BRUTĂRIA FICTIVĂ S.R.L.', cui: '12345674' },
      registeredCompany: null,
    });
  });

  it("leaves a confirmed import's parts to end on their own", async () => {
    expect(await keepCopy(deps(), importId, null)).toMatchObject({ partsToKeep: [] });
    expect([...copies.keys()].some((path) => path.includes('/parts/'))).toBe(false);
  });

  it("writes a part's copy beside its import's, with the objects named after it", async () => {
    found = record('confirmed', [
      part({ status: 'confirmed', confirmed_at: '2026-11-04T10:00:00Z' }),
    ]);
    expect(await keepCopy(deps(), importId, 'risk_evaluations')).toMatchObject({ done: true });

    const own = `${folder}/parts/risk_evaluations`;
    expect(calls).toEqual([
      `record ${importId} risk_evaluations`,
      `copy ${folder}/risk_evaluations.1.answer.json -> ${own}/files/risk_evaluations.1.answer.json`,
      `copy ${folder}/risk_evaluations.1.claim.json -> ${own}/files/risk_evaluations.1.claim.json`,
      `write ${own}/record.json`,
      `complete ${importId} risk_evaluations`,
    ]);
    expect(json(`${own}/record.json`)).toEqual({
      import: importId,
      organization: organizationId,
      part: 'risk_evaluations',
      status: 'confirmed',
      attempt: 1,
      failureReason: null,
      importStatus: 'confirmed',
      times: {
        readAt: '2026-11-03T09:20:00Z',
        failedAt: null,
        confirmedAt: '2026-11-04T10:00:00Z',
        reportedAt: null,
      },
      context: {
        createdBy: '0f7c8d96-479c-47b3-b49e-01f4555a0221',
        provider,
        existingClient: null,
        registeredCompany: registered,
      },
      proposal: { sheets: [] },
      changes: null,
      quality: null,
      readingVersion: { models: { risks: 'gpt-6.1-terra' }, prompts: 'abcdef012345' },
      readingFlags: { found: { evaluationSheets: 0 }, checks: {} },
      usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 5, costUsd: 0.2 },
      objects: ['files/risk_evaluations.1.answer.json', 'files/risk_evaluations.1.claim.json'],
    });
  });

  it('names the parts of an abandoned import to keep once its own copy is done', async () => {
    found = record('abandoned', [part()]);
    expect(await keepCopy(deps(), importId, null)).toMatchObject({
      done: true,
      partsToKeep: ['risk_evaluations'],
    });
  });

  it('writes nothing of an import that is gone, or a part it does not have', async () => {
    found = null;
    expect(await keepCopy(deps(), importId, null)).toBeNull();
    found = record('confirmed');
    expect(await keepCopy(deps(), importId, 'instructions_ssm')).toBeNull();
    expect(calls).toEqual([]);
  });

  it('leaves its record incomplete when an object fails to copy, so the clean-up writes it again', async () => {
    objects = [`${fileId}.docx`, 'x-broken.json'];
    await expect(keepCopy(deps(), importId, null)).rejects.toThrow('Storage is down');
    expect(calls).toEqual([
      `record ${importId}`,
      `copy ${folder}/${fileId}.docx -> ${folder}/files/${fileId}.docx`,
    ]);
  });

  it('copies a chunk from its offset, records only at the start, and writes the record after the last', async () => {
    objects = ['a.pdf', 'b.pdf', 'c.pdf'];
    expect(await keepCopy(deps(), importId, null, 0, 2)).toMatchObject({
      done: false,
      next: 2,
      copied: 2,
    });
    expect(await keepCopy(deps(), importId, null, 2, 2)).toMatchObject({
      done: true,
      copied: 1,
    });
    expect(calls).toEqual([
      `record ${importId}`,
      `copy ${folder}/a.pdf -> ${folder}/files/a.pdf`,
      `copy ${folder}/b.pdf -> ${folder}/files/b.pdf`,
      `copy ${folder}/c.pdf -> ${folder}/files/c.pdf`,
      `write ${folder}/record.json`,
      `complete ${importId}`,
    ]);
  });
});

describe('keepStep', () => {
  it('sends the next chunk as a message of its own, and completes the copy only after the last', async () => {
    objects = Array.from(
      { length: keepChunkObjects * 2 + 1 },
      (_, index) => `${String(index).padStart(4, '0')}.page.json`
    );
    await keepStep(deps(), importId, null);
    expect(queued).toEqual([{ type: 'keep', importId, offset: keepChunkObjects }]);
    expect(calls.filter((call) => call.startsWith('copy'))).toHaveLength(keepChunkObjects);
    expect(calls).not.toContain(`complete ${importId}`);

    await keepStep(deps(), importId, null, keepChunkObjects);
    expect(queued.at(-1)).toEqual({ type: 'keep', importId, offset: keepChunkObjects * 2 });
    await keepStep(deps(), importId, null, keepChunkObjects * 2);

    expect(calls.filter((call) => call.startsWith('record'))).toEqual([`record ${importId}`]);
    expect(calls.filter((call) => call.startsWith('copy'))).toHaveLength(objects.length);
    expect(calls.slice(-2)).toEqual([`write ${folder}/record.json`, `complete ${importId}`]);
    expect(queued).toHaveLength(2);
  });

  it("queues the parts of an abandoned import once the import's own copy is complete", async () => {
    found = record('abandoned', [part(), part({ part: 'instructions_ssm' })]);
    await keepStep(deps(), importId, null);
    expect(queued).toEqual([
      { type: 'keep', importId, part: 'risk_evaluations' },
      { type: 'keep', importId, part: 'instructions_ssm' },
    ]);
  });

  it('writes every chunk and part itself without a queue', async () => {
    withQueue = false;
    found = record('abandoned', [part()]);
    objects = [
      ...Array.from({ length: keepChunkObjects + 1 }, (_, index) => `${index}.json`),
      'risk_evaluations.1.claim.json',
    ];
    await keepStep(deps(), importId, null);
    expect(calls.filter((call) => call.startsWith('complete'))).toEqual([
      `complete ${importId}`,
      `complete ${importId} risk_evaluations`,
    ]);
  });
});

describe('keepMissingCopies', () => {
  it('queues each copy not complete, and tells of a part left to expire the first time only', async () => {
    uncopied = [
      { importId, part: null, recorded: true },
      { importId, part: 'risk_evaluations', recorded: false },
      { importId, part: 'instructions_ssm', recorded: false },
    ];
    found = record('confirmed', [part(), part({ part: 'instructions_ssm' })]);
    expect(await keepMissingCopies(deps())).toEqual({ queued: 3, left: 0 });

    expect(queued).toEqual([
      { type: 'keep', importId },
      { type: 'keep', importId, part: 'risk_evaluations' },
      { type: 'keep', importId, part: 'instructions_ssm' },
    ]);
    expect(calls).toEqual([]);
    expect(alerts.map((alert) => alert.title)).toEqual([
      'Abandoned after a reading',
      'Abandoned after a reading',
    ]);

    uncopied = [{ importId, part: 'risk_evaluations', recorded: true }];
    await keepMissingCopies(deps());
    expect(alerts).toHaveLength(2);
  });

  it('queues at most its cap a run, leaving the rest for the next day', async () => {
    uncopied = Array.from({ length: sweptCopiesPerRun + 5 }, (_, index) => ({
      importId: `import-${index}`,
      part: null,
      recorded: false,
    }));
    expect(await keepMissingCopies(deps())).toEqual({ queued: sweptCopiesPerRun, left: 5 });
    expect(queued).toHaveLength(sweptCopiesPerRun);
  });

  it('leaves them all for the next day when the queue refuses them', async () => {
    uncopied = [{ importId, part: null, recorded: false }];
    const failing = deps();
    failing.queue!.sendBatch = async () => {
      throw new Error('queue down');
    };
    expect(await keepMissingCopies(failing)).toEqual({ queued: 0, left: 1 });
  });
});

describe('withCopiesKept', () => {
  it('lets every import go whose copies are complete', async () => {
    expect(await withCopiesKept(deps(), [importId], { objects: 10 })).toEqual(new Set([importId]));
    expect(calls).toEqual([]);
  });

  it('writes an incomplete copy again before its import loses its objects', async () => {
    incomplete = [{ importId, part: null, recorded: true }];
    const budget = { objects: 10 };
    expect(await withCopiesKept(deps(), [importId, 'other'], budget)).toEqual(
      new Set([importId, 'other'])
    );
    expect(calls.at(-1)).toBe(`complete ${importId}`);
    expect(budget.objects).toBe(7);
  });

  it('keeps the objects of an import whose copy still fails, or does not fit the budget', async () => {
    incomplete = [{ importId, part: null, recorded: true }];
    objects = ['a.pdf', 'broken.pdf'];
    expect(await withCopiesKept(deps(), [importId, 'other'], { objects: 10 })).toEqual(
      new Set(['other'])
    );

    objects = ['a.pdf', 'b.pdf', 'c.pdf'];
    expect(await withCopiesKept(deps(), [importId], { objects: 2 })).toEqual(new Set());
    expect(calls).not.toContain(`complete ${importId}`);
    expect(await withCopiesKept(deps(), [importId], { objects: 0 })).toEqual(new Set());
  });
});
