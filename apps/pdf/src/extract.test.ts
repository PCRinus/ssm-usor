import {
  extractionFailed,
  extractionRefusalOf,
  extractorFileLimit,
  extractorOverHttp,
} from '@ssm-usor/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Fetcher } from './convert';
import { postToExtractor } from './extract';

const bytes = (...values: number[]) => new Uint8Array(values).buffer as ArrayBuffer;
const docx = bytes(0x50, 0x4b, 0x03, 0x04, 0x14);
const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00);
const doc = bytes(0xd0, 0xcf, 0x11, 0xe0);
const pdf = new TextEncoder().encode('%PDF-1.7 two pages').buffer as ArrayBuffer;
const pdfText = {
  pageCount: 2,
  pages: [
    { number: 1, text: 'Decizia nr. 1 privind organizarea activității de SSM', isScan: false },
    { number: 2, text: '', isScan: true },
  ],
};

const refusal = (error: string, status = 422) =>
  new Response(JSON.stringify({ error, detail: '' }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function extractor(fetcher: Fetcher, timeoutMs?: number) {
  return extractorOverHttp(postToExtractor(fetcher, 0, timeoutMs));
}

afterEach(() => vi.restoreAllMocks());

describe('the extractor forwarding', () => {
  it('posts the file as the body of each route and returns what the container answers', async () => {
    const fetcher = vi.fn<Fetcher>(async (request) => {
      switch (new URL(request.url).pathname) {
        case '/doc-to-docx':
          return new Response(docx);
        case '/pdf-text':
          return Response.json(pdfText);
        default:
          return new Response(jpeg);
      }
    });
    const service = extractor(fetcher);

    expect(new Uint8Array(await service.docToDocx(doc))).toEqual(new Uint8Array(docx));
    expect(await service.pdfText(pdf)).toEqual(pdfText);
    expect(new Uint8Array(await service.pdfPageImage(pdf, 2))).toEqual(new Uint8Array(jpeg));
    expect(new Uint8Array(await service.heicToJpeg(jpeg))).toEqual(new Uint8Array(jpeg));

    const requests = fetcher.mock.calls.map(([request]) => new URL(request.url));
    expect(requests.map((url) => `${url.pathname}${url.search}`)).toEqual([
      '/doc-to-docx',
      '/pdf-text',
      '/pdf-page-image?page=2',
      '/heic-to-jpeg',
    ]);
    const first = fetcher.mock.calls[0]![0];
    expect(first.method).toBe('POST');
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(new Uint8Array(doc));
  });

  it('rejects with the reason the container refused the file for, without trying again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const [reason, status] of [
      ['password_protected', 422],
      ['corrupt', 422],
      ['unsupported', 415],
      ['too_large', 413],
      ['timeout', 422],
      ['page_out_of_range', 400],
    ] as const) {
      const fetcher = vi.fn<Fetcher>(async () => refusal(reason, status));
      const error = await extractor(fetcher)
        .pdfText(pdf)
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(`${extractionFailed}:${reason}`);
      expect(extractionRefusalOf(error)).toBe(reason);
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it('tries once more when the container fails to start, and then gives up', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const waking = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(new Response('Failed to start container', { status: 500 }))
      .mockResolvedValueOnce(new Response(docx));
    await extractor(waking).docToDocx(doc);
    expect(waking).toHaveBeenCalledTimes(2);

    const down = vi.fn<Fetcher>(async () => Promise.reject(new Error('container did not start')));
    const error = await extractor(down)
      .docToDocx(doc)
      .catch((caught: unknown) => caught);
    expect((error as Error).message).toBe(extractionFailed);
    expect(extractionRefusalOf(error)).toBeNull();
    expect(down).toHaveBeenCalledTimes(2);
  });

  it('fails without a refusal for a 4xx that is not the service, an answer of the wrong kind, or a timeout', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing: [Fetcher, number?][] = [
      [async () => new Response('<html>Bad gateway</html>', { status: 404 })],
      [async () => refusal('something_new')],
      [async () => new Response('<html>not a docx</html>')],
      [() => new Promise<Response>(() => {}), 5],
    ];
    for (const [fetcher, timeoutMs] of failing) {
      const error = await extractor(fetcher, timeoutMs)
        .docToDocx(doc)
        .catch((caught: unknown) => caught);
      expect((error as Error).message).toBe(extractionFailed);
    }
  });

  it('checks the text answer against its shape', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const wrong = [
      { pageCount: 2, pages: [pdfText.pages[0]] },
      { pageCount: 1, pages: [{ number: 1, text: 'x' }] },
      'not json',
    ];
    for (const body of wrong) {
      const fetcher = async () =>
        new Response(typeof body === 'string' ? body : JSON.stringify(body));
      await expect(extractor(fetcher).pdfText(pdf)).rejects.toThrow(extractionFailed);
    }
  });

  it('refuses a file over the limit and a page below 1 without asking the container', async () => {
    const fetcher = vi.fn<Fetcher>();
    const service = extractor(fetcher);
    const large = new ArrayBuffer(extractorFileLimit + 1);
    await expect(service.heicToJpeg(large)).rejects.toThrow(`${extractionFailed}:too_large`);
    await expect(service.pdfPageImage(pdf, 0)).rejects.toThrow(
      `${extractionFailed}:page_out_of_range`
    );
    await expect(service.pdfPageImage(pdf, 1.5)).rejects.toThrow(
      `${extractionFailed}:page_out_of_range`
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
