import { type ImportLibraryPart, libraryPartDays } from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import type { AdminClient } from '../../lib/admin-db';
import { fromDatabaseError } from '../../lib/db';
import { importFileColumns, type ImportFileRow } from './store';

type Tables = Database['public']['Tables'];

export type ImportRecordRow = Pick<
  Tables['imports']['Row'],
  | 'id'
  | 'organization_id'
  | 'kind'
  | 'status'
  | 'client_id'
  | 'into_existing_client'
  | 'failure_reason'
  | 'created_at'
  | 'started_at'
  | 'ready_at'
  | 'failed_at'
  | 'confirmed_at'
  | 'abandoned_at'
  | 'reported_at'
  | 'proposal'
  | 'changes'
  | 'quality'
  | 'reading_version'
  | 'reading_flags'
  | 'read_characters'
  | 'input_tokens'
  | 'cached_input_tokens'
  | 'output_tokens'
  | 'cost_usd'
  | 'usage_by_step'
>;

export type PartRecordRow = Pick<
  Tables['import_library_parts']['Row'],
  | 'part'
  | 'status'
  | 'attempt'
  | 'failure_reason'
  | 'read_at'
  | 'failed_at'
  | 'confirmed_at'
  | 'reported_at'
  | 'proposal'
  | 'changes'
  | 'quality'
  | 'reading_version'
  | 'reading_flags'
  | 'input_tokens'
  | 'cached_input_tokens'
  | 'output_tokens'
  | 'cost_usd'
>;

export interface ImportRecord {
  row: ImportRecordRow;
  files: ImportFileRow[];
  parts: PartRecordRow[];
}

export interface CopyToWrite {
  importId: string;
  // Null for the import's own copy.
  part: ImportLibraryPart | null;
}

export interface OrganizationActivity {
  startedLastHour: number;
  spentTodayUsd: number;
}

export interface ImportRecords {
  get(importId: string): Promise<ImportRecord | null>;
  recordCopy(importId: string, part: ImportLibraryPart | null): Promise<void>;
  // The imports and parts that ended, still have their objects, and have no copy.
  uncopied(now: Date): Promise<CopyToWrite[]>;
  activity(organizationId: string, now: Date): Promise<OrganizationActivity>;
  // Every import with something of its own or of a part's in [from, to), without its files.
  between(from: string, to: string): Promise<ImportRecord[]>;
}

const recordColumns =
  'id, organization_id, kind, status, client_id, into_existing_client, failure_reason, created_at, started_at, ready_at, failed_at, confirmed_at, abandoned_at, reported_at, proposal, changes, quality, reading_version, reading_flags, read_characters, input_tokens, cached_input_tokens, output_tokens, cost_usd, usage_by_step';

const partRecordColumns =
  'part, status, attempt, failure_reason, read_at, failed_at, confirmed_at, reported_at, proposal, changes, quality, reading_version, reading_flags, input_tokens, cached_input_tokens, output_tokens, cost_usd';

const importEvents = [
  'started_at',
  'ready_at',
  'failed_at',
  'confirmed_at',
  'abandoned_at',
  'reported_at',
];
const partEvents = ['read_at', 'failed_at', 'confirmed_at', 'reported_at'];

const within = (columns: string[], from: string, to: string) =>
  columns.map((column) => `and(${column}.gte.${from},${column}.lt.${to})`).join(',');

const day = 24 * 60 * 60 * 1000;

// As `record_import_copy` decides it.
export function partEnded(
  row: Pick<ImportRecordRow, 'status' | 'confirmed_at'>,
  part: Pick<PartRecordRow, 'status'>,
  now: Date
) {
  if (part.status === 'confirmed' || part.status === 'failed') return true;
  if (row.status === 'abandoned' || row.status === 'failed') return true;
  return (
    row.status === 'confirmed' &&
    row.confirmed_at !== null &&
    Date.parse(row.confirmed_at) <= now.getTime() - libraryPartDays * day
  );
}

function chunks<T>(items: T[], size = 100) {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    out.push(items.slice(start, start + size));
  }
  return out;
}

export function importRecords(admin: AdminClient): ImportRecords {
  async function rows(ids: string[]) {
    const found: (ImportRecordRow & { import_library_parts: PartRecordRow[] })[] = [];
    for (const chunk of chunks(ids)) {
      const { data, error } = await admin
        .from('imports')
        .select(`${recordColumns}, import_library_parts(${partRecordColumns})`)
        .in('id', chunk);
      if (error) throw fromDatabaseError(error, 'read import records');
      found.push(...data);
    }
    return found;
  }

  return {
    async get(importId) {
      const [found] = await rows([importId]);
      if (!found) return null;
      const { data, error } = await admin
        .from('import_files')
        .select(importFileColumns)
        .eq('import_id', importId)
        .order('upload_path')
        .order('id');
      if (error) throw fromDatabaseError(error, 'list import record files');
      const { import_library_parts: parts, ...row } = found;
      return { row, files: data, parts };
    },

    async recordCopy(importId, part) {
      const { error } = await admin.rpc('record_import_copy', {
        p_import_id: importId,
        ...(part ? { p_part: part } : {}),
      });
      if (error) throw fromDatabaseError(error, 'record import copy');
    },

    async uncopied(now) {
      const { data, error } = await admin
        .from('imports')
        .select('id, status, confirmed_at, import_library_parts(part, status)')
        .in('status', ['confirmed', 'abandoned', 'failed'])
        .is('objects_removed_at', null);
      if (error) throw fromDatabaseError(error, 'list ended imports');
      const written = new Set<string>();
      for (const chunk of chunks(data.map((row) => row.id))) {
        const copies = await admin
          .from('import_copies')
          .select('import_id, part')
          .in('import_id', chunk);
        if (copies.error) throw fromDatabaseError(copies.error, 'list import copies');
        for (const copy of copies.data) written.add(`${copy.import_id}:${copy.part ?? ''}`);
      }
      return data.flatMap((row) => [
        ...(written.has(`${row.id}:`) ? [] : [{ importId: row.id, part: null }]),
        ...row.import_library_parts
          .filter((part) => partEnded(row, part, now) && !written.has(`${row.id}:${part.part}`))
          .map((part) => ({ importId: row.id, part: part.part })),
      ]);
    },

    async activity(organizationId, now) {
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      const midnight = `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
      const [lastHour, today] = await Promise.all([
        admin
          .from('imports')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .gte('started_at', hourAgo),
        admin
          .from('imports')
          .select('cost_usd')
          .eq('organization_id', organizationId)
          .gte('started_at', midnight),
      ]);
      if (lastHour.error) throw fromDatabaseError(lastHour.error, 'count recent imports');
      if (today.error) throw fromDatabaseError(today.error, 'sum the day of imports');
      return {
        startedLastHour: lastHour.count ?? 0,
        spentTodayUsd: today.data.reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0),
      };
    },

    async between(from, to) {
      const [own, ofParts] = await Promise.all([
        admin
          .from('imports')
          .select('id')
          .or(within(importEvents, from, to)),
        admin
          .from('import_library_parts')
          .select('import_id')
          .or(within(partEvents, from, to)),
      ]);
      if (own.error) throw fromDatabaseError(own.error, 'list the day of imports');
      if (ofParts.error) throw fromDatabaseError(ofParts.error, 'list the day of library parts');
      const ids = [
        ...new Set([...own.data.map((row) => row.id), ...ofParts.data.map((row) => row.import_id)]),
      ];
      return (await rows(ids)).map(({ import_library_parts: parts, ...row }) => ({
        row,
        files: [],
        parts,
      }));
    },
  };
}
