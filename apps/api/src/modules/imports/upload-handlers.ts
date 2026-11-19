import type { RouteHandler } from '@hono/zod-openapi';
import {
  type CreditsShort,
  type FoundSheet,
  importErrorReasons,
  importFileExtensions,
  type ImportFileType,
  type ImportKind,
  type ImportLimits,
  importLimits,
  importStartCredits,
  isSystemPath,
  sheetFileTypes,
  type SkippedImportFile,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';

import { type AdminClient, adminClient, createAdminClient } from '../../lib/admin-db';
import { alertSender } from '../../lib/alerts';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv, ImportMessage, ImportQueue } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { createAdminFileStore } from '../../lib/files';
import { later } from '../../lib/later';
import { requireWritableClient } from '../clients/lookup';
import { creditsStore } from '../credits/store';
import { importCharges } from '../credits/usage';
import { romanianDay } from '../documents/context';
import { blocksReporterOf } from '../extras/reporting';
import { alertBusyOrganization } from './import-alerts';
import {
  adminImportStore,
  conflict,
  creatorNames,
  decisionError,
  findImport,
  listFilesOf,
  notFound,
  summaryColumns,
  toSummary,
  wrongKind,
} from './import-queries';
import { characterCount, describe, readingCapBreach, sendAll } from './pipeline';
import { fileToRead, loadPrepared, startReadOf } from './pipeline-files';
import { importRecords } from './records';
import type {
  addFoundSheetsRoute,
  createImportRoute,
  listFoundSheetsRoute,
  readImportFileRoute,
  registerImportFilesRoute,
  splitImportRoute,
  startImportRoute,
} from './routes';
import { importUnavailable, requireImportService } from './settings';
import { type ImportFileRow } from './store';

async function summaryOf(db: DataClient, importId: string) {
  const { data, error } = await db
    .from('imports')
    .select(summaryColumns)
    .eq('id', importId)
    .order('updated_at', { referencedTable: 'last_file', ascending: false })
    .limit(1, { referencedTable: 'last_file' })
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'read import');
  if (!data) throw notFound();
  return toSummary(data, await creatorNames(db, [data]));
}

export const createImport: RouteHandler<typeof createImportRoute, ApiEnv> = async (c) => {
  requireImportService(c);
  const { clientId, kind = 'client', addFoundSheets } = c.req.valid('json');
  const db = createDataClient(c);
  if (clientId) await requireWritableClient(db, clientId, { lead: 'refused' });
  const found = addFoundSheets && clientId ? await offeredSheets(db, clientId) : [];
  if (addFoundSheets && found.length === 0) throw noFoundSheets();
  const admin = createAdminClient(c);
  const { data, error } = await admin
    .from('imports')
    .insert({
      organization_id: c.get('membership').organizationId,
      kind,
      client_id: clientId ?? null,
      into_existing_client: clientId !== undefined,
      created_by: c.get('user').id,
    })
    .select('id')
    .single();
  if (error) throw fromDatabaseError(error, 'create import');
  if (found.length > 0) {
    try {
      await copyFoundSheets(c, admin, data.id, found, []);
    } catch (failure) {
      await admin.from('imports').delete().eq('id', data.id);
      throw failure;
    }
  }
  return c.json({ import: await summaryOf(db, data.id) }, 201);
};

function checkedPaths(files: { uploadPath: string; mimeType: ImportFileType }[]) {
  const seen = new Set<string>();
  for (const [index, file] of files.entries()) {
    if (seen.has(file.uploadPath)) {
      throw conflict('The same path is in the upload twice.', importErrorReasons.duplicatePath);
    }
    seen.add(file.uploadPath);
    if (isSystemPath(file.uploadPath)) {
      throw new ApiError(
        'validation_error',
        'The file is one the system or Word leaves beside the documents.',
        [{ path: `files.${index}.uploadPath`, message: 'The file is not a document.' }],
        importErrorReasons.systemFile
      );
    }
    const extension = file.uploadPath.split('.').at(-1)?.toLowerCase() ?? '';
    const types = (importFileExtensions as Record<string, readonly string[]>)[extension];
    if (!types?.includes(file.mimeType)) {
      throw new ApiError(
        'validation_error',
        'The file name does not end in the extension of its type.',
        [{ path: `files.${index}.uploadPath`, message: 'The extension is not the type’s.' }],
        importErrorReasons.typeMismatch
      );
    }
  }
}

function onlySheets(files: { mimeType: ImportFileType }[]) {
  for (const [index, file] of files.entries()) {
    if (!(sheetFileTypes as readonly string[]).includes(file.mimeType)) {
      throw new ApiError(
        'validation_error',
        'An employee import reads only photographs and PDFs of the training sheets.',
        [{ path: `files.${index}.mimeType`, message: 'The file is not a photograph or a PDF.' }],
        importErrorReasons.photosOnly
      );
    }
  }
}

const mebibytes = (bytes: number) => bytes / (1024 * 1024);

const tooLarge = (limits: ImportLimits) =>
  new ApiError(
    'unprocessable',
    `An import of this kind holds at most ${limits.files} files and ${mebibytes(limits.totalBytes)} MiB, each file at most ${mebibytes(limits.fileBytes)} MiB.`,
    undefined,
    importErrorReasons.tooLarge
  );

const notUploading = () =>
  conflict('Files are added only before the reading starts.', importErrorReasons.notUploading);

export const registerImportFiles: RouteHandler<typeof registerImportFilesRoute, ApiEnv> = async (
  c
) => {
  const { importId } = c.req.valid('param');
  const { files } = c.req.valid('json');
  checkedPaths(files);
  const row = await findImport(createDataClient(c), importId);
  if (row.status !== 'uploading') throw notUploading();
  if (row.kind === 'employees') onlySheets(files);
  const admin = createAdminClient(c);
  const known = await adminImportStore(c, admin).listFiles(importId);
  if (known.some((file) => files.some((each) => each.uploadPath === file.upload_path))) {
    throw conflict(
      'A file with this path is in the import already.',
      importErrorReasons.duplicatePath
    );
  }
  const { fresh, skipped } = withoutCopies(files, known);
  const bytes = [...known, ...fresh].reduce(
    (total, file) => total + ('sizeBytes' in file ? file.sizeBytes : file.size_bytes),
    0
  );
  const limits = importLimits[row.kind];
  if (
    known.length + fresh.length > limits.files ||
    bytes > limits.totalBytes ||
    fresh.some((file) => file.sizeBytes > limits.fileBytes)
  ) {
    throw tooLarge(limits);
  }
  if (fresh.length === 0) return c.json({ files: [], skipped }, 201);
  const { data, error } = await admin
    .from('import_files')
    .insert(
      fresh.map((file) => ({
        import_id: importId,
        organization_id: c.get('membership').organizationId,
        upload_path: file.uploadPath,
        original_file_name: file.uploadPath.split('/').at(-1)!,
        mime_type: file.mimeType,
        size_bytes: file.sizeBytes,
        sha256: file.sha256,
        declared_pages: file.mimeType === 'application/pdf' ? (file.pages ?? null) : null,
      }))
    )
    .select('id, upload_path, storage_path');
  if (error?.code === 'IMP05') throw tooLarge(limits);
  if (error?.code === 'IMP01') throw notUploading();
  if (error) throw fromDatabaseError(error, 'register import files');
  return c.json(
    {
      files: data.map((file) => ({
        id: file.id,
        uploadPath: file.upload_path,
        bucket: 'imports' as const,
        storagePath: file.storage_path,
      })),
      skipped,
    },
    201
  );
};

// Every file is charged at the start and read by the model, so a file whose bytes the import
// holds already is never registered. A unique index cannot hold it: older imports hold copies.
function withoutCopies<File extends { uploadPath: string; sha256: string }>(
  files: File[],
  known: Pick<ImportFileRow, 'upload_path' | 'sha256'>[]
) {
  const kept = new Map<string, string>();
  for (const file of known) if (!kept.has(file.sha256)) kept.set(file.sha256, file.upload_path);
  const fresh: File[] = [];
  const skipped: SkippedImportFile[] = [];
  for (const file of files) {
    const duplicateOf = kept.get(file.sha256);
    if (duplicateOf === undefined) {
      kept.set(file.sha256, file.uploadPath);
      fresh.push(file);
    } else skipped.push({ uploadPath: file.uploadPath, duplicateOf });
  }
  return { fresh, skipped };
}

const creditsShort = (short: CreditsShort) =>
  new ApiError(
    'conflict',
    `The import needs ${short.needed} credits to start, and ${short.left} are left.`,
    undefined,
    importErrorReasons.creditsInsufficient,
    undefined,
    { credits: short }
  );

async function beginReading(
  c: Context<ApiEnv>,
  admin: AdminClient,
  queue: ImportQueue,
  importId: string,
  organizationId: string,
  kind: ImportKind
) {
  const store = adminImportStore(c, admin);
  const files = await store.listFiles(importId);
  const objects = createAdminFileStore(c);
  const stored = new Map(
    (await objects.listImportFolder(`${organizationId}/${importId}`)).map((object) => [
      object.name,
      object.size,
    ])
  );
  const sizeOf = (file: ImportFileRow) => stored.get(file.storage_path.split('/').at(-1)!);
  // The caps counted the sizes the browser declared, and the bucket's policy checks only the
  // path: an object of another size is dropped with its row, as one that never arrived.
  const misdeclared = files.filter((file) => {
    const size = sizeOf(file);
    return typeof size === 'number' && size !== file.size_bytes;
  });
  const arrived = files.filter((file) => sizeOf(file) !== undefined && !misdeclared.includes(file));
  const missing = files.filter((file) => !arrived.includes(file));
  if (misdeclared.length > 0) {
    console.error(
      `Import ${importId}: ${misdeclared.length} objects differ from their declared size.`
    );
    await objects
      .removeImportObjects(misdeclared.map((file) => file.storage_path))
      .catch((error: unknown) =>
        console.error(`Objects of import ${importId} were left in Storage: ${describe(error)}`)
      );
  }
  if (missing.length > 0) {
    const { error } = await admin
      .from('import_files')
      .delete()
      .in(
        'id',
        missing.map((file) => file.id)
      );
    if (error) throw fromDatabaseError(error, 'drop files that never arrived');
  }
  if (arrived.length === 0) {
    throw new ApiError(
      'unprocessable',
      'No file of the import was uploaded.',
      undefined,
      importErrorReasons.empty
    );
  }
  const charges = importCharges(creditsStore(admin, blocksReporterOf(c)));
  const needed = importStartCredits(kind, startReadOf(arrived));
  const charge = await charges.start(organizationId, importId, needed);
  if (!charge.started) throw creditsShort(charge.short);
  const marked = await admin
    .from('import_files')
    .update({ state: 'uploaded' })
    .in(
      'id',
      arrived.map((file) => file.id)
    );
  if (marked.error) throw fromDatabaseError(marked.error, 'mark files uploaded');
  const started = await store.advance(importId, 'uploading', {
    status: 'preparing',
    started_at: new Date().toISOString(),
  });
  if (!started) throw notUploading();
  try {
    await sendAll(
      queue,
      arrived.map((file): ImportMessage => ({ type: 'prepare', importId, fileId: file.id }))
    );
  } catch (error) {
    console.error(`Import ${importId} could not be queued: ${describe(error)}`);
    await store
      .advance(importId, 'preparing', { status: 'uploading' })
      .catch((undo: unknown) =>
        console.error(`Import ${importId} stays preparing unqueued: ${describe(undo)}`)
      );
    await charges
      .releaseStart(importId)
      .catch((release: unknown) =>
        console.error(`The start of import ${importId} stays charged: ${describe(release)}`)
      );
    throw importUnavailable();
  }
  later(
    c,
    alertBusyOrganization(
      { records: importRecords(adminClient(c.env)), alerts: alertSender(c.env) },
      { importId, organizationId, kind }
    )
  );
}

export const startImport: RouteHandler<typeof startImportRoute, ApiEnv> = async (c) => {
  const queue = requireImportService(c);
  const { importId } = c.req.valid('param');
  const db = createDataClient(c);
  const row = await findImport(db, importId);
  if (row.status !== 'uploading') {
    throw conflict('The reading has started already.', importErrorReasons.notUploading);
  }
  await beginReading(
    c,
    createAdminClient(c),
    queue,
    importId,
    c.get('membership').organizationId,
    row.kind
  );
  return c.json({ import: await summaryOf(db, importId) }, 200);
};

function splitError(error: { code?: string | null }) {
  switch (error.code) {
    case 'IMP01':
      return conflict('This import cannot be split now.', importErrorReasons.ended);
    case 'IMP07':
      return new ApiError(
        'unprocessable',
        'Only files about another company are split off.',
        undefined,
        importErrorReasons.notOtherCompany
      );
    case 'IMP08':
      return conflict('These files were split off already.', importErrorReasons.alreadySplit);
  }
  return decisionError(error, 'split import');
}

export const splitImport: RouteHandler<typeof splitImportRoute, ApiEnv> = async (c) => {
  const queue = requireImportService(c);
  const { importId } = c.req.valid('param');
  const { fileIds } = c.req.valid('json');
  const db = createDataClient(c);
  const { data, error } = await db.rpc('split_import', {
    p_import_id: importId,
    p_file_ids: fileIds,
  });
  if (error) throw splitError(error);
  const split = data as {
    import_id: string;
    files: { source_path: string; target_path: string }[];
  };
  const admin = createAdminClient(c);
  const objects = createAdminFileStore(c);
  const copied: string[] = [];
  try {
    for (const file of split.files) {
      copied.push(file.target_path);
      await objects.copyImportObject(file.source_path, file.target_path, 'imports');
    }
    await beginReading(
      c,
      admin,
      queue,
      split.import_id,
      c.get('membership').organizationId,
      'client'
    );
  } catch (error) {
    // Abandoned instead of deleted when anything is left: its file rows are what the daily clean-up
    // finds the objects by, and an abandoned split no longer holds its files.
    const removed = await objects.removeImportObjects(copied).then(
      () => true,
      () => false
    );
    const deleted =
      removed && !(await admin.from('imports').delete().eq('id', split.import_id)).error;
    if (!deleted) await db.rpc('abandon_import', { p_import_id: split.import_id });
    throw error;
  }
  return c.json({ import: await summaryOf(db, split.import_id) }, 201);
};

// The documents are read together, so a file sent back is read with all of them again; the
// member's changes go, since the items they point at may not come back with the same ids.
export const readImportFile: RouteHandler<typeof readImportFileRoute, ApiEnv> = async (c) => {
  const queue = requireImportService(c);
  const { importId, fileId } = c.req.valid('param');
  const db = createDataClient(c);
  const row = await findImport(db, importId);
  if (row.kind !== 'client') throw wrongKind();
  if (row.status !== 'ready') {
    throw conflict('The import is not ready for review.', importErrorReasons.notReady);
  }
  const files = await listFilesOf(db, importId);
  const file = files.find((each) => each.id === fileId);
  if (!file) throw new ApiError('not_found', 'The import has no such file.');
  if (file.state !== 'set_aside') {
    throw new ApiError(
      'unprocessable',
      'Only a file set aside is sent back to be read.',
      undefined,
      importErrorReasons.notSetAside
    );
  }
  const objects = createAdminFileStore(c);
  const toRead = (
    await Promise.all(
      files
        .filter((each) => each.state === 'read' || each === file)
        .map((each) => loadPrepared({ read: objects.readImportObject }, each))
    )
  ).map(fileToRead);
  const breach = readingCapBreach(toRead, row.kind);
  if (breach?.cap === 'text') {
    throw new ApiError(
      'unprocessable',
      'With this file the documents have more text than one import reads.',
      undefined,
      importErrorReasons.tooMuchText
    );
  }
  if (breach?.cap === 'scans') {
    throw new ApiError(
      'unprocessable',
      'With this file the documents have more scanned pages than one import reads.',
      undefined,
      importErrorReasons.tooManyScans
    );
  }
  const store = adminImportStore(c);
  const moved = await store.advance(
    importId,
    'ready',
    {
      status: 'reading',
      proposal: null,
      changes: null,
      ready_at: null,
      version: row.version + 1,
      read_characters: characterCount(toRead),
    },
    row.version
  );
  if (!moved) throw decisionError({ code: 'IMP02' }, 'read a file set aside');
  const messages: ImportMessage[] = [
    ...(file.is_scan ? [{ type: 'scan' as const, importId, fileId }] : []),
    { type: 'read', importId, waits: 0 },
  ];
  try {
    await store.updateFile(fileId, { state: file.is_scan ? 'prepared' : 'read', reason: null });
    await sendAll(queue, messages);
  } catch (error) {
    console.error(`Import ${importId} could not read ${fileId} again: ${describe(error)}`);
    await store
      .updateFile(fileId, { state: 'set_aside', reason: file.reason })
      .catch((undo: unknown) =>
        console.error(`File ${fileId} stays marked to read: ${describe(undo)}`)
      );
    await store
      .advance(importId, 'reading', {
        status: 'ready',
        proposal: row.proposal,
        changes: row.changes,
        ready_at: row.ready_at,
        version: row.version + 2,
        read_characters: row.read_characters,
      })
      .catch((undo: unknown) =>
        console.error(`Import ${importId} stays reading unqueued: ${describe(undo)}`)
      );
    throw importUnavailable();
  }
  return c.json({ import: await summaryOf(db, importId) }, 200);
};

const noFoundSheets = () =>
  new ApiError(
    'unprocessable',
    'The client has no sheet photographs found in its documentation that an import has not taken.',
    undefined,
    importErrorReasons.noFoundSheets
  );

const foundSheetTypes = sheetFileTypes.filter((type) => !type.startsWith('image/hei'));

type OfferedSheet = Awaited<ReturnType<typeof offeredSheets>>[number];

// A file only owners see is never offered, even to an owner: its copy would be an import file,
// which every member reads, and would become the employee's file for every member to see.
async function offeredSheets(db: DataClient, clientId: string) {
  const [found, taken] = await Promise.all([
    db
      .from('import_files')
      .select(
        'id, upload_path, page_count, imports!inner(id, kind, status, client_id, confirmed_at, files_copied_at), client_file:client_files!import_files_client_file_id_fkey!inner(id, storage_path, original_file_name, mime_type, size_bytes, sha256)'
      )
      .eq('state', 'for_employees')
      .eq('imports.kind', 'client')
      .eq('imports.status', 'confirmed')
      .eq('imports.client_id', clientId)
      .not('imports.files_copied_at', 'is', null)
      .in('client_file.mime_type', foundSheetTypes)
      .eq('client_file.owners_only', false)
      .order('upload_path')
      .order('id'),
    db
      .from('import_files')
      .select('source_file_id, sha256, imports!inner(kind, status, client_id)')
      .not('source_file_id', 'is', null)
      .eq('imports.kind', 'employees')
      .eq('imports.client_id', clientId)
      .not('imports.status', 'in', '(abandoned,failed)'),
  ]);
  if (found.error) throw fromDatabaseError(found.error, 'list found sheets');
  if (taken.error) throw fromDatabaseError(taken.error, 'list taken sheets');
  const takenIds = new Set(taken.data.map((file) => file.source_file_id));
  // Two client imports of one pack hold the same photograph; reading it twice pays twice.
  const seen = new Set(taken.data.map((file) => file.sha256));
  return found.data
    .filter((file) => {
      if (takenIds.has(file.id) || seen.has(file.client_file.sha256)) return false;
      seen.add(file.client_file.sha256);
      return true;
    })
    .map((file) => ({
      id: file.id,
      uploadPath: file.upload_path,
      pageCount: file.page_count,
      importId: file.imports.id,
      confirmedAt: file.imports.confirmed_at!,
      clientFile: file.client_file,
    }));
}

const day = (timestamp: string) => romanianDay(timestamp).split('-').reverse().join('.');

const maxUploadPath = 1024;

function numbered(path: string, copy: number) {
  if (copy === 1) return path;
  const dot = path.lastIndexOf('.');
  return dot > path.lastIndexOf('/')
    ? `${path.slice(0, dot)} (${copy})${path.slice(dot)}`
    : `${path} (${copy})`;
}

// The documentation's own folders are kept under one of the import's, so a person's pages stay
// together and in order, as the upload orders them.
function foundSheetPath(sheet: OfferedSheet, copy: number) {
  const folder = `Din documentația importată pe ${day(sheet.confirmedAt)}`;
  const path = `${folder}/${numbered(sheet.uploadPath, copy)}`;
  return path.length <= maxUploadPath
    ? path
    : `${folder}/${numbered(sheet.clientFile.original_file_name, copy)}`;
}

function foundSheetPaths(sheets: OfferedSheet[], known: Pick<ImportFileRow, 'upload_path'>[]) {
  const used = new Set(known.map((file) => file.upload_path));
  return sheets.map((sheet) => {
    let copy = 1;
    while (used.has(foundSheetPath(sheet, copy))) copy++;
    const path = foundSheetPath(sheet, copy);
    used.add(path);
    return path;
  });
}

// Copies rather than references, so the import holds them as an upload, under its bucket's
// policies, caps and clean-up, and the client's files keep theirs whatever becomes of the import.
async function copyFoundSheets(
  c: Context<ApiEnv>,
  admin: AdminClient,
  importId: string,
  sheets: OfferedSheet[],
  known: Pick<ImportFileRow, 'upload_path'>[]
) {
  const paths = foundSheetPaths(sheets, known);
  const { data, error } = await admin
    .from('import_files')
    .insert(
      sheets.map((sheet, index) => ({
        import_id: importId,
        organization_id: c.get('membership').organizationId,
        upload_path: paths[index]!,
        original_file_name: sheet.clientFile.original_file_name,
        mime_type: sheet.clientFile.mime_type,
        size_bytes: sheet.clientFile.size_bytes,
        sha256: sheet.clientFile.sha256,
        declared_pages:
          sheet.clientFile.mime_type === 'application/pdf' ? (sheet.pageCount ?? null) : null,
        source_file_id: sheet.id,
      }))
    )
    .select('id, storage_path, source_file_id');
  if (error?.code === 'IMP05') throw tooLarge(importLimits.employees);
  if (error?.code === 'IMP01') throw notUploading();
  if (error) throw fromDatabaseError(error, 'add found sheets');
  const objects = createAdminFileStore(c);
  const copied: string[] = [];
  const takeBack = async () => {
    await objects.removeImportObjects(copied).catch(() => undefined);
    await admin
      .from('import_files')
      .delete()
      .in(
        'id',
        data.map((file) => file.id)
      );
  };
  try {
    for (const file of data) {
      const sheet = sheets.find((each) => each.id === file.source_file_id)!;
      copied.push(file.storage_path);
      await objects.copyClientFileToImports(sheet.clientFile.storage_path, file.storage_path);
    }
  } catch (failure) {
    console.error(`Found sheets of import ${importId} were not copied: ${describe(failure)}`);
    await takeBack();
    throw importUnavailable();
  }
  const marked = await admin.rpc('mark_found_sheets_uploaded', {
    p_import_id: importId,
    p_file_ids: data.map((file) => file.id),
  });
  if (marked.error?.code === 'IMP01') {
    await takeBack();
    throw notUploading();
  }
  if (marked.error) throw fromDatabaseError(marked.error, 'mark found sheets uploaded');
}

export const listFoundSheets: RouteHandler<typeof listFoundSheetsRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const offered = await offeredSheets(createDataClient(c), clientId);
  const byImport = new Map<
    string,
    { importId: string; confirmedAt: string; sheets: FoundSheet[] }
  >();
  for (const sheet of offered) {
    const group = byImport.get(sheet.importId) ?? {
      importId: sheet.importId,
      confirmedAt: sheet.confirmedAt,
      sheets: [],
    };
    group.sheets.push({
      id: sheet.id,
      clientFileId: sheet.clientFile.id,
      uploadPath: sheet.uploadPath,
      fileName: sheet.clientFile.original_file_name,
      mimeType: sheet.clientFile.mime_type as FoundSheet['mimeType'],
      sizeBytes: sheet.clientFile.size_bytes,
      pageCount: sheet.pageCount,
    });
    byImport.set(sheet.importId, group);
  }
  const items = [...byImport.values()].sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt));
  return c.json({ items, total: offered.length }, 200);
};

export const addFoundSheets: RouteHandler<typeof addFoundSheetsRoute, ApiEnv> = async (c) => {
  requireImportService(c);
  const { importId } = c.req.valid('param');
  const { fileIds } = c.req.valid('json');
  const db = createDataClient(c);
  const row = await findImport(db, importId);
  if (row.kind !== 'employees' || !row.client_id) throw wrongKind();
  if (row.status !== 'uploading') throw notUploading();
  const offered = await offeredSheets(db, row.client_id);
  const chosen = fileIds ? offered.filter((sheet) => fileIds.includes(sheet.id)) : offered;
  if (chosen.length === 0 || (fileIds && chosen.length !== new Set(fileIds).size)) {
    throw noFoundSheets();
  }
  const admin = createAdminClient(c);
  await copyFoundSheets(
    c,
    admin,
    importId,
    chosen,
    await adminImportStore(c, admin).listFiles(importId)
  );
  return c.json({ import: await summaryOf(db, importId) }, 201);
};
