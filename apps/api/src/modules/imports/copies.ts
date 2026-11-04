import { type ImportLibraryPart, importLibraryParts } from '@ssm-usor/contracts';

import { alertImport } from './import-alerts';
import { describe, type PipelineDeps } from './pipeline';
import type { ImportRecord, PartRecordRow } from './records';

const encoder = new TextEncoder();

const folderOf = (record: ImportRecord) => `${record.row.organization_id}/${record.row.id}`;

// A part's claims and answers are named after it, `risk_evaluations.1.answer.json`, and go into
// its own copy, which may be written days after the import's.
const partOfObject = (name: string) =>
  importLibraryParts.find((part) => name.startsWith(`${part}.`)) ?? null;

const usageOf = (row: {
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | string | null;
}) => ({
  inputTokens: Number(row.input_tokens ?? 0),
  cachedInputTokens: Number(row.cached_input_tokens ?? 0),
  outputTokens: Number(row.output_tokens ?? 0),
  costUsd: Number(row.cost_usd ?? 0),
});

export function importCopyRecord(record: ImportRecord, objects: string[]) {
  const { row } = record;
  return {
    import: row.id,
    organization: row.organization_id,
    kind: row.kind,
    status: row.status,
    failureReason: row.failure_reason,
    clientId: row.client_id,
    intoExistingClient: row.into_existing_client,
    times: {
      createdAt: row.created_at,
      startedAt: row.started_at,
      readyAt: row.ready_at,
      failedAt: row.failed_at,
      confirmedAt: row.confirmed_at,
      abandonedAt: row.abandoned_at,
      reportedAt: row.reported_at,
    },
    files: record.files.map((file, index) => ({
      place: index + 1,
      id: file.id,
      uploadPath: file.upload_path,
      mimeType: file.mime_type,
      sizeBytes: file.size_bytes,
      sha256: file.sha256,
      pageCount: file.page_count,
      isScan: file.is_scan,
      state: file.state,
      kind: file.document_kind,
      domain: file.document_domain,
      reason: file.reason,
      company:
        file.company_name || file.company_cui
          ? { name: file.company_name, cui: file.company_cui }
          : null,
      objects: objects
        .filter((name) => name.startsWith(`${file.id}.`))
        .map((name) => `files/${name}`),
    })),
    proposal: row.proposal,
    changes: row.changes,
    quality: row.quality,
    readingVersion: row.reading_version,
    readingFlags: row.reading_flags,
    usage: {
      ...usageOf(row),
      readCharacters: row.read_characters,
      bySteps: row.usage_by_step,
    },
    parts: record.parts.map((part) => part.part),
  };
}

export function partCopyRecord(record: ImportRecord, part: PartRecordRow, objects: string[]) {
  return {
    import: record.row.id,
    organization: record.row.organization_id,
    part: part.part,
    status: part.status,
    attempt: part.attempt,
    failureReason: part.failure_reason,
    importStatus: record.row.status,
    times: {
      readAt: part.read_at,
      failedAt: part.failed_at,
      confirmedAt: part.confirmed_at,
      reportedAt: part.reported_at,
    },
    proposal: part.proposal,
    changes: part.changes,
    quality: part.quality,
    readingVersion: part.reading_version,
    readingFlags: part.reading_flags,
    usage: usageOf(part),
    objects: objects.map((name) => `files/${name}`),
  };
}

const json = (value: unknown) => encoder.encode(`${JSON.stringify(value, null, 2)}\n`);

// The record goes first: a copy that fails halfway leaves a row the 12-month clean-up removes
// its objects by, never objects no row names.
async function keepPartCopy(
  deps: PipelineDeps,
  record: ImportRecord,
  part: ImportLibraryPart,
  names: string[]
) {
  const row = record.parts.find((each) => each.part === part);
  if (!row) return false;
  await deps.records.recordCopy(record.row.id, part);
  const folder = folderOf(record);
  const own = names.filter((name) => partOfObject(name) === part);
  for (const name of own) {
    await deps.copies.copyIn(`${folder}/${name}`, `${folder}/parts/${part}/files/${name}`);
  }
  await deps.copies.write(
    `${folder}/parts/${part}/record.json`,
    json(partCopyRecord(record, row, own)),
    'application/json'
  );
  return true;
}

export async function keepCopy(
  deps: PipelineDeps,
  importId: string,
  part: ImportLibraryPart | null
) {
  const record = await deps.records.get(importId);
  if (!record) return false;
  const folder = folderOf(record);
  if (part) return keepPartCopy(deps, record, part, await deps.objects.list(folder));
  await deps.records.recordCopy(importId, null);
  const names = await deps.objects.list(folder);
  const own = names.filter((name) => partOfObject(name) === null);
  for (const name of own) {
    await deps.copies.copyIn(`${folder}/${name}`, `${folder}/files/${name}`);
  }
  await deps.copies.write(
    `${folder}/record.json`,
    json(importCopyRecord(record, own)),
    'application/json'
  );
  if (record.row.status === 'abandoned' || record.row.status === 'failed') {
    for (const each of record.parts) await keepPartCopy(deps, record, each.part, names);
  }
  return true;
}

/**
 * The daily clean-up's fallback, before any object is removed: the copies of imports and parts
 * that ended without one written, a part that expired unconfirmed among them.
 */
export async function keepMissingCopies(deps: PipelineDeps, now = new Date()) {
  let written = 0;
  let failed = 0;
  for (const { importId, part } of await deps.records.uncopied(now)) {
    try {
      if (await keepCopy(deps, importId, part)) written++;
      if (part) await alertImport(deps, importId, part, ['expired']);
    } catch (error) {
      failed++;
      console.error(
        `The copy of import ${importId}${part ? ` part ${part}` : ''} was not written: ${describe(error)}`
      );
    }
  }
  return { written, failed };
}
