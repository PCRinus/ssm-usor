import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AlertMessage, AlertSender } from '../../lib/alerts';
import { keepCopy, keepMissingCopies } from './copies';
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
      proposal: { client: {} },
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

function deps(): PipelineDeps {
  const records: ImportRecords = {
    get: async () => found,
    recordCopy: async (id, part) => {
      calls.push(`record ${id}${part ? ` ${part}` : ''}`);
    },
    uncopied: async () => uncopied,
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
  return {
    records,
    objects: { list: async () => objects },
    copies: copied,
    alerts: sender,
  } as unknown as PipelineDeps;
}

const json = (path: string) => JSON.parse(new TextDecoder().decode(copies.get(path)));

beforeEach(() => {
  calls = [];
  copies = new Map();
  alerts = [];
  uncopied = [];
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
  it("records the copy first, then copies the import's objects by Storage, then writes its record", async () => {
    expect(await keepCopy(deps(), importId, null)).toBe(true);

    expect(calls).toEqual([
      `record ${importId}`,
      `copy ${folder}/${fileId}.docx -> ${folder}/files/${fileId}.docx`,
      `copy ${folder}/${fileId}.txt -> ${folder}/files/${fileId}.txt`,
      `copy ${folder}/${fileId}.scan.json -> ${folder}/files/${fileId}.scan.json`,
      `write ${folder}/record.json`,
    ]);
  });

  it('writes what the import was, how each file was sorted, the proposal and the changes, and its counts', async () => {
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
      files: [
        {
          place: 1,
          id: fileId,
          uploadPath: 'Dosar/Decizia 1.docx',
          mimeType: file.mime_type,
          sizeBytes: 1200,
          sha256: 'a'.repeat(64),
          pageCount: null,
          isScan: false,
          state: 'read',
          kind: 'decision',
          domain: null,
          reason: null,
          company: { name: 'BRUTĂRIA FICTIVĂ S.R.L.', cui: '12345674' },
          objects: [`files/${fileId}.docx`, `files/${fileId}.txt`, `files/${fileId}.scan.json`],
        },
      ],
      proposal: { client: {} },
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

  it("leaves a confirmed import's parts to end on their own", async () => {
    await keepCopy(deps(), importId, null);
    expect([...copies.keys()].some((path) => path.includes('/parts/'))).toBe(false);
  });

  it("writes a part's copy beside its import's, with the objects named after it", async () => {
    found = record('confirmed', [
      part({ status: 'confirmed', confirmed_at: '2026-11-04T10:00:00Z' }),
    ]);
    expect(await keepCopy(deps(), importId, 'risk_evaluations')).toBe(true);

    const own = `${folder}/parts/risk_evaluations`;
    expect(calls).toEqual([
      `record ${importId} risk_evaluations`,
      `copy ${folder}/risk_evaluations.1.claim.json -> ${own}/files/risk_evaluations.1.claim.json`,
      `copy ${folder}/risk_evaluations.1.answer.json -> ${own}/files/risk_evaluations.1.answer.json`,
      `write ${own}/record.json`,
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
      proposal: { sheets: [] },
      changes: null,
      quality: null,
      readingVersion: { models: { risks: 'gpt-6.1-terra' }, prompts: 'abcdef012345' },
      readingFlags: { found: { evaluationSheets: 0 }, checks: {} },
      usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 5, costUsd: 0.2 },
      objects: ['files/risk_evaluations.1.claim.json', 'files/risk_evaluations.1.answer.json'],
    });
  });

  it('writes the parts of an abandoned import with it', async () => {
    found = record('abandoned', [part()]);
    await keepCopy(deps(), importId, null);
    expect(calls.filter((call) => call.startsWith('record'))).toEqual([
      `record ${importId}`,
      `record ${importId} risk_evaluations`,
    ]);
    expect(copies.has(`${folder}/parts/risk_evaluations/record.json`)).toBe(true);
  });

  it('writes nothing of an import that is gone, or a part it does not have', async () => {
    found = null;
    expect(await keepCopy(deps(), importId, null)).toBe(false);
    found = record('confirmed');
    expect(await keepCopy(deps(), importId, 'instructions_ssm')).toBe(false);
    expect(calls).toEqual([]);
  });

  it('leaves its record when an object fails to copy, so the 12 months still remove what was copied', async () => {
    objects = [`${fileId}.docx`, 'broken.json'];
    await expect(keepCopy(deps(), importId, null)).rejects.toThrow('Storage is down');
    expect(calls).toEqual([
      `record ${importId}`,
      `copy ${folder}/${fileId}.docx -> ${folder}/files/${fileId}.docx`,
    ]);
  });
});

describe('keepMissingCopies', () => {
  it('writes each copy not written, counts the ones that fail, and tells of a part left to expire', async () => {
    uncopied = [
      { importId, part: null },
      { importId, part: 'risk_evaluations' },
      { importId, part: 'instructions_ssm' },
    ];
    found = record('confirmed', [part()]);
    const result = await keepMissingCopies(deps());

    expect(result).toEqual({ written: 2, failed: 0 });
    expect(alerts.map((alert) => alert.title)).toEqual(['Abandoned after a reading']);

    objects = ['broken.json'];
    uncopied = [{ importId, part: null }];
    expect(await keepMissingCopies(deps())).toEqual({ written: 0, failed: 1 });
  });
});
