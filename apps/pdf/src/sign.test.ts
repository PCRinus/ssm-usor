import { signerFailed, signerOverHttp, signerRefusalCode } from '@ssm-usor/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Fetcher } from './convert';
import { postToSigner } from './sign';

const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
const text = (buffer: ArrayBuffer) => new TextDecoder().decode(buffer);
const base64 = (value: string) => btoa(value);

const pdf = bytes('%PDF-1.7 sheet');
const answer = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function signer(fetcher: Fetcher, timeoutMs?: number) {
  return signerOverHttp(postToSigner(fetcher, 0, timeoutMs));
}

afterEach(() => vi.restoreAllMocks());

describe('the signer forwarding', () => {
  it('posts each method to its route as JSON with the bytes in base64', async () => {
    const fetcher = vi.fn<Fetcher>(async (request) => {
      const route = new URL(request.url).pathname;
      if (route === '/sign/begin') {
        return answer({
          prepared: base64('%PDF prepared'),
          toSign: base64('attributes'),
          sessionToken: 'token',
        });
      }
      if (route === '/validate') return answer({ signatures: [{ field: 'row1_trainee' }] });
      if (route === '/stamp') return answer({ pdf: base64('%PDF stamped') });
      return answer({ pdf: base64(`%PDF from ${route}`) });
    });
    const service = signer(fetcher);

    expect(text(await service.prepareSheet(pdf, ['row1_trainee']))).toBe(
      '%PDF from /prepare-sheet'
    );
    expect(text(await service.fillFields(pdf, { row1_date: '18.10.2026' }))).toBe(
      '%PDF from /fill'
    );
    const begun = await service.beginSignature(pdf, {
      field: 'row1_trainee',
      certificatePem: 'CERT',
      chainPem: ['CA'],
      reason: 'Instruire',
      signedAt: '2026-10-18T09:30:00+03:00',
      certify: true,
      lockFields: ['row1_date'],
      appearanceLines: ['Ana Ștefănescu'],
    });
    expect(text(begun.prepared)).toBe('%PDF prepared');
    expect(text(begun.toSign)).toBe('attributes');
    expect(begun.sessionToken).toBe('token');
    const signed = await service.finishSignature(begun.prepared, 'token', bytes('r||s'));
    expect(text(signed)).toBe('%PDF from /sign/finish');
    expect(await service.validate(signed, ['ROOT'])).toEqual([{ field: 'row1_trainee' }]);
    expect(text(await service.stampPages(signed, 'Copie'))).toBe('%PDF stamped');

    const bodies = await Promise.all(
      fetcher.mock.calls.map(async ([request]) => ({
        route: new URL(request.url).pathname,
        method: request.method,
        type: request.headers.get('content-type'),
        body: (await request.json()) as Record<string, unknown>,
      }))
    );
    expect(bodies.map(({ route }) => route)).toEqual([
      '/prepare-sheet',
      '/fill',
      '/sign/begin',
      '/sign/finish',
      '/validate',
      '/stamp',
    ]);
    expect(
      bodies.every(({ method, type }) => method === 'POST' && type === 'application/json')
    ).toBe(true);
    expect(bodies[0]!.body).toEqual({
      pdf: base64('%PDF-1.7 sheet'),
      signatureFields: ['row1_trainee'],
    });
    expect(bodies[1]!.body).toEqual({
      pdf: base64('%PDF-1.7 sheet'),
      values: { row1_date: '18.10.2026' },
    });
    expect(bodies[2]!.body).toMatchObject({
      pdf: base64('%PDF-1.7 sheet'),
      field: 'row1_trainee',
      certify: true,
      lockFields: ['row1_date'],
      appearanceLines: ['Ana Ștefănescu'],
    });
    expect(bodies[3]!.body).toEqual({
      prepared: base64('%PDF prepared'),
      sessionToken: 'token',
      signature: base64('r||s'),
    });
    expect(bodies[4]!.body).toEqual({
      pdf: base64('%PDF from /sign/finish'),
      trustRootsPem: ['ROOT'],
    });
    expect(bodies[5]!.body).toEqual({ pdf: base64('%PDF from /sign/finish'), text: 'Copie' });
  });

  it('carries every byte value, in a file longer than one slice', async () => {
    const large = new Uint8Array(100_000).map((_, index) => index % 256);
    const fetcher = vi.fn<Fetcher>(async (request) => {
      const { pdf: sent } = (await request.json()) as { pdf: string };
      return answer({ pdf: sent });
    });
    const echoed = await signer(fetcher).fillFields(large.buffer, {});
    expect(new Uint8Array(echoed)).toEqual(large);
  });

  it('rejects with signer_failed when the service is unreachable or answers something else', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing: Fetcher[] = [
      async () => Promise.reject(new Error('container did not start')),
      async () => new Response('<html>not json</html>'),
      async () => answer({ unexpected: true }),
      async () => new Response('<html>bad gateway</html>', { status: 404 }),
    ];
    for (const fetcher of failing) {
      const rejection = signer(fetcher).fillFields(pdf, {});
      await expect(rejection).rejects.toThrow(new Error(signerFailed));
    }
    // The unreachable one was tried twice.
    expect(log).toHaveBeenCalledTimes(4);
  });

  it("carries the service's code when it refuses the request", async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const locked = async () =>
      answer({ error: 'locked_field', detail: 'p1_date, p1_material' }, 409);
    const error = await signer(locked)
      .fillFields(pdf, { p1_date: '18.10.2026' })
      .catch((reason: unknown) => reason);
    expect(error).toEqual(new Error('signer_failed:locked_field'));
    expect(signerRefusalCode(error)).toBe('locked_field');
    expect(String(log.mock.calls[0]![0])).toContain('p1_date, p1_material');

    const malformed = async () => answer({ error: 'malformed_request', detail: 'pdf' }, 422);
    await expect(signer(malformed).fillFields(pdf, {})).rejects.toThrow(
      new Error('signer_failed:malformed_request')
    );
  });

  it('carries the code of a refusal that answers the second try', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const waking = vi
      .fn<Fetcher>()
      .mockRejectedValueOnce(new Error('container did not start'))
      .mockResolvedValueOnce(answer({ error: 'unknown_session' }, 404));
    await expect(signer(waking).finishSignature(pdf, 'gone', pdf)).rejects.toThrow(
      new Error('signer_failed:unknown_session')
    );
    const failing = vi.fn<Fetcher>(async () => new Response('down', { status: 503 }));
    await expect(signer(failing).validate(pdf)).rejects.toThrow(new Error(signerFailed));
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('tries once more when the container fails to start, not when the request is refused', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const waking = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(new Response('Failed to start container', { status: 500 }))
      .mockResolvedValueOnce(answer({ pdf: base64('%PDF filled') }));
    expect(text(await signer(waking).fillFields(pdf, {}))).toBe('%PDF filled');
    expect(waking).toHaveBeenCalledTimes(2);

    const refusing = vi.fn<Fetcher>(async () => answer({ error: 'unknown_session' }, 404));
    await expect(signer(refusing).finishSignature(pdf, 'gone', pdf)).rejects.toThrow(
      'signer_failed:unknown_session'
    );
    expect(refusing).toHaveBeenCalledTimes(1);
  });

  it('gives up on a request that takes too long, without trying again', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const hanging = vi.fn<Fetcher>(() => new Promise(() => {}));
    await expect(signer(hanging, 10).validate(pdf)).rejects.toThrow(new Error(signerFailed));
    expect(hanging).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]![0])).toContain('signer_timeout');
  });
});
