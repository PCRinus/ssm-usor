import type { RouteHandler } from '@hono/zod-openapi';
import { type ImportSourceResponse, importSourceResponseSchema } from '@ssm-usor/contracts';
import { placeQuote } from '@ssm-usor/import';

import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { createAdminFileStore, createFileStore } from '../../lib/files';
import { listFilesOf, notFound } from './import-queries';
import { isImage, pageLocationsPathOf, type PreparedPages, textPathOf } from './pipeline-files';
import type { getImportSourceRoute } from './routes';

// The source needs only the import's kind and to know it is the caller's; the detail's columns
// carry the whole proposal.
async function importKindOf(db: DataClient, importId: string) {
  const { data, error } = await db.from('imports').select('kind').eq('id', importId).maybeSingle();
  if (error) throw fromDatabaseError(error, 'find import');
  if (!data) throw notFound();
  return data.kind;
}

// The member's own store may read only the objects a file's row names, so this read takes the
// secret key's, for a page of a file the member's row query has just returned. A page not
// located, or whose object cannot be read, is shown without its spotlight.
async function storedLocations(
  objects: ReturnType<typeof createAdminFileStore>,
  path: string
): Promise<ImportSourceResponse['locations']> {
  try {
    const stored = JSON.parse(new TextDecoder().decode(await objects.readImportObject(path))) as {
      locations?: unknown;
    };
    const locations = importSourceResponseSchema.shape.locations.safeParse(stored.locations);
    return locations.success ? locations.data : null;
  } catch {
    return null;
  }
}

export const getImportSource: RouteHandler<typeof getImportSourceRoute, ApiEnv> = async (c) => {
  const { importId } = c.req.valid('param');
  const { file: named, quote, near } = c.req.valid('query');
  const db = createDataClient(c);
  const [kind, files] = await Promise.all([importKindOf(db, importId), listFilesOf(db, importId)]);
  const paged = /^(.*) \(pagina (\d+)\)$/.exec(named);
  const exact = files.find((file) => file.upload_path === named);
  const file = exact ?? (paged ? files.find((each) => each.upload_path === paged[1]) : undefined);
  if (!file) throw new ApiError('not_found', 'The import has no file by this name.');
  const page = exact || !paged ? null : Number(paged[2]);
  const store = createFileStore(c);
  const expiresInSeconds = 300;
  const derivedType =
    file.mime_type === 'application/msword'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'image/jpeg';

  // A scan page is shown as its image, which no text marks.
  const readable = file.text_path && !file.mime_type.startsWith('image/') && page === null;
  const sheetPage = kind === 'employees' ? (page ?? (isImage(file) ? 1 : null)) : null;
  const [content, originalUrl, derivedUrl, locations] = await Promise.all([
    readable
      ? store
          .readImportObject(file.text_path ?? textPathOf(file))
          .then((bytes) => new TextDecoder().decode(bytes))
      : null,
    store.importObjectLink(file.storage_path, expiresInSeconds),
    file.derived_path ? store.importObjectLink(file.derived_path, expiresInSeconds) : null,
    sheetPage === null
      ? null
      : storedLocations(createAdminFileStore(c), pageLocationsPathOf(file, sheetPage)),
  ]);

  let text: string | null = null;
  let pages: { number: number; text: string }[] | null = null;
  let match: ImportSourceResponse['match'] = null;
  if (content !== null && file.mime_type === 'application/pdf') {
    const prepared = JSON.parse(content) as PreparedPages;
    pages = prepared.pages
      .filter((each) => !each.isScan)
      .map((each) => ({ number: each.number, text: each.text }));
    const found = quote
      ? placeQuote(
          pages.map((each) => each.text),
          quote,
          near
        )
      : null;
    if (found) {
      const { start, end, parts } = found;
      match = { page: pages[found.textIndex]!.number, start, end, parts };
    }
  } else if (content !== null) {
    text = content;
    const found = quote ? placeQuote([content], quote, near) : null;
    if (found) match = { page: null, start: found.start, end: found.end, parts: found.parts };
  }
  return c.json(
    {
      fileId: file.id,
      uploadPath: file.upload_path,
      fileName: file.original_file_name,
      page,
      original: { url: originalUrl, mimeType: file.mime_type },
      derived: derivedUrl ? { url: derivedUrl, mimeType: derivedType } : null,
      text,
      pages,
      match,
      locations,
      expiresInSeconds,
    },
    200
  );
};
