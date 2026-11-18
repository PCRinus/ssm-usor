import type { SignerService } from '@ssm-usor/contracts';
import { describe, expect, it, vi } from 'vitest';

import { signedOn, signField } from './pdf-signing';

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
