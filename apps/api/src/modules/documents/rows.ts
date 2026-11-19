import { type DocumentSet, documentSetGroups, serviceContractTypeKey } from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import { type DataClient, fromDatabaseError } from '../../lib/db';
import { ApiError } from '../../lib/errors';

export type Tables = Database['public']['Tables'];
export type RevisionRow = Pick<
  Tables['document_revisions']['Row'],
  | 'id'
  | 'revision'
  | 'status'
  | 'docx_path'
  | 'pdf_path'
  | 'generation_id'
  | 'data_snapshot'
  | 'edited_at'
  | 'issued_at'
  | 'created_at'
> & {
  document_generations: { issue_date: string; first_decision_number: number | null } | null;
  document_template_versions: Pick<
    Tables['document_template_versions']['Row'],
    'version' | 'kind' | 'note'
  > | null;
  // One to one, so PostgREST embeds an object, or null where nothing was attached.
  document_signed_copies?: {
    revision_id: string;
    source: string;
    confirmed_at: string | null;
    uploaded_at: string;
  } | null;
};
export type DocumentRow = Pick<
  Tables['client_documents']['Row'],
  'id' | 'client_id' | 'type_key' | 'title' | 'decision_number' | 'period' | 'document_group'
> & { document_revisions: RevisionRow[] };

const documentColumns =
  'id, client_id, type_key, title, decision_number, period, document_group, document_revisions(id, revision, status, docx_path, pdf_path, generation_id, data_snapshot, edited_at, issued_at, created_at, document_generations(issue_date, first_decision_number), document_template_versions(version, kind, note), document_signed_copies(revision_id, source, confirmed_at, uploaded_at))';

export type Actor = { userId: string; organizationId: string; createdBy: string };

// The service contract has routes of its own (ADR 007).
export async function readDocuments(db: DataClient, clientId: string, set: DocumentSet) {
  const { data, error } = await db
    .from('client_documents')
    .select(documentColumns)
    .eq('client_id', clientId)
    .eq('document_group', documentSetGroups[set])
    .returns<DocumentRow[]>();
  if (error) throw fromDatabaseError(error, 'list client documents');
  return data;
}

export async function readServiceContractRow(db: DataClient, clientId: string) {
  const { data, error } = await db
    .from('client_documents')
    .select(documentColumns)
    .eq('client_id', clientId)
    .eq('type_key', serviceContractTypeKey)
    .returns<DocumentRow[]>()
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find service contract document');
  return data;
}

export function lastGeneration(db: DataClient, clientId: string, set: DocumentSet) {
  return db
    .from('document_generations')
    .select('issue_date, first_decision_number')
    .eq('client_id', clientId)
    .eq('document_group', documentSetGroups[set])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function readDocument(db: DataClient, documentId: string) {
  const { data, error } = await db
    .from('client_documents')
    .select(documentColumns)
    .eq('id', documentId)
    .returns<DocumentRow[]>()
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find client document');
  if (!data) throw new ApiError('not_found', 'This document does not exist.');
  return data;
}

export const newest = (document: DocumentRow) =>
  document.document_revisions.reduce<RevisionRow | null>(
    (best, revision) => (!best || revision.revision > best.revision ? revision : best),
    null
  );

export const nextRevision = (document: DocumentRow) => (newest(document)?.revision ?? 0) + 1;

export const draftOf = (document: DocumentRow) =>
  document.document_revisions.find((revision) => revision.status === 'draft');

export const issuedOf = (document: DocumentRow) =>
  document.document_revisions.find((revision) => revision.status === 'issued');
