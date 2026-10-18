import { rowCapacity, type SignerService, type TrainingDomain } from '@ssm-usor/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../lib/errors';
import type { PdfConverter } from '../../lib/pdf';
import type { TrainingSheetData } from '../trainings/sheet';
import type { SheetTrainingRecord } from './form';
import { sheetFacts, sheetRecord } from './form.fixture';
import {
  applySignature,
  currentSheetPdf,
  ensureSignedSheet,
  placeRecord,
  type SignedSheetContext,
  syncRecordRow,
  syncTrainingRows,
  voidRow,
} from './signed-sheets';
import type { RecordOwner, SignedSheetStore, StoredRow, StoredSheet } from './store';

const owner: RecordOwner = {
  clientId: 'c1c1c1c1-0000-4000-8000-000000000001',
  organizationId: '11111111-0000-4000-8000-000000000001',
};
const employeeId = 'e1e1e1e1-0000-4000-8000-000000000001';

const encode = (text: string) => new TextEncoder().encode(text);
const decode = (bytes: ArrayBuffer | Uint8Array) => new TextDecoder().decode(bytes);
const buffer = (text: string) => encode(text).buffer as ArrayBuffer;

class MemoryStore implements SignedSheetStore {
  recordList: (SheetTrainingRecord & RecordOwner)[] = [];
  sheetRows: StoredSheet[] = [];
  rows: StoredRow[] = [];
  /** Electronic signatures, `createdAt` on the same clock as a row's `filledAt`. */
  signatures: { recordId: string; createdAt: string; voided: boolean }[] = [];
  requested = new Set<string>();
  private clock = 0;
  /** How many writes to refuse, as if another write had moved the sheet on first. */
  raceAdvances = 0;
  private ids = 0;

  private id() {
    this.ids += 1;
    return `00000000-0000-4000-8000-${String(this.ids).padStart(12, '0')}`;
  }

  /** The database's clock, a second further on each call. */
  tick() {
    this.clock += 1;
    return new Date(Date.UTC(2026, 9, 18, 9, 0, this.clock)).toISOString();
  }

  sign(recordId: string, voided = false) {
    this.signatures.push({ recordId, createdAt: this.tick(), voided });
  }

  async employee(id: string) {
    return id === employeeId ? owner : null;
  }
  async record(id: string) {
    return this.recordList.find((record) => record.id === id) ?? null;
  }
  async records(employee: string, domain: TrainingDomain) {
    return this.recordList.filter((r) => r.employeeId === employee && r.domain === domain);
  }
  async sheets(employee: string, domain: TrainingDomain, clientId?: string) {
    return this.sheetRows
      .filter(
        (sheet) =>
          sheet.employeeId === employee &&
          sheet.domain === domain &&
          (!clientId || sheet.clientId === clientId)
      )
      .sort((a, b) => a.sequence - b.sequence);
  }
  async sheet(id: string) {
    return this.sheetRows.find((sheet) => sheet.id === id) ?? null;
  }
  async rowsOf(sheetId: string) {
    return this.rows.filter((row) => row.signedSheetId === sheetId);
  }
  async liveRowOf(recordId: string) {
    return this.rows.find((row) => row.trainingRecordId === recordId && !row.voidedAt) ?? null;
  }
  async rowsOfRecord(recordId: string) {
    return this.rows.filter((row) => row.trainingRecordId === recordId);
  }
  async createSheet(sheet: Parameters<SignedSheetStore['createSheet']>[0]) {
    if (
      this.sheetRows.some(
        (each) =>
          each.employeeId === sheet.employeeId &&
          each.domain === sheet.domain &&
          each.sequence === sheet.sequence
      )
    ) {
      return null;
    }
    const created: StoredSheet = {
      ...sheet,
      id: this.id(),
      version: 1,
      certifiedAt: null,
      createdAt: '2026-10-18T09:00:00.000Z',
    };
    this.sheetRows.push(created);
    return created;
  }
  async addRows(rows: Parameters<SignedSheetStore['addRows']>[0]) {
    for (const row of rows) {
      const taken = this.rows.some(
        (each) =>
          (each.signedSheetId === row.signedSheetId && each.rowKey === row.rowKey) ||
          (each.trainingRecordId === row.trainingRecordId && !each.voidedAt)
      );
      if (taken) return null;
    }
    const added: StoredRow[] = rows.map((row) => ({
      signedSheetId: row.signedSheetId,
      rowKey: row.rowKey,
      trainingRecordId: row.trainingRecordId,
      id: this.id(),
      filledAt: this.tick(),
      voidedAt: null,
      filledDigest: null,
      printedAsText: row.printedAsText ?? false,
      voidNotedAt: null,
    }));
    this.rows.push(...added);
    return added;
  }
  async removeRow(id: string) {
    this.rows = this.rows.filter((row) => row.id !== id);
  }
  async advance(sheet: StoredSheet, changes: Parameters<SignedSheetStore['advance']>[1]) {
    const index = this.sheetRows.findIndex((each) => each.id === sheet.id);
    if (this.raceAdvances > 0) {
      this.raceAdvances -= 1;
      return null;
    }
    if (this.sheetRows[index]!.version !== sheet.version) return null;
    const next = { ...this.sheetRows[index]!, ...changes, version: sheet.version + 1 };
    this.sheetRows[index] = next;
    return next;
  }
  async voidRow(id: string, at: string) {
    const row = this.rows.find((each) => each.id === id)!;
    row.voidedAt = at;
  }
  async setFilledDigest(id: string, digest: string) {
    this.rows.find((each) => each.id === id)!.filledDigest = digest;
  }
  async markVoidNoted(ids: string[], at: string) {
    for (const row of this.rows) if (ids.includes(row.id)) row.voidNotedAt ??= at;
  }
  async signaturesSince(recordId: string, since: string) {
    const made = this.signatures.filter(
      (each) => each.recordId === recordId && each.createdAt >= since
    );
    const voided = made.filter((each) => each.voided).length;
    return { live: made.length - voided, voided };
  }
  async signedSince(recordId: string, since: string) {
    return (await this.signaturesSince(recordId, since)).live > 0;
  }
  async electronicRequested(recordId: string) {
    return this.requested.has(recordId);
  }
}

// The PDF is a log of what was done to it, which the fakes append to.
const signer = {
  prepareSheet: vi.fn(async (pdf: ArrayBuffer, fields: string[]) =>
    buffer(`${decode(pdf)}|prepared ${fields.length}`)
  ),
  fillFields: vi.fn(async (pdf: ArrayBuffer, values: Record<string, string>) =>
    buffer(`${decode(pdf)}|fill ${JSON.stringify(values)}`)
  ),
  beginSignature: vi.fn(async (pdf: ArrayBuffer, options: { field: string; signedAt: string }) => ({
    prepared: buffer(`${decode(pdf)}|begin ${options.field}`),
    toSign: buffer(`attributes of ${options.field}`),
    sessionToken: 'session',
  })),
  finishSignature: vi.fn(async (prepared: ArrayBuffer, _token: string, signature: ArrayBuffer) =>
    buffer(`${decode(prepared)}|signed ${decode(signature)}`)
  ),
  validate: vi.fn(),
  stampPages: vi.fn(async (pdf: ArrayBuffer, text: string) =>
    buffer(`${decode(pdf)}|stamp ${text}`)
  ),
} satisfies SignerService;

const pdf: PdfConverter = {
  convertDocx: vi.fn(),
  convertDocuments: vi.fn(),
  convertForm: vi.fn(async () => encode('%PDF form')),
  mergePdfs: vi.fn(async (files: Uint8Array[]) => encode(files.map(decode).join(' + '))),
};

let memory: MemoryStore;
let files: Map<string, Uint8Array>;
let drawn: TrainingSheetData[];
let ctx: SignedSheetContext;

beforeEach(() => {
  vi.clearAllMocks();
  memory = new MemoryStore();
  files = new Map();
  drawn = [];
  ctx = {
    store: memory,
    files: {
      readTemplate: vi.fn(),
      readDocument: async (path) => files.get(path)!,
      async writeDocument(path, bytes, options) {
        if (files.has(path) && !options.replace) throw new Error('exists');
        files.set(path, bytes);
      },
      removeDocument: async (path) => {
        files.delete(path);
      },
    },
    pdf,
    signer,
    sheetFacts: async () => sheetFacts,
    drawForm: async (_domain, data) => {
      drawn.push(data);
      return encode('docx');
    },
    now: () => new Date('2026-10-18T10:00:00Z'),
  };
});

const add = (record: SheetTrainingRecord) => {
  memory.recordList.push({ ...record, ...owner });
  return record;
};

const stored = async (sheet: StoredSheet) => decode(files.get(sheet.storagePath)!);

describe('ensureSignedSheet', () => {
  it('stores a new sheet with the paper rows printed, and fills every other record into the next rows', async () => {
    const paper = add(sheetRecord('periodic', '2025-04-01', { source: 'paper' }));
    const recorded = add(sheetRecord('periodic', '2026-04-01'));

    const sheet = await ensureSignedSheet(ctx, employeeId, 'ssm');

    expect(sheet).toMatchObject({
      ...owner,
      employeeId,
      domain: 'ssm',
      sequence: 1,
      version: 2,
      rowCapacity: rowCapacity('ssm'),
      rowsUsed: 2,
    });
    expect(sheet.storagePath).toMatch(
      new RegExp(`^signed-sheets/${owner.clientId}/${employeeId}/ssm-1/v2-[0-9a-f]{8}\\.pdf$`)
    );
    expect(drawn[0]!.form.rows).toMatchObject({ p1: false, p2: true });
    expect(drawn[0]!.periodic.map((row) => row.heldOn)).toEqual(['01.04.2025']);
    const [, fields] = signer.prepareSheet.mock.calls[0]!;
    expect(fields).toContain('p2_sig_trainee');
    expect(fields).not.toContain('p1_sig_trainee');
    expect(await stored(sheet)).toMatch(
      new RegExp(`^%PDF form\\|prepared ${fields.length}\\|fill `)
    );
    expect(memory.rows).toMatchObject([
      { rowKey: 'p1', trainingRecordId: paper.id, printedAsText: true, filledDigest: null },
      { rowKey: 'p2', trainingRecordId: recorded.id, printedAsText: false },
    ]);
    expect(memory.rows[1]!.filledDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(signer.fillFields.mock.calls[0]![1]).toMatchObject({
      p2_date: '01.04.2026',
      p2_note: 'semnat pe hârtie',
    });
  });

  it('leaves the note empty for a record somebody is asked to sign electronically', async () => {
    const record = add(sheetRecord('periodic', '2026-04-01'));
    memory.requested.add(record.id);

    await ensureSignedSheet(ctx, employeeId, 'ssm');

    expect(signer.fillFields.mock.calls[0]![1]).toMatchObject({ p1_note: '' });
  });

  it('gives the hiring blocks to the newest training of each phase only', async () => {
    const older = add(sheetRecord('introductory_general', '2025-01-05'));
    const newer = add(sheetRecord('introductory_general', '2026-01-05'));

    await ensureSignedSheet(ctx, employeeId, 'ssm');

    expect(memory.rows.map((row) => [row.rowKey, row.trainingRecordId])).toEqual([
      ['h1', newer.id],
    ]);
    expect(await ctx.store.liveRowOf(older.id)).toBeNull();
  });

  it('answers the current sheet while it has room, and a continuation once it is full', async () => {
    const first = await ensureSignedSheet(ctx, employeeId, 'psi');
    expect(await ensureSignedSheet(ctx, employeeId, 'psi')).toEqual(first);

    memory.sheetRows[0]!.rowsUsed = rowCapacity('psi');
    const next = await ensureSignedSheet(ctx, employeeId, 'psi');
    expect(next.sequence).toBe(2);
    expect(drawn[1]!.form.continuation).toBe('Fișa nr. 2, în continuarea fișei nr. 1');
  });

  it('refuses while the sheet lacks what it prints', async () => {
    ctx.sheetFacts = async () => ({
      ...sheetFacts,
      employee: { ...sheetFacts.employee, commuteRoute: null },
    });
    await expect(ensureSignedSheet(ctx, employeeId, 'ssm')).rejects.toMatchObject({
      code: 'conflict',
      reason: 'missing_sheet_data',
    });
    expect(memory.sheetRows).toEqual([]);
  });

  it('answers the sheet another request made first, and drops its own file', async () => {
    const theirs = await ensureSignedSheet(ctx, employeeId, 'ssm');
    vi.spyOn(memory, 'sheets').mockResolvedValueOnce([]);
    expect(await ensureSignedSheet(ctx, employeeId, 'ssm')).toEqual(theirs);
    expect([...files.keys()]).toEqual([theirs.storagePath]);
  });
});

describe('placeRecord', () => {
  it('fills the next periodic row and moves the sheet to its next version', async () => {
    await ensureSignedSheet(ctx, employeeId, 'ssm');
    const record = add(
      sheetRecord('periodic', '2026-04-03', { training: { durationMinutes: 90 } })
    );
    memory.requested.add(record.id);

    const placed = await placeRecord(ctx, record.id);

    expect(placed.rowKey).toBe('p1');
    expect(placed.sheet).toMatchObject({ version: 2, rowsUsed: 1 });
    const [, values] = signer.fillFields.mock.calls[0]!;
    expect(values).toMatchObject({ p1_date: '03.04.2026', p1_duration: '1,5', p1_note: '' });
    expect(await stored(placed.sheet)).toContain('|fill {"p1_date":"03.04.2026"');
  });

  it('keeps a placed record on its row, filling it again only when it changed and nobody has signed it', async () => {
    const record = add(sheetRecord('periodic', '2026-04-03'));
    const placed = await placeRecord(ctx, record.id);
    const again = await placeRecord(ctx, record.id);
    expect(again.id).toBe(placed.id);
    expect(again.sheet.version).toBe(placed.sheet.version);

    memory.recordList[0]!.occupation = 'Lăcătuș';
    const refilled = await placeRecord(ctx, record.id);
    expect(refilled.sheet.version).toBe(placed.sheet.version + 1);
    expect(signer.fillFields.mock.calls.at(-1)![1]).toMatchObject({ p1_occupation: 'Lăcătuș' });

    memory.sign(record.id);
    memory.recordList[0]!.occupation = 'Sudor';
    const signed = await placeRecord(ctx, record.id);
    expect(signed.sheet.version).toBe(refilled.sheet.version);
    expect(signer.fillFields).toHaveBeenCalledTimes(2);
  });

  it("takes a signature's lock refusing a refill as the row filled, when another write filled it so", async () => {
    const record = add(sheetRecord('periodic', '2026-04-03'));
    const placed = await placeRecord(ctx, record.id);
    memory.recordList[0]!.occupation = 'Lăcătuș';
    const wanted = (await syncRecordRow(ctx, record.id, { create: false }))!.filledDigest;
    memory.rows[0]!.filledDigest = 'stale';
    signer.fillFields.mockImplementationOnce(async () => {
      memory.rows[0]!.filledDigest = wanted;
      throw new ApiError('conflict', undefined, undefined, 'locked_field');
    });

    await expect(placeRecord(ctx, record.id)).resolves.toMatchObject({ id: placed.id });

    memory.rows[0]!.filledDigest = 'stale';
    signer.fillFields.mockRejectedValueOnce(
      new ApiError('conflict', undefined, undefined, 'locked_field')
    );
    await expect(placeRecord(ctx, record.id)).rejects.toMatchObject({ reason: 'row_locked' });
  });

  it('puts the hiring trainings on their blocks, the admission with the workplace one', async () => {
    const workplace = add(
      sheetRecord('workplace', '2026-01-06', {
        admission: { admittedOn: '2026-01-06', name: 'Ion POP', jobTitle: 'Șef atelier' },
      })
    );
    const placed = await placeRecord(ctx, workplace.id);
    expect(placed.rowKey).toBe('h2');
    expect(signer.fillFields.mock.calls[0]![1]).toMatchObject({
      h2_place: 'Punct de lucru Str. Fabricii 3 – Atelier',
      adm_name: 'Ion POP',
    });
  });

  it("puts a supplementary training in the occupational safety sheet's own table", async () => {
    const supplementary = add(
      sheetRecord('supplementary', '2026-05-18', {
        training: { supplementaryReason: 'after_accident' },
      })
    );
    expect((await placeRecord(ctx, supplementary.id)).rowKey).toBe('s1');
    const fire = add(
      sheetRecord('supplementary', '2026-05-18', {
        domain: 'psi',
        training: { supplementaryReason: 'after_accident', verifier: null },
      })
    );
    expect((await placeRecord(ctx, fire.id)).rowKey).toBe('p1');
  });

  it('starts a continuation sheet when the table is full', async () => {
    await ensureSignedSheet(ctx, employeeId, 'ssm');
    memory.sheetRows[0]!.rowsUsed = rowCapacity('ssm') - 1;
    const last = add(sheetRecord('periodic', '2026-04-03'));
    const next = add(sheetRecord('periodic', '2026-10-03'));
    expect((await placeRecord(ctx, last.id)).rowKey).toBe(`p${rowCapacity('ssm')}`);
    const placed = await placeRecord(ctx, next.id);
    expect(placed).toMatchObject({ rowKey: 'p1', sheet: { sequence: 2 } });
  });

  it('moves a record whose electronic signatures were all voided to a new row, and notes the old one anulat', async () => {
    const first = add(sheetRecord('introductory_general', '2026-01-05'));
    const original = await placeRecord(ctx, first.id);
    memory.sign(first.id, true);

    const placed = await placeRecord(ctx, first.id);

    expect(placed).toMatchObject({ rowKey: 'h1', sheet: { sequence: 2 } });
    const old = memory.rows.find((row) => row.id === original.id)!;
    expect(old.voidedAt).not.toBeNull();
    expect(old.voidNotedAt).toBeNull();

    await voidRow(ctx, first.id);

    expect(signer.fillFields.mock.calls.at(-1)![1]).toEqual({ h1_note: 'anulat' });
    expect(old.voidNotedAt).not.toBeNull();
    expect((await ctx.store.liveRowOf(first.id))?.id).toBe(placed.id);
  });

  it('moves a record to a row of its kind after its training changed phase', async () => {
    const record = add(sheetRecord('periodic', '2026-04-03'));
    const original = await placeRecord(ctx, record.id);
    memory.recordList[0]!.training = {
      ...memory.recordList[0]!.training,
      phase: 'supplementary',
      supplementaryReason: 'after_accident',
    };

    const placed = await placeRecord(ctx, record.id);

    expect(placed.rowKey).toBe('s1');
    expect(memory.rows.find((row) => row.id === original.id)!.voidedAt).not.toBeNull();
  });

  it('notes a record from paper placed after its sheet was made as signed on paper', async () => {
    await ensureSignedSheet(ctx, employeeId, 'ssm');
    const late = add(sheetRecord('periodic', '2024-04-03', { source: 'paper' }));
    await placeRecord(ctx, late.id);
    expect(signer.fillFields.mock.calls[0]![1]).toMatchObject({ p1_note: 'semnat pe hârtie' });
  });

  it('frees the row again when the fill fails', async () => {
    await ensureSignedSheet(ctx, employeeId, 'ssm');
    const record = add(sheetRecord('periodic', '2026-04-03'));
    signer.fillFields.mockRejectedValueOnce(new ApiError('service_unavailable'));
    await expect(placeRecord(ctx, record.id)).rejects.toBeInstanceOf(ApiError);
    expect(memory.rows).toEqual([]);
  });
});

describe('syncTrainingRows', () => {
  it('fills the rows of records whose employee has a sheet, leaves the others, and swallows a failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await ensureSignedSheet(ctx, employeeId, 'ssm');
    const onSheet = add(sheetRecord('periodic', '2026-04-03'));
    const fire = add(sheetRecord('periodic', '2026-04-03', { domain: 'psi' }));

    await syncTrainingRows(ctx, [onSheet.id, fire.id, 'missing']);

    expect((await ctx.store.liveRowOf(onSheet.id))?.rowKey).toBe('p1');
    expect(await ctx.store.liveRowOf(fire.id)).toBeNull();
    expect(memory.sheetRows.filter((sheet) => sheet.domain === 'psi')).toEqual([]);
  });
});

describe('voidRow', () => {
  it('voids the live row of a record whose signatures were voided, writes anulat in its note and keeps the bytes before it', async () => {
    const record = add(sheetRecord('periodic', '2026-04-03'));
    const placed = await placeRecord(ctx, record.id);
    memory.sign(record.id, true);

    const [voided] = await voidRow(ctx, record.id);

    expect(voided).toMatchObject({ voidedAt: '2026-10-18T10:00:00.000Z' });
    expect(voided!.voidNotedAt).not.toBeNull();
    expect(signer.fillFields.mock.calls.at(-1)![1]).toEqual({ p1_note: 'anulat' });
    expect(await ctx.store.liveRowOf(record.id)).toBeNull();
    expect(files.get(placed.sheet.storagePath)).toBeDefined();
  });

  it('notes a row the database voided, and leaves a row nobody voided', async () => {
    const record = add(sheetRecord('periodic', '2026-04-03'));
    await placeRecord(ctx, record.id);
    const calls = signer.fillFields.mock.calls.length;

    await voidRow(ctx, record.id);
    expect(signer.fillFields).toHaveBeenCalledTimes(calls);

    memory.rows[0]!.voidedAt = '2026-10-18T09:59:00.000Z';
    await voidRow(ctx, record.id);
    expect(signer.fillFields.mock.calls.at(-1)![1]).toEqual({ p1_note: 'anulat' });
  });

  it('refuses a record that has no row', async () => {
    const record = add(sheetRecord('periodic', '2026-04-03'));
    await expect(voidRow(ctx, record.id)).rejects.toMatchObject({
      reason: 'record_not_on_sheet',
    });
  });
});

describe('applySignature', () => {
  const trainee = {
    certificatePem: '-----BEGIN CERTIFICATE-----',
    chainPem: ['-----BEGIN CERTIFICATE----- CA'],
    name: 'Ana Ștefănescu',
    jobTitle: 'Sudor',
  };
  const sign = vi.fn<(toSign: ArrayBuffer, prepared: ArrayBuffer) => Promise<ArrayBuffer>>(
    async (toSign) => buffer(`r||s over ${decode(toSign)}`)
  );

  it('signs the slot on the row in two phases, certifying the sheet with the first signature', async () => {
    const record = add(sheetRecord('periodic', '2026-04-03'));
    const placed = await placeRecord(ctx, record.id);

    const result = await applySignature(ctx, record.id, 'trainee', trainee, sign);

    const [, options] = signer.beginSignature.mock.calls[0]!;
    expect(options).toMatchObject({
      field: 'p1_sig_trainee',
      certify: true,
      lockFields: ['p1_date', 'p1_duration', 'p1_occupation', 'p1_material'],
      appearanceLines: ['Ana Ștefănescu', 'Sudor', 'semnat electronic', '18.10.2026'],
      signedAt: '2026-10-18T10:00:00.000Z',
      reason: 'Instruirea din 03.04.2026: semnătura celui instruit',
    });
    expect(decode(sign.mock.calls[0]![0])).toBe('attributes of p1_sig_trainee');
    expect(decode(sign.mock.calls[0]![1])).toMatch(/\|begin p1_sig_trainee$/);
    expect(result.digestBefore).toBe(placed.sheet.digest);
    expect(result.signedAt.toISOString()).toBe('2026-10-18T10:00:00.000Z');
    const sheet = (await ctx.store.sheet(result.sheetId))!;
    expect(result).toMatchObject({ digestAfter: sheet.digest, version: sheet.version });
    expect(sheet.certifiedAt).toBe('2026-10-18T10:00:00.000Z');
    expect(await stored(sheet)).toMatch(/\|begin p1_sig_trainee\|signed r\|\|s over attributes/);

    await applySignature(ctx, record.id, 'trainer', trainee, sign);
    expect(signer.beginSignature.mock.calls[1]![1]).toMatchObject({
      field: 'p1_sig_trainer',
      certify: false,
    });
  });

  it("signs the workplace record's admission on the admission block", async () => {
    const record = add(
      sheetRecord('workplace', '2026-01-06', {
        admission: { admittedOn: '2026-01-06', name: 'Ion POP', jobTitle: 'Șef atelier' },
      })
    );
    await placeRecord(ctx, record.id);
    await applySignature(ctx, record.id, 'admitter', trainee, sign);
    expect(signer.beginSignature.mock.calls[0]![1]).toMatchObject({
      field: 'adm_sig',
      lockFields: expect.arrayContaining(['h2_material', 'adm_name']),
    });
  });

  it('signs again on the newer bytes, at a moment taken anew, when another write moved the sheet on first', async () => {
    const record = add(sheetRecord('periodic', '2026-04-03'));
    await placeRecord(ctx, record.id);
    const files_before = files.size;
    memory.raceAdvances = 1;
    let minute = 0;
    ctx.now = () => new Date(Date.UTC(2026, 9, 18, 10, minute++));

    const result = await applySignature(ctx, record.id, 'trainee', trainee, sign);

    expect(sign).toHaveBeenCalledTimes(2);
    const moments = signer.beginSignature.mock.calls.map(([, options]) => options.signedAt);
    expect(moments[1]).not.toBe(moments[0]);
    expect(result.signedAt.toISOString()).toBe(moments[1]);
    expect(files.size).toBe(files_before + 1);
  });

  it('gives up after a second lost race, leaving the sheet as it was', async () => {
    const record = add(sheetRecord('periodic', '2026-04-03'));
    const placed = await placeRecord(ctx, record.id);
    memory.raceAdvances = 2;
    await expect(applySignature(ctx, record.id, 'trainee', trainee, sign)).rejects.toMatchObject({
      reason: 'sheet_busy',
    });
    expect((await ctx.store.sheet(placed.sheet.id))!.version).toBe(placed.sheet.version);
  });

  it('refuses a slot the form has no signature for, and a record without a row', async () => {
    const fire = add(sheetRecord('periodic', '2026-04-03', { domain: 'psi' }));
    await placeRecord(ctx, fire.id);
    await expect(applySignature(ctx, fire.id, 'verifier', trainee, sign)).rejects.toMatchObject({
      reason: 'slot_not_on_sheet',
    });
    const unplaced = add(sheetRecord('periodic', '2026-05-03', { domain: 'psi' }));
    await expect(applySignature(ctx, unplaced.id, 'trainee', trainee, sign)).rejects.toMatchObject({
      reason: 'record_not_on_sheet',
    });
    expect(sign).not.toHaveBeenCalled();
  });

  it('refuses bytes that do not match the digest of their version', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const record = add(sheetRecord('periodic', '2026-04-03'));
    const placed = await placeRecord(ctx, record.id);
    files.set(placed.sheet.storagePath, encode('tampered'));
    await expect(applySignature(ctx, record.id, 'trainee', trainee, sign)).rejects.toMatchObject({
      code: 'internal_error',
    });
  });
});

describe('currentSheetPdf', () => {
  it('answers nothing before signing, the stored sheet, then the sheets merged into a stamped copy', async () => {
    expect(await currentSheetPdf(ctx, employeeId, 'ssm')).toBeNull();
    await ensureSignedSheet(ctx, employeeId, 'ssm');
    const single = (await currentSheetPdf(ctx, employeeId, 'ssm'))!;
    expect(single).toMatchObject({ copy: false, sequence: 1 });
    expect(decode(single.pdf)).toMatch(/^%PDF form/);

    memory.sheetRows[0]!.rowsUsed = rowCapacity('ssm');
    await ensureSignedSheet(ctx, employeeId, 'ssm');
    const merged = (await currentSheetPdf(ctx, employeeId, 'ssm'))!;
    expect(merged).toMatchObject({ copy: true, sequence: null });
    expect(decode(merged.pdf).split(' + ')).toHaveLength(2);
    expect(decode(merged.pdf)).toMatch(
      /\|stamp Copie de citire – semnăturile se verifică pe fișele originale$/
    );

    const second = (await currentSheetPdf(ctx, employeeId, 'ssm', { sequence: 2 }))!;
    expect(second).toMatchObject({ copy: false, sequence: 2 });
    await expect(currentSheetPdf(ctx, employeeId, 'ssm', { sequence: 3 })).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(await currentSheetPdf(ctx, employeeId, 'ssm', { clientId: 'another' })).toBeNull();
  });
});
