import { type ImportLibraryPart, importLibraryParts } from '@ssm-usor/contracts';
import type { ExistingClient, ProviderIdentity } from '@ssm-usor/import';

import type { ImportMessage } from '../../lib/env';
import { alertImport } from './import-alerts';
import { describe, type PipelineDeps, sendAll } from './pipeline';
import type { CopyToWrite, ImportRecord, PartRecordRow } from './records';

const encoder = new TextEncoder();

// One Storage request each: an employee import can hold thousands of objects, and one message
// copies this many before it sends the next, so no invocation nears its subrequest limit.
export const keepChunkObjects = 200;
// The copies the daily clean-up finds missing beyond this wait a day.
export const sweptCopiesPerRun = 200;
// What the daily clean-up copies itself before it removes an import whose copy is incomplete.
export const inlineCopyObjects = 1000;

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

export interface CopyContext {
  createdBy: string | null;
  // As the store gives it when the copy is written, which the reading asked for minutes before.
  provider: ProviderIdentity;
  existingClient: ExistingClient | null;
  // ANAF's answer for the proposed CUI, kept in the proposal by the check step.
  registeredCompany: unknown;
}

async function contextOf(deps: PipelineDeps, record: ImportRecord): Promise<CopyContext> {
  const { row } = record;
  const proposal = row.proposal;
  return {
    createdBy: row.created_by,
    provider: await deps.store.provider(row.organization_id),
    existingClient:
      row.into_existing_client && row.client_id ? await deps.store.client(row.client_id) : null,
    registeredCompany:
      proposal && typeof proposal === 'object' && !Array.isArray(proposal)
        ? (proposal.registeredCompany ?? null)
        : null,
  };
}

export function importCopyRecord(record: ImportRecord, objects: string[], context: CopyContext) {
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
    context,
    files: record.files.map((file, index) => ({
      place: index + 1,
      id: file.id,
      uploadPath: file.upload_path,
      originalFileName: file.original_file_name,
      storagePath: file.storage_path,
      textPath: file.text_path,
      derivedPath: file.derived_path,
      mimeType: file.mime_type,
      sizeBytes: file.size_bytes,
      sha256: file.sha256,
      pageCount: file.page_count,
      declaredPages: file.declared_pages,
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

export function partCopyRecord(
  record: ImportRecord,
  part: PartRecordRow,
  objects: string[],
  context: CopyContext
) {
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
    context,
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

export interface KeptChunk {
  done: boolean;
  // Where the next chunk starts, in the copy's objects by name.
  next: number;
  copied: number;
  // The parts that ended with the import, abandoned or failed, once its own copy is done.
  partsToKeep: ImportLibraryPart[];
}

// Null for an import that is gone, or a part it does not have.
export async function keepCopy(
  deps: PipelineDeps,
  importId: string,
  part: ImportLibraryPart | null,
  offset = 0,
  limit = keepChunkObjects
): Promise<KeptChunk | null> {
  const record = await deps.records.get(importId);
  if (!record) return null;
  const partRow = part ? record.parts.find((each) => each.part === part) : null;
  if (part && !partRow) return null;
  // The record goes first: a copy that fails halfway leaves a row the 12-month clean-up removes
  // its objects by, never objects no row names. It stays incomplete until record.json is written.
  if (offset === 0) await deps.records.recordCopy(importId, part);
  const folder = folderOf(record);
  const target = part ? `${folder}/parts/${part}` : folder;
  const own = (await deps.objects.list(folder))
    .filter((name) => partOfObject(name) === part)
    .sort();
  const end = Math.min(own.length, offset + Math.max(limit, 0));
  for (const name of own.slice(offset, end)) {
    await deps.copies.copyIn(`${folder}/${name}`, `${target}/files/${name}`);
  }
  const copied = Math.max(end - offset, 0);
  if (end < own.length) return { done: false, next: end, copied, partsToKeep: [] };
  const context = await contextOf(deps, record);
  await deps.copies.write(
    `${target}/record.json`,
    json(
      partRow
        ? partCopyRecord(record, partRow, own, context)
        : importCopyRecord(record, own, context)
    ),
    'application/json'
  );
  await deps.records.completeCopy(importId, part);
  const endedWithImport =
    !part && (record.row.status === 'abandoned' || record.row.status === 'failed');
  return {
    done: true,
    next: end,
    copied,
    partsToKeep: endedWithImport ? record.parts.map((each) => each.part) : [],
  };
}

const keepMessage = (
  importId: string,
  part: ImportLibraryPart | null,
  offset = 0
): ImportMessage => ({
  type: 'keep',
  importId,
  ...(part ? { part } : {}),
  ...(offset > 0 ? { offset } : {}),
});

export async function keepStep(
  deps: PipelineDeps,
  importId: string,
  part: ImportLibraryPart | null,
  offset = 0
) {
  let chunk = await keepCopy(deps, importId, part, offset);
  while (chunk && !chunk.done) {
    if (deps.queue) {
      await deps.queue.send(keepMessage(importId, part, chunk.next));
      return;
    }
    chunk = await keepCopy(deps, importId, part, chunk.next);
  }
  if (!chunk || chunk.partsToKeep.length === 0) return;
  if (deps.queue) {
    await sendAll(
      deps.queue,
      chunk.partsToKeep.map((each) => keepMessage(importId, each))
    );
    return;
  }
  for (const each of chunk.partsToKeep) await keepStep(deps, importId, each);
}

// The daily clean-up's fallback, for copies whose message was lost or failed, and for parts that
// expired unconfirmed, which no other step ends.
export async function keepMissingCopies(deps: PipelineDeps, now = new Date()) {
  const missing = await deps.records.uncopied(now);
  const sent = deps.queue ? missing.slice(0, sweptCopiesPerRun) : [];
  if (deps.queue && sent.length > 0) {
    try {
      await sendAll(
        deps.queue,
        sent.map((copy) => keepMessage(copy.importId, copy.part))
      );
    } catch (error) {
      console.error(`The missing improvement copies were not queued: ${describe(error)}`);
      return { queued: 0, left: missing.length };
    }
  }
  for (const { importId, part, recorded } of sent) {
    if (part && !recorded) await alertImport(deps, importId, part, ['expired']);
  }
  return { queued: sent.length, left: missing.length - sent.length };
}

export interface CopyBudget {
  objects: number;
}

async function keepWithin(deps: PipelineDeps, copy: CopyToWrite, budget: CopyBudget) {
  let offset = 0;
  while (budget.objects > 0) {
    const chunk = await keepCopy(deps, copy.importId, copy.part, offset, budget.objects);
    if (!chunk) return true;
    budget.objects -= chunk.copied;
    if (chunk.done) return true;
    offset = chunk.next;
  }
  return false;
}

/**
 * The imports, of those named, whose objects may go: every copy of theirs is complete, or is
 * written now within the budget. The others keep their objects for tomorrow's clean-up.
 */
export async function withCopiesKept(
  deps: PipelineDeps,
  importIds: string[],
  budget: CopyBudget,
  now = new Date()
) {
  if (importIds.length === 0) return new Set<string>();
  const held = new Set<string>();
  for (const copy of await deps.records.incompleteCopies(importIds, now)) {
    if (held.has(copy.importId)) continue;
    let kept = false;
    try {
      kept = await keepWithin(deps, copy, budget);
    } catch (error) {
      console.error(
        `The copy of import ${copy.importId}${copy.part ? ` part ${copy.part}` : ''} was not written: ${describe(error)}`
      );
    }
    if (!kept) {
      held.add(copy.importId);
      console.error(
        `The objects of import ${copy.importId} stay until its improvement copy is written.`
      );
    }
  }
  return new Set(importIds.filter((id) => !held.has(id)));
}
