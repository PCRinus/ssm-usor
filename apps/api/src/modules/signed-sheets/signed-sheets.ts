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
  signatureFieldsOf,
  signatureReason,
  signedOn,
  signedSheetData,
  voidedNote,
} from './form';
import {
  type SheetChanges,
  type SignedSheetStore,
  type StoredRow,
  type StoredSheet,
  supabaseSheetStore,
} from './store';

export { currentSheetPdf } from './stored';

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

/** Everything with the secret key: the signing flow has checked who may act before calling. */
export function signedSheetContext(c: Context<ApiEnv>): SignedSheetContext {
  const db = adminClient(c.env, c.req.raw.signal);
  const files = adminFileStore(c.env, c.req.raw.signal);
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

async function forget(ctx: SignedSheetContext, path: string) {
  try {
    await ctx.files.removeDocument(path);
  } catch {
    // An orphaned version costs storage, not correctness: no row points at it.
  }
}

type Rewrite = { bytes: Uint8Array; changes?: Omit<SheetChanges, 'storagePath' | 'digest'> };

async function rewriteSheet(
  ctx: SignedSheetContext,
  sheetId: string,
  rewrite: (sheet: StoredSheet, bytes: Uint8Array) => Promise<Rewrite>
): Promise<{ before: StoredSheet; after: StoredSheet }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const sheet = await ctx.store.sheet(sheetId);
    if (!sheet) throw new ApiError('not_found', 'The signed sheet does not exist.');
    const bytes = await ctx.files.readDocument(sheet.storagePath);
    if ((await sha256(bytes)) !== sheet.digest) {
      console.error(
        `Signed sheet ${sheet.id} does not match its digest at version ${sheet.version}.`
      );
      throw new ApiError('internal_error', 'The stored training sheet could not be verified.');
    }
    const next = await rewrite(sheet, bytes);
    const path = storagePathOf(sheet, sheet.version + 1);
    await ctx.files.writeDocument(path, next.bytes, { replace: false });
    const after = await ctx.store.advance(sheet, {
      ...next.changes,
      storagePath: path,
      digest: await sha256(next.bytes),
    });
    if (after) return { before: sheet, after };
    await forget(ctx, path);
  }
  throw sheetBusy();
}

async function createSheet(
  ctx: SignedSheetContext,
  employeeId: string,
  domain: TrainingDomain,
  sequence: number,
  printed: PrintedRow[]
): Promise<StoredSheet> {
  const owner = await ctx.store.employee(employeeId);
  if (!owner) throw new ApiError('not_found', 'This employee does not exist.');
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
  const placement = { ...owner, employeeId, domain, sequence };
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
        rowKey: row.rowKey,
        trainingRecordId: row.record.id,
      }))
    );
  }
  return sheet;
}

/**
 * The employee's current sheet of the domain, the one of the highest sequence while its periodic
 * table has a free row; else a new one. An employee's first sheet prints the records signed on
 * paper as text in the rows they take, and as many continuation sheets as they fill.
 */
export async function ensureSignedSheet(
  ctx: SignedSheetContext,
  employeeId: string,
  domain: TrainingDomain
): Promise<StoredSheet> {
  const current = (await ctx.store.sheets(employeeId, domain)).at(-1);
  if (current) {
    if (current.rowsUsed < current.rowCapacity) return current;
    return createSheet(ctx, employeeId, domain, current.sequence + 1, []);
  }
  const plan = printedSheets(domain, await ctx.store.records(employeeId, domain));
  let sheet: StoredSheet | null = null;
  for (const [index, printed] of plan.entries()) {
    sheet = await createSheet(ctx, employeeId, domain, index + 1, printed);
  }
  return sheet!;
}

export type PlacedRow = StoredRow & { sheet: StoredSheet };

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

async function fillRow(
  ctx: SignedSheetContext,
  row: StoredRow,
  record: Awaited<ReturnType<SignedSheetStore['record']>> & object
) {
  const facts = await ctx.sheetFacts(record.clientId, record.employeeId);
  const place = placeOfWork({ ...facts, domain: record.domain, records: [] });
  const values = rowValues(record.domain, row.rowKey, record, place);
  const signer = need(ctx.signer, signerUnavailable);
  const table = tableRowOf(row.rowKey);
  const { after } = await rewriteSheet(ctx, row.signedSheetId, async (sheet, bytes) => ({
    bytes: new Uint8Array(await signer.fillFields(buffer(bytes), values)),
    changes: table?.table === 'p' ? { rowsUsed: Math.max(sheet.rowsUsed, table.index) } : undefined,
  }));
  return after;
}

/**
 * Gives the record its row and fills it: `h1` and `h2` for the hiring trainings, the workplace
 * one filling the admission block too, the next free `p` or `s` row for the others, on a
 * continuation sheet when the current one is full. A record that has a row keeps it; while
 * nobody has signed it since, its fields are filled again from the record as it is now.
 */
export async function placeRecord(ctx: SignedSheetContext, recordId: string): Promise<PlacedRow> {
  const record = await ctx.store.record(recordId);
  if (!record) throw new ApiError('not_found', 'This training record does not exist.');
  const { employeeId, domain } = record;
  if ((await ctx.store.sheets(employeeId, domain)).length === 0) {
    await ensureSignedSheet(ctx, employeeId, domain);
  }
  const kind = rowKindOf(domain, record.training.phase);
  for (let attempt = 0; attempt < 3; attempt++) {
    const live = await ctx.store.liveRowOf(recordId);
    if (live) {
      // A record from paper printed when its sheet was made has no fields to fill again.
      if (record.source === 'app' && !(await ctx.store.signedSince(recordId, live.filledAt))) {
        return { ...live, sheet: await fillRow(ctx, live, record) };
      }
      return { ...live, sheet: (await ctx.store.sheet(live.signedSheetId))! };
    }
    let sheet = (await ctx.store.sheets(employeeId, domain)).at(-1)!;
    let rowKey = await freeKey(ctx, sheet, kind);
    if (!rowKey) {
      sheet = await createSheet(ctx, employeeId, domain, sheet.sequence + 1, []);
      rowKey = await freeKey(ctx, sheet, kind);
    }
    if (!rowKey) continue;
    const [row] =
      (await ctx.store.addRows([
        { signedSheetId: sheet.id, rowKey, trainingRecordId: recordId },
      ])) ?? [];
    if (!row) continue;
    try {
      return { ...row, sheet: await fillRow(ctx, row, record) };
    } catch (error) {
      await ctx.store.removeRow(row.id);
      throw error;
    }
  }
  throw sheetBusy();
}

/**
 * Marks the record's row anulat, as a pen strikes a paper row: its note says so, its signatures
 * stay, and the corrected record takes another row when it is placed again.
 */
export async function voidRow(ctx: SignedSheetContext, recordId: string): Promise<StoredRow> {
  const record = await ctx.store.record(recordId);
  if (!record) throw new ApiError('not_found', 'This training record does not exist.');
  const live = await ctx.store.liveRowOf(recordId);
  if (!live) throw notOnSheet();
  const note = sheetFieldNames(record.domain, live.rowKey).note;
  // A record from paper may have been printed as text, without fields.
  if (note && record.source === 'app') {
    const signer = need(ctx.signer, signerUnavailable);
    await rewriteSheet(ctx, live.signedSheetId, async (_, bytes) => ({
      bytes: new Uint8Array(await signer.fillFields(buffer(bytes), { [note]: voidedNote })),
    }));
  }
  const at = ctx.now().toISOString();
  await ctx.store.voidRow(live.id, at);
  return { ...live, voidedAt: at };
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
 * ECDSA P-256 signature over the bytes it is given (r||s, as WebCrypto answers). The first
 * signature on a sheet certifies it. `sign` runs again if another write moved the sheet on.
 */
export async function applySignature(
  ctx: SignedSheetContext,
  recordId: string,
  slot: SheetSignerSlot,
  signer: SheetSigner,
  signedAt: Date,
  sign: (toSign: ArrayBuffer) => Promise<ArrayBuffer>
): Promise<{ digestBefore: string; digestAfter: string; sheetId: string; version: number }> {
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
  const { before, after } = await rewriteSheet(ctx, live.signedSheetId, async (sheet, bytes) => {
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
    const signature = await sign(begun.toSign);
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
  };
}
