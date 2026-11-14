import type { RouteHandler } from '@hono/zod-openapi';
import {
  type ClientFile,
  clientFileErrorReasons,
  type ClientFileType,
  type ImportKind,
  type InstructionDomain,
  maxClientFileBytes,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';

import type { Database } from '../../database.types';
import {
  archivedClientError,
  createDataClient,
  type DataClient,
  fromDatabaseError,
} from '../../lib/db';
import { sha256 } from '../../lib/docx';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { createFileStore } from '../../lib/files';
import { contentMatches, splitFileName, typeOfExtension } from './file-type';
import type {
  deleteClientFileRoute,
  listClientFilesRoute,
  setClientFileOwnersOnlyRoute,
  updateClientFileRoute,
  uploadClientFileRoute,
} from './routes';

// The policies decide who sees and who changes a file (ADR 013). The handlers check the
// same rules first only to answer 403 and 409 where the database would match no row.

export type FileRow = Pick<
  Database['public']['Tables']['client_files']['Row'],
  | 'id'
  | 'name'
  | 'note'
  | 'owners_only'
  | 'original_file_name'
  | 'mime_type'
  | 'size_bytes'
  | 'sha256'
  | 'storage_path'
  | 'uploaded_by'
  | 'import_id'
  | 'import_path'
  | 'earlier_instructions_domain'
  | 'valid_until'
  | 'created_at'
  | 'updated_at'
> & {
  employees: { id: string; last_name: string; first_name: string } | null;
  import_files: {
    state: string;
    reason: string | null;
    document_kind: string | null;
    document_domain: InstructionDomain | null;
  }[];
  imports: { kind: ImportKind; confirmed_at: string | null } | null;
};

export const fileColumns =
  'id, name, note, owners_only, original_file_name, mime_type, size_bytes, sha256, storage_path, uploaded_by, import_id, import_path, earlier_instructions_domain, valid_until, created_at, updated_at, employees(id, last_name, first_name), import_files!import_files_client_file_id_fkey(state, reason, document_kind, document_domain), imports!client_files_import_in_organization(kind, confirmed_at)';

const isOwner = (c: Context<ApiEnv>) => c.get('membership').role === 'owner';

const canChange = (c: Context<ApiEnv>, row: FileRow) =>
  isOwner(c) || (row.uploaded_by !== null && row.uploaded_by === c.get('user').id);

export async function memberNames(db: DataClient, userIds: (string | null)[]) {
  const ids = [...new Set(userIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map<string, string>();
  const { data, error } = await db.from('profiles').select('user_id, full_name').in('user_id', ids);
  if (error) throw fromDatabaseError(error, 'read uploader names');
  return new Map(data.map((profile) => [profile.user_id, profile.full_name]));
}

const uploaderNames = (db: DataClient, rows: FileRow[]) =>
  memberNames(
    db,
    rows.map((row) => row.uploaded_by)
  );

function toClientFile(c: Context<ApiEnv>, row: FileRow, names: Map<string, string>): ClientFile {
  return {
    id: row.id,
    name: row.name,
    note: row.note,
    ownersOnly: row.owners_only,
    employee: row.employees
      ? {
          id: row.employees.id,
          lastName: row.employees.last_name,
          firstName: row.employees.first_name,
        }
      : null,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type as ClientFileType,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    uploadedBy: row.uploaded_by
      ? { id: row.uploaded_by, fullName: names.get(row.uploaded_by) ?? null }
      : null,
    canChange: canChange(c, row),
    importId: row.import_id,
    importPath: row.import_path,
    importKind: row.imports?.kind ?? null,
    importRead: row.import_id ? (row.import_files[0]?.state ?? 'read') === 'read' : null,
    importReason:
      row.import_id && row.import_files[0]?.state !== 'read'
        ? (row.import_files[0]?.reason ?? null)
        : null,
    earlierInstructions:
      row.earlier_instructions_domain && row.valid_until
        ? { domain: row.earlier_instructions_domain, validUntil: row.valid_until }
        : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function present(c: Context<ApiEnv>, db: DataClient, row: FileRow) {
  return toClientFile(c, row, await uploaderNames(db, [row]));
}

export async function findClient(db: DataClient, clientId: string) {
  const { data, error } = await db
    .from('clients')
    .select('id, stage, archived_at')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find client');
  if (!data) throw new ApiError('not_found', 'This client does not exist in your organization.');
  return data;
}

async function findFile(db: DataClient, clientId: string, fileId: string) {
  const { data, error } = await db
    .from('client_files')
    .select(fileColumns)
    .eq('id', fileId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find client file');
  if (!data) throw new ApiError('not_found', 'This file does not exist under this client.');
  return data;
}

async function requireEmployee(db: DataClient, clientId: string, employeeId: string) {
  const { data, error } = await db
    .from('employees')
    .select('id')
    .eq('id', employeeId)
    .eq('client_id', clientId)
    .is('archived_at', null)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find employee');
  if (!data) {
    throw new ApiError('validation_error', 'This employee does not exist under this client.', [
      { path: 'employeeId', message: 'This employee does not exist under this client.' },
    ]);
  }
}

function requireChangeable(c: Context<ApiEnv>, row: FileRow) {
  if (!canChange(c, row)) {
    throw new ApiError(
      'forbidden',
      'Only the member who uploaded a file, or an owner, changes it.'
    );
  }
}

async function requireActiveClient(db: DataClient, clientId: string) {
  if ((await findClient(db, clientId)).archived_at) throw archivedClientError();
}

const leadOwnersOnly = () =>
  new ApiError(
    'conflict',
    'The files of a lead are for owners only until it is promoted.',
    undefined,
    clientFileErrorReasons.leadOwnersOnly
  );

const refused = (reason: string, message: string) =>
  new ApiError('validation_error', message, undefined, reason);

function checkedType(fileName: string, bytes: Uint8Array) {
  if (bytes.length === 0) throw refused(clientFileErrorReasons.empty, 'The file is empty.');
  if (bytes.length > maxClientFileBytes) {
    throw refused(clientFileErrorReasons.tooLarge, 'The file is larger than 25 MiB.');
  }
  const type = typeOfExtension(splitFileName(fileName).extension);
  if (!type) {
    throw refused(
      clientFileErrorReasons.typeNotAllowed,
      'Only PDF, JPEG, PNG, Word and Excel files are kept.'
    );
  }
  if (!contentMatches(type, bytes)) {
    throw refused(
      clientFileErrorReasons.contentMismatch,
      'The content of the file is not what its extension says.'
    );
  }
  return type;
}

export const listClientFiles: RouteHandler<typeof listClientFilesRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const { employeeId } = c.req.valid('query');
  const db = createDataClient(c);
  await findClient(db, clientId);
  const files = db.from('client_files').select(fileColumns).eq('client_id', clientId);
  const { data, error } = await (
    employeeId ? files.eq('employee_id', employeeId) : files.is('employee_id', null)
  )
    .order('created_at', { ascending: false })
    .order('id');
  if (error) throw fromDatabaseError(error, 'list client files');
  return c.json({ items: await withLinks(c, db, data) }, 200);
};

// Ten minutes: a list puts each link on a real anchor and fetches itself again before they
// expire; a phone may sleep in between.
const linkSeconds = 600;

export async function withLinks(c: Context<ApiEnv>, db: DataClient, rows: FileRow[]) {
  const [names, links] = await Promise.all([
    uploaderNames(db, rows),
    rows.length > 0
      ? createFileStore(c).clientFileLinks(
          rows.map((row) => row.storage_path),
          linkSeconds
        )
      : new Map<string, string>(),
  ]);
  return rows.map((row) => ({
    ...toClientFile(c, row, names),
    link: {
      url: links.get(row.storage_path)!,
      fileName: downloadName(row.original_file_name),
      disposition: shownInline.has(row.mime_type) ? ('inline' as const) : ('attachment' as const),
      expiresInSeconds: linkSeconds,
    },
  }));
}

export const uploadClientFile: RouteHandler<typeof uploadClientFileRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const query = c.req.valid('query');
  if (Number(c.req.header('Content-Length') ?? 0) > maxClientFileBytes) {
    throw refused(clientFileErrorReasons.tooLarge, 'The file is larger than 25 MiB.');
  }
  // The body is the file itself, not JSON, so it is read here rather than validated above.
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  const type = checkedType(query.fileName, bytes);
  const db = createDataClient(c);
  const client = await findClient(db, clientId);
  if (client.archived_at) throw archivedClientError();
  const asked = query.ownersOnly === 'true';
  if (asked && !isOwner(c)) {
    throw new ApiError('forbidden', 'Only an owner keeps a file for owners only.');
  }
  if (query.employeeId) await requireEmployee(db, clientId, query.employeeId);
  const earlier = earlierInstructionsOf(query);
  const stem = splitFileName(query.fileName).stem.trim().slice(0, 200).trim();
  const { data: row, error } = await db
    .from('client_files')
    .insert({
      organization_id: c.get('membership').organizationId,
      client_id: clientId,
      employee_id: query.employeeId ?? null,
      name: query.name ?? (stem || query.fileName.slice(0, 200)),
      note: query.note || null,
      owners_only: asked || client.stage === 'lead',
      original_file_name: query.fileName,
      mime_type: type,
      size_bytes: bytes.length,
      sha256: await sha256(bytes),
      uploaded_by: c.get('user').id,
      earlier_instructions_domain: earlier?.domain ?? null,
      valid_until: earlier?.validUntil ?? null,
    })
    .select(fileColumns)
    .single();
  if (error) throw fromDatabaseError(error, 'record client file');
  try {
    await createFileStore(c).writeClientFile(row.storage_path, bytes, type);
  } catch (failure) {
    await db.from('client_files').delete().eq('id', row.id);
    throw failure;
  }
  if (earlier) {
    const answer = await db
      .from('earlier_instructions_unavailable')
      .delete()
      .eq('client_id', clientId)
      .eq('domain', earlier.domain);
    if (answer.error) throw fromDatabaseError(answer.error, 'take back the answer');
  }
  return c.json({ file: await present(c, db, row) }, 201);
};

export const updateClientFile: RouteHandler<typeof updateClientFileRoute, ApiEnv> = async (c) => {
  const { clientId, fileId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = createDataClient(c);
  const current = await findFile(db, clientId, fileId);
  requireChangeable(c, current);
  const changes: Database['public']['Tables']['client_files']['Update'] = {};
  if (body.name !== undefined) changes.name = body.name;
  if (body.note !== undefined) changes.note = body.note || null;
  if (body.validUntil !== undefined) {
    if (!current.earlier_instructions_domain) {
      throw refused(
        clientFileErrorReasons.notEarlierInstructions,
        'Only a copy of earlier own instructions has a day they applied until.'
      );
    }
    changes.valid_until = body.validUntil;
  }
  if (Object.keys(changes).length === 0)
    return c.json({ file: await present(c, db, current) }, 200);
  const { data, error } = await db
    .from('client_files')
    .update(changes)
    .eq('id', fileId)
    .eq('client_id', clientId)
    .select(fileColumns)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'update client file');
  if (!data) throw new ApiError('not_found', 'This file does not exist under this client.');
  return c.json({ file: await present(c, db, data) }, 200);
};

export const setClientFileOwnersOnly: RouteHandler<
  typeof setClientFileOwnersOnlyRoute,
  ApiEnv
> = async (c) => {
  const { clientId, fileId } = c.req.valid('param');
  const { ownersOnly } = c.req.valid('json');
  const db = createDataClient(c);
  await findFile(db, clientId, fileId);
  const { data, error } = await db
    .from('client_files')
    .update({ owners_only: ownersOnly })
    .eq('id', fileId)
    .eq('client_id', clientId)
    .select(fileColumns)
    .maybeSingle();
  if (error?.code === 'CFL01') throw leadOwnersOnly();
  if (error) throw fromDatabaseError(error, 'set client file visibility');
  if (!data) throw new ApiError('not_found', 'This file does not exist under this client.');
  return c.json({ file: await present(c, db, data) }, 200);
};

function earlierInstructionsOf(query: {
  earlierInstructionsDomain?: InstructionDomain;
  validUntil?: string;
  employeeId?: string;
}) {
  const { earlierInstructionsDomain: domain, validUntil } = query;
  if (domain === undefined && validUntil === undefined) return null;
  const issue = (path: string, message: string) =>
    new ApiError('validation_error', message, [{ path, message }]);
  if (domain === undefined) {
    throw issue('earlierInstructionsDomain', 'A day they applied until goes with a domain.');
  }
  if (validUntil === undefined) {
    throw issue('validUntil', 'A copy of earlier own instructions says until when they applied.');
  }
  if (query.employeeId) {
    throw issue('employeeId', "The earlier own instructions are the client's, not an employee's.");
  }
  return { domain, validUntil };
}

const shownInline = new Set<string>(['application/pdf', 'image/jpeg', 'image/png']);

// `/files/download` takes a name of at most 200 characters; the extension is what must stay.
function downloadName(fileName: string) {
  if (fileName.length <= 200) return fileName;
  const { stem, extension } = splitFileName(fileName);
  return `${stem.slice(0, 199 - extension.length)}.${extension}`;
}

export const deleteClientFile: RouteHandler<typeof deleteClientFileRoute, ApiEnv> = async (c) => {
  const { clientId, fileId } = c.req.valid('param');
  const db = createDataClient(c);
  const file = await findFile(db, clientId, fileId);
  requireChangeable(c, file);
  await requireActiveClient(db, clientId);
  await createFileStore(c).removeClientFile(file.storage_path);
  const { error } = await db.from('client_files').delete().eq('id', fileId);
  if (error) throw fromDatabaseError(error, 'delete client file');
  return c.body(null, 204);
};
