import type { SignerService } from '@ssm-usor/contracts';
import { describe, expect, it, vi } from 'vitest';

import { sha256 } from './docx';
import { ApiError } from './errors';
import { rewriteVersioned, signedOn, signField } from './pdf-signing';

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (buffer: ArrayBuffer | Uint8Array) => new TextDecoder().decode(buffer);

describe('signedOn', () => {
  it("prints the day in Romania's time zone", () => {
    expect(signedOn(new Date('2026-10-17T22:30:00Z'))).toBe('18.10.2026');
  });
});

describe('a signature field signed', () => {
  it('begins with the standard appearance, signs what the signer prepared and finishes the same session', async () => {
    const signer = {
      beginSignature: vi.fn(async () => ({
        prepared: bytes('prepared').buffer,
        toSign: bytes('to sign').buffer,
        sessionToken: 'token',
      })),
      finishSignature: vi.fn(async () => bytes('signed').buffer),
    } as unknown as SignerService;
    const sign = vi.fn(async () => bytes('signature').buffer);

    const signed = await signField(
      signer,
      bytes('form'),
      {
        field: 'sig_trainee',
        certificatePem: 'CERT',
        chainPem: ['CA'],
        reason: 'Fișa de test: persoana testată',
        signedAt: new Date('2026-10-17T22:30:00Z'),
        certify: true,
        lockFields: [],
        name: 'Ion POP',
      },
      sign
    );

    const [pdf, options] = vi.mocked(signer.beginSignature).mock.calls[0]!;
    expect(text(pdf)).toBe('form');
    expect(options).toEqual({
      field: 'sig_trainee',
      certificatePem: 'CERT',
      chainPem: ['CA'],
      reason: 'Fișa de test: persoana testată',
      signedAt: '2026-10-17T22:30:00.000Z',
      certify: true,
      lockFields: [],
      appearanceLines: ['Ion POP', 'semnat electronic', '18.10.2026'],
    });
    const [toSign, prepared] = sign.mock.calls[0]! as unknown as [ArrayBuffer, ArrayBuffer];
    expect([text(toSign), text(prepared)]).toEqual(['to sign', 'prepared']);
    const [finishPrepared, token, signature] = vi.mocked(signer.finishSignature).mock.calls[0]!;
    expect([text(finishPrepared), token, text(signature)]).toEqual([
      'prepared',
      'token',
      'signature',
    ]);
    expect(text(signed)).toBe('signed');
  });
});

describe('a signed file rewritten by version', () => {
  type Row = { version: number; digest: string; path: string };

  async function setup(rows: Row[]) {
    const stored = new Map<string, Uint8Array>([['v1.pdf', bytes('one')]]);
    const files = {
      readDocument: vi.fn(async (path: string) => stored.get(path)!),
      writeDocument: vi.fn(async (path: string, written: Uint8Array) => {
        stored.set(path, written);
      }),
      removeDocument: vi.fn(async (path: string) => {
        stored.delete(path);
      }),
    };
    const advanced = [...rows];
    const steps = {
      read: vi.fn(async () => ({ version: 1, digest: await sha256(bytes('one')), path: 'v1.pdf' })),
      pathOf: (row: Row) => row.path,
      nextPathOf: (row: Row) => `v${row.version + 1}-${files.writeDocument.mock.calls.length}.pdf`,
      unverified: () => new ApiError('internal_error', 'unverified'),
      rewrite: vi.fn(async (_row: Row, current: Uint8Array) => ({
        bytes: bytes(`${text(current)}+two`),
      })),
      advance: vi.fn<
        (row: Row, next: unknown, change: { path: string; digest: string }) => Promise<Row | null>
      >(async () => advanced.shift() ?? null),
      busy: () => new ApiError('conflict', 'busy'),
    };
    return { files, steps, stored };
  }

  it('writes the next version beside the current one and moves the row on with its digest', async () => {
    const after = { version: 2, digest: 'next', path: 'v2-0.pdf' };
    const { files, steps, stored } = await setup([after]);

    const result = await rewriteVersioned(files, steps);

    expect(result.after).toBe(after);
    expect(text(stored.get('v2-0.pdf')!)).toBe('one+two');
    expect(steps.advance.mock.calls[0]![2]).toEqual({
      path: 'v2-0.pdf',
      digest: await sha256(bytes('one+two')),
    });
    expect(files.removeDocument).not.toHaveBeenCalled();
  });

  it('removes a version that lost the race, tries once more, and is busy after a second loss', async () => {
    const { files, steps } = await setup([]);

    await expect(rewriteVersioned(files, steps)).rejects.toThrow('busy');

    expect(steps.read).toHaveBeenCalledTimes(2);
    expect(files.removeDocument.mock.calls.map(([path]) => path)).toEqual(['v2-0.pdf', 'v2-1.pdf']);
  });

  it('writes nothing over bytes that do not match their digest', async () => {
    const { files, steps } = await setup([]);
    steps.read.mockResolvedValue({ version: 1, digest: 'other', path: 'v1.pdf' });

    await expect(rewriteVersioned(files, steps)).rejects.toThrow('unverified');

    expect(files.writeDocument).not.toHaveBeenCalled();
  });
});
