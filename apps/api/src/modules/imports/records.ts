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
  | 'created_by'
  | 'expensive_alerted_at'
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

export type DayImportRow = Pick<
  ImportRecordRow,
  | 'id'
  | 'organization_id'
  | 'kind'
  | 'status'
  | 'failure_reason'
  | 'started_at'
  | 'ready_at'
  | 'failed_at'
  | 'confirmed_at'
  | 'abandoned_at'
  | 'reported_at'
  | 'expensive_alerted_at'
  | 'quality'
  | 'reading_flags'
  | 'cost_usd'
>;

export type DayPartRow = Pick<
  PartRecordRow,
  | 'part'
  | 'status'
  | 'failure_reason'
  | 'read_at'
  | 'failed_at'
  | 'confirmed_at'
  | 'reported_at'
  | 'quality'
  | 'reading_flags'
  | 'cost_usd'
>;

// What the day summary and the alert rules read of an import, without its proposal or files.
export interface ImportDay {
  row: DayImportRow;
  parts: DayPartRow[];
}

export interface CopyToWrite {
  importId: string;
  // Null for the import's own copy.
  part: ImportLibraryPart | null;
  // A record of the copy exists: it began and has not finished.
  recorded: boolean;
}

export interface OrganizationActivity {
  startedLastHour: number;
  spentTodayUsd: number;
}

export interface ImportRecords {
  get(importId: string): Promise<ImportRecord | null>;
  recordCopy(importId: string, part: ImportLibraryPart | null): Promise<void>;
  completeCopy(importId: string, part: ImportLibraryPart | null): Promise<void>;
  // The imports and parts that ended and still have their objects, without a complete copy.
  uncopied(now: Date): Promise<CopyToWrite[]>;
  // The same, of the imports named only.
  incompleteCopies(importIds: string[], now: Date): Promise<CopyToWrite[]>;
  // True for the one caller that marks the import's expensive alert sent.
  claimExpensiveAlert(importId: string): Promise<boolean>;
  activity(organizationId: string, now: Date): Promise<OrganizationActivity>;
  // Every import with something of its own or of a part's in [from, to).
  between(from: string, to: string): Promise<ImportDay[]>;
}

const recordColumns =
  'id, organization_id, kind, status, client_id, into_existing_client, failure_reason, created_at, started_at, ready_at, failed_at, confirmed_at, abandoned_at, reported_at, created_by, expensive_alerted_at, proposal, changes, quality, reading_version, reading_flags, read_characters, input_tokens, cached_input_tokens, output_tokens, cost_usd, usage_by_step';

const partRecordColumns =
  'part, status, attempt, failure_reason, read_at, failed_at, confirmed_at, reported_at, proposal, changes, quality, reading_version, reading_flags, input_tokens, cached_input_tokens, output_tokens, cost_usd';

const dayColumns =
  'id, organization_id, kind, status, failure_reason, started_at, ready_at, failed_at, confirmed_at, abandoned_at, reported_at, expensive_alerted_at, quality, reading_flags, cost_usd';

const partDayColumns =
  'part, status, failure_reason, read_at, failed_at, confirmed_at, reported_at, quality, reading_flags, cost_usd';

const endedColumns = 'id, status, confirmed_at, import_library_parts(part, status)';

// PostgREST's max_rows in supabase/config.toml: a longer answer is cut there without an error.
const pageRows = 1000;

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

type EndedImport = {
  id: string;
  status: ImportRecordRow['status'];
  confirmed_at: string | null;
  import_library_parts: Pick<PartRecordRow, 'part' | 'status'>[];
};

async function pages<T>(
  page: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: Parameters<typeof fromDatabaseError>[0] | null }>,
  context: string
) {
  const found: T[] = [];
  for (let from = 0; ; from += pageRows) {
    const { data, error } = await page(from, from + pageRows - 1);
    if (error) throw fromDatabaseError(error, context);
    found.push(...(data ?? []));
    if ((data ?? []).length < pageRows) return found;
  }
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

  async function dayRows(ids: string[]) {
    const found: ImportDay[] = [];
    for (const chunk of chunks(ids)) {
      const { data, error } = await admin
        .from('imports')
        .select(`${dayColumns}, import_library_parts(${partDayColumns})`)
        .in('id', chunk);
      if (error) throw fromDatabaseError(error, 'read the day of imports');
      found.push(...data.map(({ import_library_parts: parts, ...row }) => ({ row, parts })));
    }
    return found;
  }

  async function withoutCompleteCopy(ended: EndedImport[], now: Date): Promise<CopyToWrite[]> {
    const complete = new Map<string, boolean>();
    // At most four copies an import, its own and three parts', so a chunk stays under max_rows.
    for (const chunk of chunks(ended.map((row) => row.id))) {
      const { data, error } = await admin
        .from('import_copies')
        .select('import_id, part, completed_at')
        .in('import_id', chunk);
      if (error) throw fromDatabaseError(error, 'list import copies');
      for (const copy of data) {
        complete.set(`${copy.import_id}:${copy.part ?? ''}`, copy.completed_at !== null);
      }
    }
    const missing = (importId: string, part: ImportLibraryPart | null): CopyToWrite[] => {
      const done = complete.get(`${importId}:${part ?? ''}`);
      return done ? [] : [{ importId, part, recorded: done === false }];
    };
    return ended.flatMap((row) => [
      ...missing(row.id, null),
      ...row.import_library_parts
        .filter((part) => partEnded(row, part, now))
        .flatMap((part) => missing(row.id, part.part)),
    ]);
  }

  async function idsWithin(from: string, to: string) {
    const [own, ofParts] = await Promise.all([
      pages(
        (first, last) =>
          admin
            .from('imports')
            .select('id')
            .or(within(importEvents, from, to))
            .order('id')
            .range(first, last),
        'list the day of imports'
      ),
      pages(
        (first, last) =>
          admin
            .from('import_library_parts')
            .select('import_id, part')
            .or(within(partEvents, from, to))
            .order('import_id')
            .order('part')
            .range(first, last),
        'list the day of library parts'
      ),
    ]);
    return [...new Set([...own.map((row) => row.id), ...ofParts.map((row) => row.import_id)])];
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

    async completeCopy(importId, part) {
      const { error } = await admin.rpc('complete_import_copy', {
        p_import_id: importId,
        ...(part ? { p_part: part } : {}),
      });
      if (error) throw fromDatabaseError(error, 'complete import copy');
    },

    async uncopied(now) {
      const ended = await pages(
        (from, to) =>
          admin
            .from('imports')
            .select(endedColumns)
            .in('status', ['confirmed', 'abandoned', 'failed'])
            .is('objects_removed_at', null)
            .order('id')
            .range(from, to),
        'list ended imports'
      );
      return withoutCompleteCopy(ended, now);
    },

    async incompleteCopies(importIds, now) {
      const ended: EndedImport[] = [];
      for (const chunk of chunks(importIds)) {
        const { data, error } = await admin.from('imports').select(endedColumns).in('id', chunk);
        if (error) throw fromDatabaseError(error, 'list imports to empty');
        ended.push(...data);
      }
      return withoutCompleteCopy(ended, now);
    },

    async claimExpensiveAlert(importId) {
      const { data, error } = await admin
        .from('imports')
        .update({ expensive_alerted_at: new Date().toISOString() })
        .eq('id', importId)
        .is('expensive_alerted_at', null)
        .select('id');
      if (error) throw fromDatabaseError(error, 'mark the expensive alert');
      return data.length > 0;
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
      return dayRows(await idsWithin(from, to));
    },
  };
}
