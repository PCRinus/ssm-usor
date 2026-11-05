import type { ImportLibraryPart } from '@ssm-usor/contracts';
import type {
  EmployeeImportClient,
  ExistingClient,
  LibraryModule,
  ProviderIdentity,
  TrainingThemes,
  Usage,
} from '@ssm-usor/import';

import type { Database, Json } from '../../database.types';
import type { AdminClient } from '../../lib/admin-db';
import { fromDatabaseError } from '../../lib/db';
import { creditsStore } from '../credits/store';
import { importCharges } from '../credits/usage';
import { clientTrainingThemes, employeeImportClient } from './employees';
import { type ClientSheets, clientSheetsOf, type RiskLibrary, riskLibraryOf } from './risk-sheets';

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
  | 'declared_pages'
  | 'document_domain'
>;

export type LibraryPartRow = Pick<
  Tables['import_library_parts']['Row'],
  'import_id' | 'part' | 'status' | 'attempt' | 'proposal'
>;

export type LibraryPartUpdate = Tables['import_library_parts']['Update'];

export type ImportUpdate = Tables['imports']['Update'];
export type ImportStep = 'sorting' | 'reading' | 'scanning';
export type ImportFileUpdate = Tables['import_files']['Update'];

const importColumns =
  'id, organization_id, kind, client_id, into_existing_client, status, company_name, company_cui, proposal, files_copied_at, created_by';

export const importFileColumns =
  'id, import_id, upload_path, original_file_name, mime_type, size_bytes, sha256, storage_path, state, document_kind, reason, company_name, company_cui, page_count, is_scan, text_path, derived_path, declared_pages, document_domain';

const libraryPartColumns = 'import_id, part, status, attempt, proposal';

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
  // One credit, once, whatever the queue delivers again (ADR 030).
  chargeScannedPage(row: ImportRow, fileId: string, page: number): Promise<void>;
  // False when the credits left do not cover the pages counted past what the start was charged.
  settleSheetPages(row: ImportRow, extra: number): Promise<boolean>;
  // Adds the parts the import lacks, and answers every part of it still reading.
  openLibraryParts(row: ImportRow, parts: ImportLibraryPart[]): Promise<LibraryPartRow[]>;
  getLibraryPart(importId: string, part: ImportLibraryPart): Promise<LibraryPartRow | null>;
  // Only while the part is reading that attempt; false when it no longer is.
  updateLibraryPart(
    importId: string,
    part: ImportLibraryPart,
    attempt: number,
    patch: LibraryPartUpdate
  ): Promise<boolean>;
  recordLibraryPartUsage(
    importId: string,
    part: ImportLibraryPart,
    usage: Usage,
    cost: number
  ): Promise<void>;
  chargeLibraryPart(row: ImportRow, part: ImportLibraryPart, attempt: number): Promise<void>;
  // The organization's active modules of both domains, each with its current text.
  libraryModules(organizationId: string): Promise<LibraryModule[]>;
  riskLibrary(organizationId: string): Promise<RiskLibrary>;
  clientSheets(clientId: string): Promise<ClientSheets>;
  provider(organizationId: string): Promise<ProviderIdentity>;
  client(clientId: string): Promise<ExistingClient | null>;
  employeeImportClient(clientId: string): Promise<EmployeeImportClient>;
  trainingThemes(row: ImportRow, today: string): Promise<TrainingThemes>;
  keepPageImage(
    fileId: string,
    page: number,
    image: { sizeBytes: number; sha256: string }
  ): Promise<void>;
  folderCopies(importId: string): Promise<{ source_path: string; target_path: string }[]>;
  markCopied(importId: string): Promise<void>;
  uncopiedImports(confirmedBefore: string): Promise<string[]>;
  failStalled(reasons: { stalled: string; left: string }): Promise<string[]>;
  failStalledLibraryParts(reasons: {
    instructions: string;
    risks: string;
  }): Promise<{ importId: string; part: ImportLibraryPart }[]>;
  listAbandoned(): Promise<ImportObjectList[]>;
  // Only the imports whose objects are gone: another list leaves them for the next day.
  deleteAbandoned(importIds: string[]): Promise<string[]>;
  dropProposals(): Promise<number>;
  listObjectsToRemove(): Promise<ImportObjectList[]>;
  markObjectsRemoved(importIds: string[]): Promise<string[]>;
  listExpiredCopies(): Promise<ImportCopy[]>;
  markCopiesRemoved(copyIds: string[]): Promise<string[]>;
}

export interface ImportObjectList {
  importId: string;
  paths: string[];
}

export interface ImportCopy {
  id: string;
  // Null for the import's own copy.
  part: ImportLibraryPart | null;
  folder: string;
}

/** IMP05: the real size of a file breaks the import's caps. */
export class ImportLimitError extends Error {
  constructor() {
    super('The import breaks the caps of its kind.');
    this.name = 'ImportLimitError';
  }
}

export function importStore(admin: AdminClient): ImportStore {
  const charges = importCharges(creditsStore(admin));
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

    chargeScannedPage: (row, fileId, page) =>
      charges.scannedPage(row.organization_id, row.id, fileId, page),

    settleSheetPages: (row, extra) => charges.settlePages(row.organization_id, row.id, extra),

    async openLibraryParts(row, parts) {
      if (parts.length > 0) {
        const { error } = await admin.from('import_library_parts').upsert(
          parts.map((part) => ({ import_id: row.id, organization_id: row.organization_id, part })),
          { onConflict: 'import_id,part', ignoreDuplicates: true }
        );
        if (error) throw fromDatabaseError(error, 'open library parts');
      }
      const { data, error } = await admin
        .from('import_library_parts')
        .select(libraryPartColumns)
        .eq('import_id', row.id)
        .eq('status', 'reading');
      if (error) throw fromDatabaseError(error, 'list library parts');
      return data;
    },

    async getLibraryPart(importId, part) {
      const { data, error } = await admin
        .from('import_library_parts')
        .select(libraryPartColumns)
        .eq('import_id', importId)
        .eq('part', part)
        .maybeSingle();
      if (error) throw fromDatabaseError(error, 'read library part');
      return data;
    },

    async updateLibraryPart(importId, part, attempt, patch) {
      const { data, error } = await admin
        .from('import_library_parts')
        .update(patch)
        .eq('import_id', importId)
        .eq('part', part)
        .eq('attempt', attempt)
        .eq('status', 'reading')
        .select('part');
      if (error) throw fromDatabaseError(error, 'update library part');
      return data.length > 0;
    },

    async recordLibraryPartUsage(importId, part, usage, cost) {
      const { error } = await admin.rpc('record_library_part_usage', {
        p_import_id: importId,
        p_part: part,
        p_input_tokens: usage.input,
        p_cached_input_tokens: usage.cachedInput,
        p_output_tokens: usage.output,
        p_cost_usd: Number(cost.toFixed(6)),
      });
      if (error) throw fromDatabaseError(error, 'record library part usage');
    },

    chargeLibraryPart: (row, part, attempt) =>
      charges.libraryPart(row.organization_id, row.id, part, attempt),

    async libraryModules(organizationId) {
      const { data, error } = await admin
        .from('instruction_modules')
        .select(
          'id, title, module_group, domain, instruction_module_versions(number, body, text_hash)'
        )
        .eq('organization_id', organizationId)
        .is('archived_at', null)
        .order('number', { referencedTable: 'instruction_module_versions', ascending: false })
        .limit(1, { referencedTable: 'instruction_module_versions' });
      if (error) throw fromDatabaseError(error, 'read library modules');
      return data.flatMap((module) => {
        const current = module.instruction_module_versions[0];
        if (!current) return [];
        return [
          {
            id: module.id,
            title: module.title,
            category: module.module_group,
            domain: module.domain,
            body: current.body as unknown as LibraryModule['body'],
            textHash: current.text_hash,
          },
        ];
      });
    },

    riskLibrary: (organizationId) => riskLibraryOf(admin, organizationId),

    clientSheets: (clientId) => clientSheetsOf(admin, clientId),

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

    async keepPageImage(fileId, page, image) {
      const { error } = await admin
        .from('import_page_images')
        .upsert(
          { import_file_id: fileId, page, size_bytes: image.sizeBytes, sha256: image.sha256 },
          { onConflict: 'import_file_id,page' }
        );
      if (error) throw fromDatabaseError(error, 'keep import page image');
    },

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

    async failStalledLibraryParts(reasons) {
      const { data, error } = await admin.rpc('fail_stalled_library_parts', {
        p_reason: reasons.instructions,
        p_risks_reason: reasons.risks,
      });
      if (error) throw fromDatabaseError(error, 'fail stalled library parts');
      return data.map((row) => ({ importId: row.import_id, part: row.part }));
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

    async listExpiredCopies() {
      const { data, error } = await admin.rpc('list_expired_import_copies');
      if (error) throw fromDatabaseError(error, 'list expired import copies');
      return data.map((row) => ({
        id: row.copy_id,
        part: row.part,
        folder: row.folder,
      }));
    },

    async markCopiesRemoved(copyIds) {
      if (copyIds.length === 0) return [];
      const { data, error } = await admin.rpc('mark_import_copies_removed', {
        p_copy_ids: copyIds,
      });
      if (error) throw fromDatabaseError(error, 'mark import copies removed');
      return data;
    },
  };
}

export const asJson = (value: unknown) => value as Json;
