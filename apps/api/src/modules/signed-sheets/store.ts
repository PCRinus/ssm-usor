import { isSheetRowKey, type SheetRowKey, type TrainingDomain } from '@ssm-usor/contracts';

import { type DataClient, fromDatabaseError } from '../../lib/db';
import { type SheetTestResult, toSheetTestResult } from '../trainings/sheet';
import { toAdmission, toTraining, trainingColumns } from '../trainings/training-rows';
import type { SheetTrainingRecord } from './form';

export type StoredSheet = {
  id: string;
  organizationId: string;
  clientId: string;
  employeeId: string;
  domain: TrainingDomain;
  sequence: number;
  storagePath: string;
  digest: string;
  version: number;
  rowCapacity: number;
  /** The highest periodic row index taken, voided rows included, since a key is never reused. */
  rowsUsed: number;
  certifiedAt: string | null;
  createdAt: string;
};

export type StoredRow = {
  id: string;
  signedSheetId: string;
  rowKey: SheetRowKey;
  /** Exactly one of the two: what the row holds, a training record or a test result (ADR 024). */
  trainingRecordId: string | null;
  testResultId: string | null;
  /** When the record took the row, on the database's clock; a refill leaves it. */
  filledAt: string;
  voidedAt: string | null;
  /** SHA-256 of the values last filled into the row's fields; null before the first fill. */
  filledDigest: string | null;
  /** The record was printed as text when the sheet was drawn up: no fields to fill. */
  printedAsText: boolean;
  /** When "anulat" was written into the voided row's note. */
  voidNotedAt: string | null;
};

export type NewRow = Pick<StoredRow, 'signedSheetId' | 'rowKey'> & {
  clientId: string;
  printedAsText?: boolean;
} & (
    | { trainingRecordId: string; testResultId?: never }
    | { testResultId: string; trainingRecordId?: never }
  );

export type SheetResult = SheetTestResult & {
  id: string;
  employeeId: string;
  domain: TrainingDomain;
};

export type NewSheet = Omit<StoredSheet, 'id' | 'version' | 'certifiedAt' | 'createdAt'>;

export type SheetChanges = Pick<StoredSheet, 'storagePath' | 'digest'> &
  Partial<Pick<StoredSheet, 'rowsUsed' | 'certifiedAt'>>;

export type RecordOwner = { clientId: string; organizationId: string };

/** Only the secret key writes the sheets and their rows. */
export interface SignedSheetStore {
  employee(employeeId: string): Promise<RecordOwner | null>;
  record(recordId: string): Promise<(SheetTrainingRecord & RecordOwner) | null>;
  records(employeeId: string, domain: TrainingDomain): Promise<SheetTrainingRecord[]>;
  result(resultId: string): Promise<(SheetResult & RecordOwner) | null>;
  results(employeeId: string, domain: TrainingDomain): Promise<SheetResult[]>;
  /** In sequence order; `clientId` narrows them to one client. */
  sheets(employeeId: string, domain: TrainingDomain, clientId?: string): Promise<StoredSheet[]>;
  sheet(sheetId: string): Promise<StoredSheet | null>;
  rowsOf(sheetId: string): Promise<StoredRow[]>;
  liveRowOf(recordId: string): Promise<StoredRow | null>;
  liveRowOfResult(resultId: string): Promise<StoredRow | null>;
  /** Every row the record has taken, voided ones included. */
  rowsOfRecord(recordId: string): Promise<StoredRow[]>;
  /** Null when the employee already has a sheet of that sequence. */
  createSheet(sheet: NewSheet): Promise<StoredSheet | null>;
  /** Null when a key is taken on its sheet or a record already has a live row. */
  addRows(rows: NewRow[]): Promise<StoredRow[] | null>;
  removeRow(rowId: string): Promise<void>;
  /** The next version of the sheet; null when another write moved it on first. */
  advance(sheet: StoredSheet, changes: SheetChanges): Promise<StoredSheet | null>;
  voidRow(rowId: string, at: string): Promise<void>;
  setFilledDigest(rowId: string, digest: string): Promise<void>;
  markVoidNoted(rowIds: string[], at: string): Promise<void>;
  /**
   * Whether the record has a live electronic signature made at or after `since`, both sides on
   * the database's clock.
   */
  signedSince(recordId: string, since: string): Promise<boolean>;
  signaturesSince(recordId: string, since: string): Promise<{ live: number; voided: number }>;
  electronicRequested(recordId: string): Promise<boolean>;
}

const sheetColumns =
  'id, organization_id, client_id, employee_id, domain, sequence, storage_path, digest, version, row_capacity, rows_used, certified_at, created_at';

const rowColumns =
  'id, signed_sheet_id, row_key, training_record_id, test_result_id, filled_at, voided_at, filled_digest, printed_as_text, void_noted_at';

const resultColumns =
  'id, employee_id, client_id, organization_id, domain, test, taken_on, material, examiner_name, examiner_job_title, created_at';

const recordColumns = `id, employee_id, client_id, organization_id, occupation, admitted_on, admitted_by_name, admitted_by_job_title, trainings!inner(${trainingColumns})`;

type SheetRow = {
  id: string;
  organization_id: string;
  client_id: string;
  employee_id: string;
  domain: TrainingDomain;
  sequence: number;
  storage_path: string;
  digest: string;
  version: number;
  row_capacity: number;
  rows_used: number;
  certified_at: string | null;
  created_at: string;
};

const toSheet = (row: SheetRow): StoredSheet => ({
  id: row.id,
  organizationId: row.organization_id,
  clientId: row.client_id,
  employeeId: row.employee_id,
  domain: row.domain,
  sequence: row.sequence,
  storagePath: row.storage_path,
  digest: row.digest,
  version: row.version,
  rowCapacity: row.row_capacity,
  rowsUsed: row.rows_used,
  certifiedAt: row.certified_at,
  createdAt: row.created_at,
});

type RowRow = {
  id: string;
  signed_sheet_id: string;
  row_key: string;
  training_record_id: string | null;
  test_result_id: string | null;
  filled_at: string;
  voided_at: string | null;
  filled_digest: string | null;
  printed_as_text: boolean;
  void_noted_at: string | null;
};

function toRow(row: RowRow): StoredRow {
  if (!isSheetRowKey(row.row_key)) throw new Error(`Unknown sheet row key ${row.row_key}.`);
  return {
    id: row.id,
    signedSheetId: row.signed_sheet_id,
    rowKey: row.row_key,
    trainingRecordId: row.training_record_id,
    testResultId: row.test_result_id,
    filledAt: row.filled_at,
    voidedAt: row.voided_at,
    filledDigest: row.filled_digest,
    printedAsText: row.printed_as_text,
    voidNotedAt: row.void_noted_at,
  };
}

type RecordRow = {
  id: string;
  employee_id: string;
  client_id: string;
  organization_id: string;
  occupation: string;
  admitted_on: string | null;
  admitted_by_name: string | null;
  admitted_by_job_title: string | null;
  trainings: Parameters<typeof toTraining>[0];
};

function toRecord(row: RecordRow): SheetTrainingRecord & RecordOwner {
  const training = toTraining(row.trainings);
  return {
    id: row.id,
    employeeId: row.employee_id,
    clientId: row.client_id,
    organizationId: row.organization_id,
    domain: training.domain,
    source: training.source,
    occupation: row.occupation,
    admission: toAdmission(row),
    training,
  };
}

type ResultRow = Parameters<typeof toSheetTestResult>[0] & {
  id: string;
  employee_id: string;
  client_id: string;
  organization_id: string;
  domain: TrainingDomain;
};

function toResult(row: ResultRow): SheetResult & RecordOwner {
  return {
    ...toSheetTestResult(row),
    id: row.id,
    employeeId: row.employee_id,
    clientId: row.client_id,
    organizationId: row.organization_id,
    domain: row.domain,
  };
}

const uniqueViolation = '23505';

export function supabaseSheetStore(db: DataClient): SignedSheetStore {
  async function signaturesSince(recordId: string, since: string) {
    // `created_at`, not `signed_at`: both sides on the database's clock, the row's `filled_at`
    // being the database's and a signature's moment the API's.
    const { data, error } = await db
      .from('training_signatures')
      .select('voided_at')
      .eq('training_record_id', recordId)
      .eq('method', 'electronic')
      .gte('created_at', since);
    if (error) throw fromDatabaseError(error, 'signatures of a record');
    const voided = data.filter((row) => row.voided_at !== null).length;
    return { live: data.length - voided, voided };
  }

  return {
    signaturesSince,

    async employee(employeeId) {
      const { data, error } = await db
        .from('employees')
        .select('client_id, organization_id')
        .eq('id', employeeId)
        .maybeSingle();
      if (error) throw fromDatabaseError(error, 'signed sheet employee');
      return data && { clientId: data.client_id, organizationId: data.organization_id };
    },

    async record(recordId) {
      const { data, error } = await db
        .from('training_records')
        .select(recordColumns)
        .eq('id', recordId)
        .maybeSingle();
      if (error) throw fromDatabaseError(error, 'signed sheet record');
      return data && toRecord(data);
    },

    async records(employeeId, domain) {
      const { data, error } = await db
        .from('training_records')
        .select(recordColumns)
        .eq('employee_id', employeeId)
        .eq('trainings.domain', domain);
      if (error) throw fromDatabaseError(error, 'signed sheet records');
      return data.map(toRecord);
    },

    async result(resultId) {
      const { data, error } = await db
        .from('test_results')
        .select(resultColumns)
        .eq('id', resultId)
        .maybeSingle();
      if (error) throw fromDatabaseError(error, 'signed sheet test result');
      return data && toResult(data);
    },

    async results(employeeId, domain) {
      const { data, error } = await db
        .from('test_results')
        .select(resultColumns)
        .eq('employee_id', employeeId)
        .eq('domain', domain);
      if (error) throw fromDatabaseError(error, 'signed sheet test results');
      return data.map(toResult);
    },

    async liveRowOfResult(resultId) {
      const { data, error } = await db
        .from('signed_sheet_rows')
        .select(rowColumns)
        .eq('test_result_id', resultId)
        .is('voided_at', null)
        .maybeSingle();
      if (error) throw fromDatabaseError(error, 'signed sheet row of a test result');
      return data && toRow(data);
    },

    async sheets(employeeId, domain, clientId) {
      let query = db
        .from('signed_sheets')
        .select(sheetColumns)
        .eq('employee_id', employeeId)
        .eq('domain', domain);
      if (clientId) query = query.eq('client_id', clientId);
      const { data, error } = await query.order('sequence');
      if (error) throw fromDatabaseError(error, 'signed sheets');
      return data.map(toSheet);
    },

    async sheet(sheetId) {
      const { data, error } = await db
        .from('signed_sheets')
        .select(sheetColumns)
        .eq('id', sheetId)
        .maybeSingle();
      if (error) throw fromDatabaseError(error, 'signed sheet');
      return data && toSheet(data);
    },

    async rowsOf(sheetId) {
      const { data, error } = await db
        .from('signed_sheet_rows')
        .select(rowColumns)
        .eq('signed_sheet_id', sheetId);
      if (error) throw fromDatabaseError(error, 'signed sheet rows');
      return data.map(toRow);
    },

    async liveRowOf(recordId) {
      const { data, error } = await db
        .from('signed_sheet_rows')
        .select(rowColumns)
        .eq('training_record_id', recordId)
        .is('voided_at', null)
        .maybeSingle();
      if (error) throw fromDatabaseError(error, 'signed sheet row of a record');
      return data && toRow(data);
    },

    async rowsOfRecord(recordId) {
      const { data, error } = await db
        .from('signed_sheet_rows')
        .select(rowColumns)
        .eq('training_record_id', recordId);
      if (error) throw fromDatabaseError(error, 'signed sheet rows of a record');
      return data.map(toRow);
    },

    async createSheet(sheet) {
      const { data, error } = await db
        .from('signed_sheets')
        .insert({
          organization_id: sheet.organizationId,
          client_id: sheet.clientId,
          employee_id: sheet.employeeId,
          domain: sheet.domain,
          sequence: sheet.sequence,
          storage_path: sheet.storagePath,
          digest: sheet.digest,
          row_capacity: sheet.rowCapacity,
          rows_used: sheet.rowsUsed,
        })
        .select(sheetColumns)
        .single();
      if (error?.code === uniqueViolation) return null;
      if (error) throw fromDatabaseError(error, 'create signed sheet');
      return toSheet(data);
    },

    async addRows(rows) {
      const { data, error } = await db
        .from('signed_sheet_rows')
        .insert(
          rows.map((row) => ({
            signed_sheet_id: row.signedSheetId,
            client_id: row.clientId,
            row_key: row.rowKey,
            training_record_id: row.trainingRecordId ?? null,
            test_result_id: row.testResultId ?? null,
            printed_as_text: row.printedAsText ?? false,
          }))
        )
        .select(rowColumns);
      if (error?.code === uniqueViolation) return null;
      if (error) throw fromDatabaseError(error, 'add signed sheet rows');
      return data.map(toRow);
    },

    async removeRow(rowId) {
      const { error } = await db.from('signed_sheet_rows').delete().eq('id', rowId);
      if (error) throw fromDatabaseError(error, 'remove signed sheet row');
    },

    async advance(sheet, changes) {
      const { data, error } = await db
        .from('signed_sheets')
        .update({
          storage_path: changes.storagePath,
          digest: changes.digest,
          version: sheet.version + 1,
          ...(changes.rowsUsed === undefined ? {} : { rows_used: changes.rowsUsed }),
          ...(changes.certifiedAt === undefined ? {} : { certified_at: changes.certifiedAt }),
        })
        .eq('id', sheet.id)
        .eq('version', sheet.version)
        .select(sheetColumns)
        .maybeSingle();
      if (error) throw fromDatabaseError(error, 'advance signed sheet');
      return data && toSheet(data);
    },

    async voidRow(rowId, at) {
      const { error } = await db
        .from('signed_sheet_rows')
        .update({ voided_at: at })
        .eq('id', rowId)
        .is('voided_at', null);
      if (error) throw fromDatabaseError(error, 'void signed sheet row');
    },

    async setFilledDigest(rowId, digest) {
      const { error } = await db
        .from('signed_sheet_rows')
        .update({ filled_digest: digest })
        .eq('id', rowId);
      if (error) throw fromDatabaseError(error, 'signed sheet row digest');
    },

    async markVoidNoted(rowIds, at) {
      if (rowIds.length === 0) return;
      const { error } = await db
        .from('signed_sheet_rows')
        .update({ void_noted_at: at })
        .in('id', rowIds)
        .is('void_noted_at', null);
      if (error) throw fromDatabaseError(error, 'signed sheet rows noted');
    },

    async signedSince(recordId, since) {
      return (await signaturesSince(recordId, since)).live > 0;
    },

    async electronicRequested(recordId) {
      const { count, error } = await db
        .from('signature_requests')
        .select('id', { count: 'exact', head: true })
        .eq('training_record_id', recordId)
        .neq('state', 'void')
        .not('signer_account_id', 'is', null);
      if (error) throw fromDatabaseError(error, 'requests of a record');
      return (count ?? 0) > 0;
    },
  };
}
