import { extractionRefusalOf, type ExtractorService } from '@ssm-usor/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createExtractor } from './extractor';

const pdf = new TextEncoder().encode('%PDF-1.7').buffer as ArrayBuffer;
const binding = { pdfText: vi.fn() } as unknown as ExtractorService;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createExtractor', () => {
  it('uses the binding only where the deployment says the service is there', () => {
    expect(createExtractor({ PDF_CONVERSION: 'service', EXTRACTOR: binding })).toBe(binding);
    expect(createExtractor({ EXTRACTOR: binding })).toBeNull();
  });

  it('reaches an extractor by URL, passing on its refusals', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json({ pageCount: 1, pages: [{ number: 1, text: '', isScan: true }] })
      )
      .mockResolvedValueOnce(
        Response.json({ error: 'password_protected', detail: '' }, { status: 422 })
      );
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const extractor = createExtractor({ EXTRACTOR_URL: 'http://localhost:3302' })!;

    expect(await extractor.pdfText(pdf)).toEqual({
      pageCount: 1,
      pages: [{ number: 1, text: '', isScan: true }],
    });
    expect(String(fetch.mock.calls[0]![0])).toBe('http://localhost:3302/pdf-text');

    const error = await extractor.pdfPageImage(pdf, 3).catch((caught: unknown) => caught);
    expect(String(fetch.mock.calls[1]![0])).toBe('http://localhost:3302/pdf-page-image?page=3');
    expect(extractionRefusalOf(error)).toBe('password_protected');
  });
});
