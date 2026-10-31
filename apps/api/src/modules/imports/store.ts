import type {
  EmployeeImportClient,
  ExistingClient,
  ProviderIdentity,
  TrainingThemes,
  Usage,
} from '@ssm-usor/import';

import type { Database, Json } from '../../database.types';
import type { AdminClient } from '../../lib/admin-db';
import { fromDatabaseError } from '../../lib/db';
import { clientTrainingThemes, employeeImportClient } from './employees';

type Tables = Database['public']['Tables'];

export type ImportStatus = Database['public']['Enums']['import_status'];
export type ImportFileState = Database['public']['Enums']['import_file_state'];

export type ImportRow = Pick<
  Tables['imports']['Row'],
  | 'id'
  | 'organization_id'
  | 'kind'
  | 'client_id'
  | 'into_existing_client'
  | 'status'
  | 'company_name'
  | 'company_cui'
  | 'proposal'
  | 'files_copied_at'
  | 'created_by'
>;

export type ImportFileRow = Pick<
  Tables['import_files']['Row'],
  | 'id'
  | 'import_id'
  | 'upload_path'
  | 'original_file_name'
  | 'mime_type'
  | 'size_bytes'
  | 'sha256'
  | 'storage_path'
  | 'state'
  | 'document_kind'
  | 'reason'
  | 'company_name'
  | 'company_cui'
  | 'page_count'
  | 'is_scan'
  | 'text_path'
  | 'derived_path'
>;

export type ImportUpdate = Tables['imports']['Update'];
export type ImportStep = 'sorting' | 'reading' | 'scanning';
export type ImportFileUpdate = Tables['import_files']['Update'];

const importColumns =
  'id, organization_id, kind, client_id, into_existing_client, status, company_name, company_cui, proposal, files_copied_at, created_by';

export const importFileColumns =
  'id, import_id, upload_path, original_file_name, mime_type, size_bytes, sha256, storage_path, state, document_kind, reason, company_name, company_cui, page_count, is_scan, text_path, derived_path';

export interface ImportStore {
  getImport(importId: string): Promise<ImportRow | null>;
  listFiles(importId: string): Promise<ImportFileRow[]>;
  // With `from`, only a file still in that state is changed; false when it was not.
  updateFile(fileId: string, patch: ImportFileUpdate, from?: ImportFileState): Promise<boolean>;
  // False when the import was no longer at `from`, which another delivery moved on.
  advance(importId: string, from: ImportStatus, patch: ImportUpdate): Promise<boolean>;
  recordUsage(
    importId: string,
    fileId: string | null,
    step: ImportStep,
    usage: Usage,
    cost: number
  ): Promise<void>;
  provider(organizationId: string): Promise<ProviderIdentity>;
  client(clientId: string): Promise<ExistingClient | null>;
  employeeImportClient(clientId: string): Promise<EmployeeImportClient>;
  trainingThemes(row: ImportRow, today: string): Promise<TrainingThemes>;
  folderCopies(importId: string): Promise<{ source_path: string; target_path: string }[]>;
  markCopied(importId: string): Promise<void>;
  uncopiedImports(confirmedBefore: string): Promise<string[]>;
  failStalled(reasons: { stalled: string; left: string }): Promise<string[]>;
  listAbandoned(): Promise<ImportObjectList[]>;
  // Only the imports whose objects are gone: another list leaves them for the next day.
  deleteAbandoned(importIds: string[]): Promise<string[]>;
  dropProposals(): Promise<number>;
  listObjectsToRemove(): Promise<ImportObjectList[]>;
  markObjectsRemoved(importIds: string[]): Promise<string[]>;
}

export interface ImportObjectList {
  importId: string;
  paths: string[];
}

/** IMP05: the real size of a file breaks the import's caps. */
export class ImportLimitError extends Error {
  constructor() {
    super('The import breaks the caps of its kind.');
    this.name = 'ImportLimitError';
  }
}

export function importStore(admin: AdminClient): ImportStore {
  return {
    async getImport(importId) {
      const { data, error } = await admin
        .from('imports')
        .select(importColumns)
        .eq('id', importId)
        .maybeSingle();
      if (error) throw fromDatabaseError(error, 'read import');
      return data;
    },

    async listFiles(importId) {
      const { data, error } = await admin
        .from('import_files')
        .select(importFileColumns)
        .eq('import_id', importId)
        .order('upload_path')
        .order('id');
      if (error) throw fromDatabaseError(error, 'list import files');
      return data;
    },

    async updateFile(fileId, patch, from) {
      const query = admin.from('import_files').update(patch).eq('id', fileId);
      const { data, error } = await (from ? query.eq('state', from) : query).select('id');
      if (error?.code === 'IMP05') throw new ImportLimitError();
      if (error) throw fromDatabaseError(error, 'update import file');
      return data.length > 0;
    },

    async advance(importId, from, patch) {
      const { data, error } = await admin
        .from('imports')
        .update(patch)
        .eq('id', importId)
        .eq('status', from)
        .select('id');
      if (error) throw fromDatabaseError(error, 'advance import');
      return data.length > 0;
    },

    async recordUsage(importId, fileId, step, usage, cost) {
      const { error } = await admin.rpc('record_import_usage', {
        p_import_id: importId,
        // Null for a request about the whole import; the generated type does not know it can be.
        p_import_file_id: fileId as string,
        p_step: step,
        p_input_tokens: usage.input,
        p_cached_input_tokens: usage.cachedInput,
        p_output_tokens: usage.output,
        p_cost_usd: Number(cost.toFixed(6)),
      });
      if (error) throw fromDatabaseError(error, 'record import usage');
    },

    async provider(organizationId) {
      const [organization, members] = await Promise.all([
        admin
          .from('organizations')
          .select(
            'name, legal_name, cui, legal_representative_name, risk_evaluator_name, fire_safety_technician_name'
          )
          .eq('id', organizationId)
          .single(),
        admin.from('organization_members').select('user_id').eq('organization_id', organizationId),
      ]);
      if (organization.error) throw fromDatabaseError(organization.error, 'read provider');
      if (members.error) throw fromDatabaseError(members.error, 'read provider members');
      const ids = members.data.map((member) => member.user_id);
      const profiles = ids.length
        ? await admin.from('profiles').select('full_name').in('user_id', ids)
        : { data: [], error: null };
      if (profiles.error) throw fromDatabaseError(profiles.error, 'read provider people');
      const row = organization.data;
      const people = [
        ...profiles.data.map((profile) => profile.full_name),
        row.legal_representative_name,
        row.risk_evaluator_name,
        row.fire_safety_technician_name,
      ].flatMap((name) => (name && name.trim() ? [name.trim()] : []));
      return {
        name: row.legal_name?.trim() || row.name,
        cui: row.cui ?? '',
        people: [...new Set(people)],
      };
    },

    async client(clientId) {
      const { data, error } = await admin
        .from('clients')
        .select('legal_name, cui')
        .eq('id', clientId)
        .maybeSingle();
      if (error) throw fromDatabaseError(error, 'read import client');
      return data ? { legalName: data.legal_name, cui: data.cui } : null;
    },

    employeeImportClient: (clientId) => employeeImportClient(admin, clientId),

    trainingThemes: (row, today) =>
      clientTrainingThemes(admin, {
        clientId: row.client_id!,
        organizationId: row.organization_id,
        createdBy: row.created_by,
        today,
      }),

    async folderCopies(importId) {
      const { data, error } = await admin.rpc('import_folder_copies', { p_import_id: importId });
      if (error) throw fromDatabaseError(error, 'list import folder copies');
      return data;
    },

    async markCopied(importId) {
      const { error } = await admin
        .from('imports')
        .update({ files_copied_at: new Date().toISOString() })
        .eq('id', importId)
        .eq('status', 'confirmed')
        .is('files_copied_at', null);
      if (error) throw fromDatabaseError(error, 'mark import folder copied');
    },

    async uncopiedImports(confirmedBefore) {
      const { data, error } = await admin
        .from('imports')
        .select('id')
        .eq('status', 'confirmed')
        .is('files_copied_at', null)
        .lt('confirmed_at', confirmedBefore);
      if (error) throw fromDatabaseError(error, 'list uncopied imports');
      return data.map((row) => row.id);
    },

    async failStalled(reasons) {
      const { data, error } = await admin.rpc('fail_stalled_imports', {
        p_stalled_reason: reasons.stalled,
        p_left_reason: reasons.left,
      });
      if (error) throw fromDatabaseError(error, 'fail stalled imports');
      return data;
    },

    async listAbandoned() {
      const { data, error } = await admin.rpc('list_abandoned_imports');
      if (error) throw fromDatabaseError(error, 'list abandoned imports');
      return data.map((row) => ({ importId: row.import_id, paths: row.paths }));
    },

    async deleteAbandoned(importIds) {
      if (importIds.length === 0) return [];
      const { data, error } = await admin.rpc('delete_abandoned_imports', {
        p_import_ids: importIds,
      });
      if (error) throw fromDatabaseError(error, 'delete abandoned imports');
      return data;
    },

    async dropProposals() {
      const { data, error } = await admin.rpc('drop_import_proposals');
      if (error) throw fromDatabaseError(error, 'drop import proposals');
      return data;
    },

    async listObjectsToRemove() {
      const { data, error } = await admin.rpc('list_import_objects_to_remove');
      if (error) throw fromDatabaseError(error, 'list import objects to remove');
      return data.map((row) => ({ importId: row.import_id, paths: row.paths }));
    },

    async markObjectsRemoved(importIds) {
      if (importIds.length === 0) return [];
      const { data, error } = await admin.rpc('mark_import_objects_removed', {
        p_import_ids: importIds,
      });
      if (error) throw fromDatabaseError(error, 'mark import objects removed');
      return data;
    },
  };
}

export const asJson = (value: unknown) => value as Json;
