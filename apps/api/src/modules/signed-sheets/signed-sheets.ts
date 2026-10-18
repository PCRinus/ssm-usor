import {
  lockFieldsOf,
  missingSheetDataLabels,
  rowCapacity,
  sheetFieldNames,
  type SheetRowKey,
  type SheetSignerSlot,
  signatureFieldOf,
  type SignerService,
  tableRowKey,
  tableRowOf,
  type TrainingDomain,
  trainingSheetTypeKeys,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';

import { adminClient } from '../../lib/admin-db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { adminFileStore } from '../../lib/files';
import { createPdfConverter, type PdfConverter } from '../../lib/pdf';
import { createSigner } from '../../lib/signer';
import { builtInTemplates, merge } from '../documents/documents';
import {
  chronological,
  missingSheetDataOf,
  placeOfWork,
  type TrainingSheetData,
  type TrainingSheetFacts,
} from '../trainings/sheet';
import { loadSheetFacts } from '../trainings/sheet-handlers';
import {
  type PrintedRow,
  printedSheets,
  rowKindOf,
  rowValues,
  type SheetTrainingRecord,
  signatureFieldsOf,
  signatureReason,
  signedOn,
  signedSheetData,
  voidedNote,
} from './form';
import {
  type RecordOwner,
  type SheetChanges,
  type SignedSheetStore,
  type StoredRow,
  type StoredSheet,
  supabaseSheetStore,
} from './store';

export { currentSheetPdf, sheetCopyText } from './stored';

// Writes to one sheet are serialized by its version: each makes the next version from the current
// bytes and moves the row on only if nobody else did first, and the loser tries once more. Not a
// Postgres advisory lock: a write spans calls to the signer, and PostgREST holds no transaction
// across requests.

export type SignedSheetFiles = {
  readTemplate(path: string): Promise<Uint8Array>;
  readDocument(path: string): Promise<Uint8Array>;
  writeDocument(path: string, bytes: Uint8Array, options: { replace: boolean }): Promise<void>;
  removeDocument(path: string): Promise<void>;
};

export type SignedSheetContext = {
  store: SignedSheetStore;
  files: SignedSheetFiles;
  pdf: PdfConverter | null;
  signer: SignerService | null;
  sheetFacts(
    clientId: string,
    employeeId: string
  ): Promise<Omit<TrainingSheetFacts, 'domain' | 'records'>>;
  drawForm(domain: TrainingDomain, data: TrainingSheetData): Promise<Uint8Array>;
  now(): Date;
};

/**
 * Everything with the secret key: the signing flow has checked who may act before calling. No
 * request signal: a signature the signer has put on a sheet must reach its evidence even when the
 * caller has gone.
 */
export function signedSheetContext(c: Context<ApiEnv>): SignedSheetContext {
  const db = adminClient(c.env);
  const files = adminFileStore(c.env);
  return {
    store: supabaseSheetStore(db),
    files,
    pdf: createPdfConverter(c),
    signer: createSigner(c),
    sheetFacts: (clientId, employeeId) => loadSheetFacts(db, clientId, employeeId),
    async drawForm(domain, data) {
      const typeKey = trainingSheetTypeKeys[domain];
      const [template] = await builtInTemplates(db, [typeKey]);
      if (!template) {
        console.error(`The template ${typeKey} is not registered: run pnpm templates:register.`);
        throw new ApiError(
          'service_unavailable',
          'The training sheet template is not available yet.',
          undefined,
          'template_missing'
        );
      }
      return merge(await files.readTemplate(template.storagePath), data, typeKey).bytes;
    },
    now: () => new Date(),
  };
}

const signerUnavailable = () =>
  new ApiError(
    'service_unavailable',
    'The signing service could not be reached. Nothing was signed; try again in a moment.',
    undefined,
    'signer_unavailable'
  );

const pdfUnavailable = () =>
  new ApiError(
    'service_unavailable',
    'The PDF could not be made. Nothing was issued; try again in a moment.',
    undefined,
    'pdf_unavailable'
  );

function need<T>(service: T | null, unavailable: () => ApiError): T {
  if (!service) throw unavailable();
  return service;
}

const buffer = (bytes: Uint8Array) => new Uint8Array(bytes).buffer;

async function sha256(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer(bytes)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 of a row's values, the same whatever order they were built in. */
export function rowDigest(values: Record<string, string>) {
  const sorted = Object.keys(values)
    .sort()
    .map((key) => [key, values[key]]);
  return sha256(new TextEncoder().encode(JSON.stringify(sorted)));
}

// A version gets a path of its own, so that a write that loses the race never overwrites the
// bytes the row points to, and every version stays for the evidence's digests.
function storagePathOf(
  sheet: Pick<StoredSheet, 'clientId' | 'employeeId' | 'domain' | 'sequence'>,
  version: number
) {
  const nonce = crypto.randomUUID().slice(0, 8);
  return `signed-sheets/${sheet.clientId}/${sheet.employeeId}/${sheet.domain}-${sheet.sequence}/v${version}-${nonce}.pdf`;
}

const sheetBusy = () =>
  new ApiError(
    'conflict',
    'The training sheet changed while it was being written. Try again.',
    undefined,
    'sheet_busy'
  );

const notOnSheet = () =>
  new ApiError(
    'conflict',
    'The training record has no row on a signed sheet.',
    undefined,
    'record_not_on_sheet'
  );

const rowLocked = () =>
  new ApiError(
    'conflict',
    "A signature on the sheet holds the record's row as it was; void the record's signatures to correct it.",
    undefined,
    'row_locked'
  );

async function forget(ctx: SignedSheetContext, path: string) {
  try {
    await ctx.files.removeDocument(path);
  } catch {
    // An orphaned version costs storage, not correctness: no row points at it.
  }
}

type Rewrite = { bytes: Uint8Array; changes?: Omit<SheetChanges, 'storagePath' | 'digest'> };

const notesToWrite = (sheet: StoredSheet, rows: StoredRow[]) =>
  rows.flatMap((row) => {
    if (!row.voidedAt || row.voidNotedAt || row.printedAsText) return [];
    const note = sheetFieldNames(sheet.domain, row.rowKey).note;
    return note ? [{ row, note }] : [];
  });

/**
 * Makes the sheet's next version from its current bytes. A voided row whose note does not say
 * "anulat" yet gets it first, in the same version, so a void reaches the PDF with the sheet's next
 * write whatever that write is.
 */
async function rewriteSheet(
  ctx: SignedSheetContext,
  sheetId: string,
  rewrite: (sheet: StoredSheet, bytes: Uint8Array) => Promise<Rewrite>
): Promise<{ before: StoredSheet; after: StoredSheet }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const sheet = await ctx.store.sheet(sheetId);
    if (!sheet) throw new ApiError('not_found', 'The signed sheet does not exist.');
    let bytes = await ctx.files.readDocument(sheet.storagePath);
    if ((await sha256(bytes)) !== sheet.digest) {
      console.error(
        `Signed sheet ${sheet.id} does not match its digest at version ${sheet.version}.`
      );
      throw new ApiError('internal_error', 'The stored training sheet could not be verified.');
    }
    const notes = notesToWrite(sheet, await ctx.store.rowsOf(sheet.id));
    if (notes.length > 0) {
      const values = Object.fromEntries(notes.map(({ note }) => [note, voidedNote]));
      bytes = new Uint8Array(
        await need(ctx.signer, signerUnavailable).fillFields(buffer(bytes), values)
      );
    }
    const next = await rewrite(sheet, bytes);
    const path = storagePathOf(sheet, sheet.version + 1);
    await ctx.files.writeDocument(path, next.bytes, { replace: false });
    const after = await ctx.store.advance(sheet, {
      ...next.changes,
      storagePath: path,
      digest: await sha256(next.bytes),
    });
    if (after) {
      await ctx.store.markVoidNoted(
        notes.map(({ row }) => row.id),
        ctx.now().toISOString()
      );
      return { before: sheet, after };
    }
    await forget(ctx, path);
  }
  throw sheetBusy();
}

async function createSheet(
  ctx: SignedSheetContext,
  owner: RecordOwner,
  employeeId: string,
  domain: TrainingDomain,
  sequence: number,
  printed: PrintedRow[]
): Promise<StoredSheet> {
  const facts = await ctx.sheetFacts(owner.clientId, employeeId);
  const missing = missingSheetDataOf({ ...facts, domain, records: [] });
  if (missing.length > 0) {
    throw new ApiError(
      'conflict',
      `The sheet cannot be drawn up without: ${missing.map((code) => missingSheetDataLabels[code]).join(', ')}.`,
      undefined,
      'missing_sheet_data'
    );
  }
  const docx = await ctx.drawForm(domain, signedSheetData(facts, domain, sequence, printed));
  const pdf = await need(ctx.pdf, pdfUnavailable).convertForm(docx);
  const prepared = new Uint8Array(
    await need(ctx.signer, signerUnavailable).prepareSheet(
      buffer(pdf),
      signatureFieldsOf(domain, printed)
    )
  );
  const placement = {
    clientId: owner.clientId,
    organizationId: owner.organizationId,
    employeeId,
    domain,
    sequence,
  };
  const path = storagePathOf(placement, 1);
  await ctx.files.writeDocument(path, prepared, { replace: false });
  const periodic = printed.flatMap((row) => {
    const table = tableRowOf(row.rowKey);
    return table?.table === 'p' ? [table.index] : [];
  });
  const sheet = await ctx.store.createSheet({
    ...placement,
    storagePath: path,
    digest: await sha256(prepared),
    rowCapacity: rowCapacity(domain),
    rowsUsed: Math.max(0, ...periodic),
  });
  if (!sheet) {
    await forget(ctx, path);
    const made = (await ctx.store.sheets(employeeId, domain)).find(
      (each) => each.sequence === sequence
    );
    if (!made) throw sheetBusy();
    return made;
  }
  if (printed.length > 0) {
    await ctx.store.addRows(
      printed.map((row) => ({
        signedSheetId: sheet.id,
        clientId: sheet.clientId,
        rowKey: row.rowKey,
        trainingRecordId: row.record.id,
        printedAsText: true,
      }))
    );
  }
  return sheet;
}

async function ownerOf(ctx: SignedSheetContext, employeeId: string) {
  const owner = await ctx.store.employee(employeeId);
  if (!owner) throw new ApiError('not_found', 'This employee does not exist.');
  return owner;
}

/** The sheet's own hiring row is the newest training of its phase; an older one takes no row. */
function placeable(domain: TrainingDomain, records: SheetTrainingRecord[]) {
  const newestHiring = new Set(
    (['h1', 'h2'] as const).flatMap((kind) => {
      const newest = records
        .filter((record) => rowKindOf(domain, record.training.phase) === kind)
        .sort(chronological)
        .at(-1);
      return newest ? [newest.id] : [];
    })
  );
  return records.filter((record) => {
    const kind = rowKindOf(domain, record.training.phase);
    return (kind !== 'h1' && kind !== 'h2') || newestHiring.has(record.id);
  });
}

/**
 * The employee's current sheet of the domain, the one of the highest sequence while its periodic
 * table has a free row; else a new one. An employee's first sheet prints the records from paper as
 * text in the rows they take first, and every other record of the domain then takes the next rows
 * as filled fields: none can be signed electronically before the sheet exists, so all of them are
 * on the sheet from its first version, those nobody is asked to sign marked signed on paper.
 */
export async function ensureSignedSheet(
  ctx: SignedSheetContext,
  employeeId: string,
  domain: TrainingDomain
): Promise<StoredSheet> {
  const owner = await ownerOf(ctx, employeeId);
  const current = (await ctx.store.sheets(employeeId, domain)).at(-1);
  if (current) {
    if (current.rowsUsed < current.rowCapacity) return current;
    return createSheet(ctx, owner, employeeId, domain, current.sequence + 1, []);
  }
  const records = await ctx.store.records(employeeId, domain);
  const plan = printedSheets(domain, records);
  for (const [index, printed] of plan.entries()) {
    await createSheet(ctx, owner, employeeId, domain, index + 1, printed);
  }
  const printed = new Set(plan.flat().map((row) => row.record.id));
  const rest = placeable(domain, records)
    .filter((record) => !printed.has(record.id))
    .sort(chronological);
  await placeNewRows(
    ctx,
    rest.map((record) => ({ ...record, ...owner }))
  );
  return (await ctx.store.sheets(employeeId, domain)).at(-1)!;
}

export type PlacedRow = StoredRow & { sheet: StoredSheet };

type StoreRecord = SheetTrainingRecord & RecordOwner;

async function freeKey(
  ctx: SignedSheetContext,
  sheet: StoredSheet,
  kind: ReturnType<typeof rowKindOf>
): Promise<SheetRowKey | null> {
  const rows = await ctx.store.rowsOf(sheet.id);
  if (kind === 'h1' || kind === 'h2') {
    return rows.some((row) => row.rowKey === kind) ? null : kind;
  }
  const taken = rows.flatMap((row) => {
    const table = tableRowOf(row.rowKey);
    return table?.table === kind ? [table.index] : [];
  });
  const index = Math.max(kind === 'p' ? sheet.rowsUsed : 0, 0, ...taken) + 1;
  return index > sheet.rowCapacity ? null : tableRowKey(kind, index);
}

async function valuesOf(ctx: SignedSheetContext, record: StoreRecord, rowKey: SheetRowKey) {
  const facts = await ctx.sheetFacts(record.clientId, record.employeeId);
  const place = placeOfWork({ ...facts, domain: record.domain, records: [] });
  const byHand = !(await ctx.store.electronicRequested(record.id));
  return rowValues(record.domain, rowKey, record, place, byHand);
}

/** One version for any number of rows of one sheet; each row's digest once the version stands. */
async function fillRows(
  ctx: SignedSheetContext,
  sheetId: string,
  rows: { row: StoredRow; values: Record<string, string> }[]
) {
  const signer = need(ctx.signer, signerUnavailable);
  const values = Object.assign({}, ...rows.map((each) => each.values)) as Record<string, string>;
  const periodic = rows.flatMap(({ row }) => {
    const table = tableRowOf(row.rowKey);
    return table?.table === 'p' ? [table.index] : [];
  });
  const { after } = await rewriteSheet(ctx, sheetId, async (sheet, bytes) => ({
    bytes: new Uint8Array(await signer.fillFields(buffer(bytes), values)),
    changes: periodic.length > 0 ? { rowsUsed: Math.max(sheet.rowsUsed, ...periodic) } : undefined,
  }));
  for (const { row, values: own } of rows) {
    await ctx.store.setFilledDigest(row.id, await rowDigest(own));
  }
  return after;
}

/**
 * Gives each record the next free row of its kind, `h1` and `h2` for the hiring trainings, the
 * workplace one filling the admission block too, the next `p` or `s` row for the others, on a
 * continuation sheet when the current one is full, and fills the rows of each sheet in one
 * version. A row that could not be filled is taken back.
 */
async function placeNewRows(ctx: SignedSheetContext, records: StoreRecord[]) {
  const placed: { row: StoredRow; record: StoreRecord }[] = [];
  for (const record of records) {
    const { employeeId, domain } = record;
    const kind = rowKindOf(domain, record.training.phase);
    let row: StoredRow | undefined;
    for (let attempt = 0; attempt < 3 && !row; attempt++) {
      let sheet = (await ctx.store.sheets(employeeId, domain)).at(-1)!;
      let rowKey = await freeKey(ctx, sheet, kind);
      if (!rowKey) {
        sheet = await createSheet(ctx, record, employeeId, domain, sheet.sequence + 1, []);
        rowKey = await freeKey(ctx, sheet, kind);
      }
      if (!rowKey) continue;
      [row] =
        (await ctx.store.addRows([
          {
            signedSheetId: sheet.id,
            clientId: sheet.clientId,
            rowKey,
            trainingRecordId: record.id,
          },
        ])) ?? [];
    }
    if (!row) throw sheetBusy();
    placed.push({ row, record });
  }
  const bySheet = new Map<string, typeof placed>();
  for (const each of placed) {
    bySheet.set(each.row.signedSheetId, [...(bySheet.get(each.row.signedSheetId) ?? []), each]);
  }
  const sheets = new Map<string, StoredSheet>();
  try {
    for (const [sheetId, rows] of bySheet) {
      const filled = await Promise.all(
        rows.map(async ({ row, record }) => ({
          row,
          values: await valuesOf(ctx, record, row.rowKey),
        }))
      );
      sheets.set(sheetId, await fillRows(ctx, sheetId, filled));
    }
  } catch (error) {
    for (const { row } of placed) {
      if (!sheets.has(row.signedSheetId)) await ctx.store.removeRow(row.id);
    }
    throw error;
  }
  return placed.map(({ row }) => ({ ...row, sheet: sheets.get(row.signedSheetId)! }));
}

const fitsRow = (kind: ReturnType<typeof rowKindOf>, rowKey: SheetRowKey) =>
  kind === 'h1' || kind === 'h2' ? rowKey === kind : tableRowOf(rowKey)?.table === kind;

/**
 * Fills the row again from the record as it is now, when what it holds differs from that and no
 * live electronic signature holds it. A signature's lock makes the signer refuse a refill: when
 * the row's digest shows that another write filled it with these values meanwhile, that is the
 * row as wanted, else the row is held as signed.
 */
async function refreshRow(ctx: SignedSheetContext, row: StoredRow, record: StoreRecord) {
  if (row.printedAsText) return;
  const values = await valuesOf(ctx, record, row.rowKey);
  const digest = await rowDigest(values);
  if (row.filledDigest === digest) return;
  if (await ctx.store.signedSince(record.id, row.filledAt)) return;
  try {
    await fillRows(ctx, row.signedSheetId, [{ row, values }]);
  } catch (error) {
    if (!(error instanceof ApiError) || error.reason !== 'locked_field') throw error;
    const again = (await ctx.store.rowsOf(row.signedSheetId)).find((each) => each.id === row.id);
    if (again?.filledDigest === digest) return;
    throw rowLocked();
  }
}

/**
 * The record's live row, made to match the record. A row the record outgrew is voided first: one
 * whose electronic signatures were all voided, which the corrected record may not refill under
 * their locks, and one on a sheet or of a kind the record no longer is, after its training's
 * domain or phase changed. Then the record takes a new row if it has none, or its row is filled
 * again while nobody has signed it. With `create`, the employee's first sheet is drawn up when
 * they have none; without, a record of an employee with no sheet is left alone.
 */
export async function syncRecordRow(
  ctx: SignedSheetContext,
  recordId: string,
  { create }: { create: boolean }
): Promise<PlacedRow | null> {
  const record = await ctx.store.record(recordId);
  if (!record) throw new ApiError('not_found', 'This training record does not exist.');
  const { employeeId, domain } = record;
  if ((await ctx.store.sheets(employeeId, domain)).length === 0) {
    if (!create) return null;
    await ensureSignedSheet(ctx, employeeId, domain);
  }
  const kind = rowKindOf(domain, record.training.phase);
  let live = await ctx.store.liveRowOf(recordId);
  if (live) {
    const sheet = (await ctx.store.sheet(live.signedSheetId))!;
    const signatures = await ctx.store.signaturesSince(recordId, live.filledAt);
    const outgrown =
      sheet.domain !== domain ||
      !fitsRow(kind, live.rowKey) ||
      (signatures.voided > 0 && signatures.live === 0);
    if (outgrown) {
      await ctx.store.voidRow(live.id, ctx.now().toISOString());
      live = null;
    }
  }
  if (!live) {
    const [placed] = await placeNewRows(ctx, [record]);
    return placed!;
  }
  await refreshRow(ctx, live, record);
  return { ...live, sheet: (await ctx.store.sheet(live.signedSheetId))! };
}

/**
 * Gives the record its row before a signature, drawing up the employee's first sheet when they
 * have none. A row holding another record's content than the record's own is filled again only
 * while no live signature holds it (`syncRecordRow`).
 */
export const placeRecord = (ctx: SignedSheetContext, recordId: string) =>
  syncRecordRow(ctx, recordId, { create: true }) as Promise<PlacedRow>;

/**
 * Brings the rows of a saved training's records up to date on the stored sheets of their
 * employees, one record at a time; an employee without a stored sheet of the domain is left
 * alone. Best effort: a row a failed write left behind is filled again before its next signature.
 */
export async function syncTrainingRows(ctx: SignedSheetContext, recordIds: string[]) {
  for (const recordId of recordIds) {
    try {
      await syncRecordRow(ctx, recordId, { create: false });
    } catch (error) {
      console.error(
        `Signed sheet row of ${recordId} not brought up to date: ${error instanceof ApiError ? (error.reason ?? error.code) : error instanceof Error ? error.name : 'unknown'}`
      );
    }
  }
}

/**
 * Marks the record's voided rows anulat on their sheets, as a pen strikes a paper row: the note
 * says so, the signatures stay, and the corrected record takes another row when it is placed
 * again. A live row whose electronic signatures were all voided is voided first.
 */
export async function voidRow(ctx: SignedSheetContext, recordId: string): Promise<StoredRow[]> {
  const record = await ctx.store.record(recordId);
  if (!record) throw new ApiError('not_found', 'This training record does not exist.');
  const live = await ctx.store.liveRowOf(recordId);
  if (live) {
    const signatures = await ctx.store.signaturesSince(recordId, live.filledAt);
    if (signatures.voided > 0 && signatures.live === 0) {
      await ctx.store.voidRow(live.id, ctx.now().toISOString());
    }
  }
  const rows = await ctx.store.rowsOfRecord(recordId);
  if (rows.length === 0) throw notOnSheet();
  const pending = rows.filter((row) => row.voidedAt && !row.voidNotedAt && !row.printedAsText);
  for (const sheetId of new Set(pending.map((row) => row.signedSheetId))) {
    await rewriteSheet(ctx, sheetId, async (_, bytes) => ({ bytes }));
  }
  return ctx.store.rowsOfRecord(recordId);
}

export type SheetSigner = {
  certificatePem: string;
  /** The certificates above the signer's, up to the app's authority. */
  chainPem: string[];
  name: string;
  jobTitle: string;
};

/**
 * Signs `slot` of the record on its sheet row, in two phases around `sign`, which makes the raw
 * ECDSA P-256 signature over `toSign` (r||s, as WebCrypto answers) after checking it against the
 * `prepared` PDF. The first signature on a sheet certifies it. `sign` runs again if another write
 * moved the sheet on, under a signing moment taken anew, which the answer carries.
 */
export async function applySignature(
  ctx: SignedSheetContext,
  recordId: string,
  slot: SheetSignerSlot,
  signer: SheetSigner,
  sign: (toSign: ArrayBuffer, prepared: ArrayBuffer) => Promise<ArrayBuffer>
): Promise<{
  digestBefore: string;
  digestAfter: string;
  sheetId: string;
  version: number;
  signedAt: Date;
}> {
  const record = await ctx.store.record(recordId);
  if (!record) throw new ApiError('not_found', 'This training record does not exist.');
  const live = await ctx.store.liveRowOf(recordId);
  if (!live) throw notOnSheet();
  const field = signatureFieldOf(record.domain, live.rowKey, slot);
  if (!field) {
    throw new ApiError(
      'conflict',
      `The ${record.domain} sheet has no signature for the ${slot} of this record.`,
      undefined,
      'slot_not_on_sheet'
    );
  }
  const service = need(ctx.signer, signerUnavailable);
  let signedAt = ctx.now();
  const { before, after } = await rewriteSheet(ctx, live.signedSheetId, async (sheet, bytes) => {
    signedAt = ctx.now();
    const begun = await service.beginSignature(buffer(bytes), {
      field,
      certificatePem: signer.certificatePem,
      chainPem: signer.chainPem,
      reason: signatureReason(record, slot),
      signedAt: signedAt.toISOString(),
      certify: sheet.certifiedAt === null,
      lockFields: lockFieldsOf(record.domain, live.rowKey),
      appearanceLines: [signer.name, signer.jobTitle, 'semnat electronic', signedOn(signedAt)],
    });
    const signature = await sign(begun.toSign, begun.prepared);
    const signed = await service.finishSignature(begun.prepared, begun.sessionToken, signature);
    return {
      bytes: new Uint8Array(signed),
      changes: { certifiedAt: sheet.certifiedAt ?? signedAt.toISOString() },
    };
  });
  return {
    digestBefore: before.digest,
    digestAfter: after.digest,
    sheetId: after.id,
    version: after.version,
    signedAt,
  };
}
