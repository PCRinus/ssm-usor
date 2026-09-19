import { pdfConversionFailed } from '@ssm-usor/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { convertDocx } from './convert';

const docx = new TextEncoder().encode('PK word/document.xml').buffer as ArrayBuffer;
const pdf = new TextEncoder().encode('%PDF-1.7 …');

afterEach(() => vi.restoreAllMocks());

describe('convertDocx', () => {
  it('posts the file to the LibreOffice route and asks for PDF/A', async () => {
    const fetcher = vi.fn<(request: Request) => Promise<Response>>(async () => new Response(pdf));
    const result = await convertDocx(fetcher, docx);
    expect(new Uint8Array(result)).toEqual(pdf);

    const request = fetcher.mock.calls[0]![0];
    expect(request.method).toBe('POST');
    expect(new URL(request.url).pathname).toBe('/forms/libreoffice/convert');
    const form = await request.formData();
    expect(form.get('pdfa')).toBe('PDF/A-2b');
    const file = form.get('files') as File;
    expect(file.name).toBe('document.docx');
    expect(file.size).toBe(docx.byteLength);
  });

  it('fails the same way when Gotenberg refuses, is unreachable, or answers something else', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = [
      async () => new Response('LibreOffice failed to convert', { status: 400 }),
      async () => Promise.reject(new Error('container did not start')),
      async () => new Response('<html>not a pdf</html>'),
    ];
    for (const fetcher of failing) {
      await expect(convertDocx(fetcher, docx, 0)).rejects.toThrow(pdfConversionFailed);
    }
    // The unreachable one was tried twice.
    expect(log).toHaveBeenCalledTimes(4);
    expect(String(log.mock.calls[0]![0])).toContain('LibreOffice failed to convert');
  });

  it('tries once more when the container fails to start, not when the file is refused', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const waking = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(new Response('Failed to start container', { status: 500 }))
      .mockResolvedValueOnce(new Response(pdf));
    expect(new Uint8Array(await convertDocx(waking, docx, 0))).toEqual(pdf);
    expect(waking).toHaveBeenCalledTimes(2);

    const refusing = vi.fn(async () => new Response('bad file', { status: 400 }));
    await expect(convertDocx(refusing, docx, 0)).rejects.toThrow(pdfConversionFailed);
    expect(refusing).toHaveBeenCalledTimes(1);
  });
});
