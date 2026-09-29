import type { RouteHandler } from '@hono/zod-openapi';
import {
  type ClientFile,
  clientFileErrorReasons,
  type ClientFileType,
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
  getClientFileDownloadRoute,
  listClientFilesRoute,
  setClientFileOwnersOnlyRoute,
  updateClientFileRoute,
  uploadClientFileRoute,
} from './routes';

// The policies decide who sees and who changes a file (ADR 013). The handlers check the
// same rules first only to answer 403 and 409 where the database would match no row.

type FileRow = Pick<
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
  | 'created_at'
  | 'updated_at'
>;

const fileColumns =
  'id, name, note, owners_only, original_file_name, mime_type, size_bytes, sha256, storage_path, uploaded_by, created_at, updated_at';

const isOwner = (c: Context<ApiEnv>) => c.get('membership').role === 'owner';

const canChange = (c: Context<ApiEnv>, row: FileRow) =>
  isOwner(c) || (row.uploaded_by !== null && row.uploaded_by === c.get('user').id);

async function uploaderNames(db: DataClient, rows: FileRow[]) {
  const ids = [...new Set(rows.flatMap((row) => (row.uploaded_by ? [row.uploaded_by] : [])))];
  if (ids.length === 0) return new Map<string, string>();
  const { data, error } = await db.from('profiles').select('user_id, full_name').in('user_id', ids);
  if (error) throw fromDatabaseError(error, 'read uploader names');
  return new Map(data.map((profile) => [profile.user_id, profile.full_name]));
}

function toClientFile(c: Context<ApiEnv>, row: FileRow, names: Map<string, string>): ClientFile {
  return {
    id: row.id,
    name: row.name,
    note: row.note,
    ownersOnly: row.owners_only,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type as ClientFileType,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    uploadedBy: row.uploaded_by
      ? { id: row.uploaded_by, fullName: names.get(row.uploaded_by) ?? null }
      : null,
    canChange: canChange(c, row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function present(c: Context<ApiEnv>, db: DataClient, row: FileRow) {
  return toClientFile(c, row, await uploaderNames(db, [row]));
}

async function findClient(db: DataClient, clientId: string) {
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
    throw refused(clientFileErrorReasons.tooLarge, 'The file is larger than 20 MiB.');
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
  const db = createDataClient(c);
  await findClient(db, clientId);
  const { data, error } = await db
    .from('client_files')
    .select(fileColumns)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .order('id');
  if (error) throw fromDatabaseError(error, 'list client files');
  const names = await uploaderNames(db, data);
  return c.json({ items: data.map((row) => toClientFile(c, row, names)) }, 200);
};

export const uploadClientFile: RouteHandler<typeof uploadClientFileRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const query = c.req.valid('query');
  if (Number(c.req.header('Content-Length') ?? 0) > maxClientFileBytes) {
    throw refused(clientFileErrorReasons.tooLarge, 'The file is larger than 20 MiB.');
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
  const stem = splitFileName(query.fileName).stem.trim().slice(0, 200).trim();
  const { data: row, error } = await db
    .from('client_files')
    .insert({
      organization_id: c.get('membership').organizationId,
      client_id: clientId,
      name: query.name ?? (stem || query.fileName.slice(0, 200)),
      note: query.note || null,
      owners_only: asked || client.stage === 'lead',
      original_file_name: query.fileName,
      mime_type: type,
      size_bytes: bytes.length,
      sha256: await sha256(bytes),
      uploaded_by: c.get('user').id,
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

const shownInline = new Set<string>(['application/pdf', 'image/jpeg', 'image/png']);

export const getClientFileDownload: RouteHandler<
  typeof getClientFileDownloadRoute,
  ApiEnv
> = async (c) => {
  const { clientId, fileId } = c.req.valid('param');
  const file = await findFile(createDataClient(c), clientId, fileId);
  const expiresInSeconds = 60;
  return c.json(
    {
      url: await createFileStore(c).clientFileLink(file.storage_path, expiresInSeconds),
      fileName: downloadName(file.original_file_name),
      disposition: shownInline.has(file.mime_type) ? ('inline' as const) : ('attachment' as const),
      expiresInSeconds,
    },
    200
  );
};

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
