import { importLimits, importStartCredits } from '@ssm-usor/contracts';
import {
  locatingRequest,
  locatingTargets,
  sheetLocations,
  type SheetPageInput,
  sheetPageSchema,
  toEmployeeProposal,
} from '@ssm-usor/import';

import type { ImportMessage } from '../../lib/env';
import { romanianToday } from './employees';
import { alertImport } from './import-alerts';
import {
  ask,
  describe,
  fileReasons,
  ImportFailure,
  importReasons,
  isTransient,
  type PipelineDeps,
  sendAll,
  transition,
} from './pipeline';
import {
  dataUrl,
  decoder,
  encoder,
  folderOf,
  isImage,
  isSheetFile,
  loadPrepared,
  pageImage,
  pageImagePathOf,
  pageLabel,
  pageLocationsPathOf,
  pageReadingPathOf,
  sortedStates,
  startReadOf,
} from './pipeline-files';
import { employeeReadingFlags } from './reading-flags';
import { asJson, type ImportFileRow, type ImportRow, type ImportStatus } from './store';

// An employee import has no sorting: each page says its own kind as it is read (ADR 032). Only
// what is not a photograph or a PDF is set aside, which the upload already refuses.
export async function keepSheets(deps: PipelineDeps, row: ImportRow) {
  const files = (await deps.store.listFiles(row.id)).filter((file) => sortedStates.has(file.state));
  if (files.length === 0) throw new ImportFailure(importReasons.nothingPrepared);
  const sheets: ImportFileRow[] = [];
  let pages = 0;
  for (const file of files) {
    if (!isSheetFile(file)) {
      await deps.store.updateFile(file.id, { state: 'set_aside', reason: fileReasons.notASheet });
      continue;
    }
    sheets.push(file);
    pages += file.page_count ?? 1;
    await deps.store.updateFile(file.id, { state: 'prepared', reason: null, is_scan: true });
  }
  if (sheets.length === 0) throw new ImportFailure(importReasons.noSheets);
  if (pages > importLimits.employees.scannedPages) {
    throw new ImportFailure(importReasons.tooManyScans.employees);
  }
  const charged = importStartCredits('employees', startReadOf(await deps.store.listFiles(row.id)));
  if (!(await deps.store.settleSheetPages(row, pages - charged))) {
    throw new ImportFailure(importReasons.creditsShort);
  }
  await transition(deps, row.id, 'sorting', { status: 'reading' }, [
    ...sheets.map((file): ImportMessage => ({ type: 'scan', importId: row.id, fileId: file.id })),
    { type: 'read', importId: row.id, waits: 0 },
  ]);
}

// An ended import's folder is removed days later; a page located after that would outlive it.
const locatingStatuses = new Set<ImportStatus>(['reading', 'checking', 'ready']);

async function locating(deps: PipelineDeps, importId: string) {
  const row = await deps.store.getImport(importId);
  return row?.kind === 'employees' && locatingStatuses.has(row.status) ? row : null;
}

// The image located is the one read and the one the viewer shows, so the boxes line up with what
// the member sees (ADR 043).
// A page read before the residence and the means of transport were asked for has neither; it is
// still located, as a page that names none.
function withFieldsAddedLater(reading: unknown) {
  if (!reading || typeof reading !== 'object' || !('fields' in reading)) return reading;
  const fields = reading.fields as Record<string, unknown> | null;
  if (!fields || typeof fields !== 'object') return reading;
  return {
    ...reading,
    fields: {
      residenceAddress: null,
      commuteMeans: [],
      commuteMeansOther: null,
      ...fields,
    },
  };
}

export async function locatePage(
  deps: PipelineDeps,
  importId: string,
  fileId: string,
  page: number
) {
  const row = await locating(deps, importId);
  if (!row) return;
  const file = (await deps.store.listFiles(importId)).find((each) => each.id === fileId);
  if (!file) return;
  const names = new Set(await deps.objects.list(folderOf(row)));
  const name = (path: string) => path.slice(path.lastIndexOf('/') + 1);
  const target = pageLocationsPathOf(file, page);
  const readingPath = pageReadingPathOf(file, page);
  if (names.has(name(target)) || !names.has(name(readingPath))) return;
  const reading = sheetPageSchema
    .nullable()
    .safeParse(
      withFieldsAddedLater(JSON.parse(decoder.decode(await deps.objects.read(readingPath))))
    );
  if (!reading.success || reading.data === null) return;
  const targets = locatingTargets(reading.data);
  if (targets.length === 0) return;
  const image = await pageImage(deps, file);
  const picture = isImage(file)
    ? await image(page)
    : { bytes: await deps.objects.read(pageImagePathOf(file, page)), type: 'image/jpeg' };
  let answer;
  try {
    answer = await ask(
      deps,
      row,
      file.id,
      'locating',
      locatingRequest(dataUrl(picture.bytes, picture.type), targets)
    );
  } catch (error) {
    if (isTransient(error)) throw error;
    console.error(
      `Page ${page} of file ${file.id} of import ${row.id} was not located: ${describe(error)}`
    );
    return;
  }
  if (!(await locating(deps, importId))) return;
  const locations = sheetLocations(answer, targets);
  await deps.objects.create(
    target,
    encoder.encode(JSON.stringify({ locations })),
    'application/json'
  );
}

const pathOrder = new Intl.Collator('ro', { numeric: true });

// A page without a name is placed after the one before it, so the order is the one a phone or a
// scanner numbers its files in: `Scan 2` before `Scan 10`. The rows record no upload position.
export async function sheetPagesOf(
  deps: Pick<PipelineDeps, 'objects'>,
  files: ImportFileRow[]
): Promise<SheetPageInput[]> {
  const ordered = [...files].sort(
    (a, b) => pathOrder.compare(a.upload_path, b.upload_path) || a.id.localeCompare(b.id)
  );
  const pages: SheetPageInput[] = [];
  for (const entry of await Promise.all(ordered.map((file) => loadPrepared(deps.objects, file)))) {
    const sheets = entry.pages?.sheets ?? {};
    for (const page of entry.pages?.pages ?? []) {
      pages.push({
        id: `page-${pages.length + 1}`,
        fileId: entry.file.id,
        page: isImage(entry.file) ? null : page.number,
        label: pageLabel(entry.file, page.number),
        reading: sheets[String(page.number)] ?? null,
      });
    }
  }
  return pages;
}

export async function checkSheets(deps: PipelineDeps, row: ImportRow) {
  if (!row.client_id) throw new ImportFailure(importReasons.failed);
  const files = (await deps.store.listFiles(row.id)).filter((file) => file.state === 'read');
  const today = romanianToday();
  const [pages, client] = await Promise.all([
    sheetPagesOf(deps, files),
    deps.store.employeeImportClient(row.client_id),
  ]);
  const proposal = toEmployeeProposal({ pages, client, today });
  const ready = await deps.store.advance(row.id, 'checking', {
    status: 'ready',
    proposal: asJson(proposal),
    reading_flags: asJson(employeeReadingFlags(await deps.store.listFiles(row.id), proposal)),
    ready_at: new Date().toISOString(),
  });
  if (!ready) return;
  await sendLocates(deps, row, pages);
  await alertImport(deps, row.id, null, ['read']);
}

// Sent only once the review has opened, so that locating never takes the queue's slots from the
// steps the review waits for (ADR 043). A page left unlocated opens without its spotlight, so a
// failed send fails nothing.
async function sendLocates(deps: PipelineDeps, row: ImportRow, pages: SheetPageInput[]) {
  const messages = pages.flatMap((page): ImportMessage[] =>
    page.reading === null
      ? []
      : [{ type: 'locate', importId: row.id, fileId: page.fileId, page: page.page ?? 1 }]
  );
  if (messages.length === 0 || !deps.queue) return;
  try {
    await sendAll(deps.queue, messages);
  } catch (error) {
    console.error(`The pages of import ${row.id} were not sent to be located: ${describe(error)}`);
  }
}
