import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import { contentDisposition } from '../../lib/content-disposition';
import type { ApiEnv } from '../../lib/env';

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  CORS_ORIGINS: 'https://app.ssmusor.ro',
};

const signed =
  'https://example.supabase.co/storage/v1/object/sign/documents/org/client/doc.pdf?token=t&download=x';
const fetchMock = vi.fn<typeof fetch>();

const download = (
  source: string,
  name = 'Contract de prestări servicii - rev. 1.pdf',
  extra: Record<string, string> = {}
) =>
  createApp().request(
    `/files/download?${new URLSearchParams({ source, name, ...extra }).toString()}`,
    {},
    env
  );

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('saving a file from a signed Storage link', () => {
  it('passes the bytes through as an attachment under their real name', async () => {
    fetchMock.mockResolvedValue(
      new Response('%PDF-1.7', { headers: { 'Content-Type': 'application/pdf' } })
    );
    const response = await download(signed);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('%PDF-1.7');
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toBe(
      `attachment; filename="Contract de prestari servicii - rev. 1.pdf"; filename*=UTF-8''Contract%20de%20prest%C4%83ri%20servicii%20-%20rev.%201.pdf`
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(signed);
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toBeNull();
  });

  it('shows a PDF in the browser when asked, under the same name', async () => {
    fetchMock.mockResolvedValue(
      new Response('%PDF-1.7', { headers: { 'Content-Type': 'application/pdf' } })
    );
    const response = await download(signed, 'Contract nr. 12.pdf', { disposition: 'inline' });
    expect(response.headers.get('Content-Disposition')).toBe(
      `inline; filename="Contract nr. 12.pdf"; filename*=UTF-8''Contract%20nr.%2012.pdf`
    );
  });

  it('never shows anything but a PDF in the browser', async () => {
    fetchMock.mockResolvedValue(
      new Response('<script>alert(1)</script>', { headers: { 'Content-Type': 'text/html' } })
    );
    const response = await download(signed, 'x.html', { disposition: 'inline' });
    expect(response.headers.get('Content-Disposition')).toMatch(/^attachment;/);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it.each([
    'https://attacker.example/storage/v1/object/sign/documents/x.pdf?token=t',
    'https://example.supabase.co/rest/v1/clients?select=*',
    'https://example.supabase.co/storage/v1/object/public/documents/x.pdf',
  ])('reads nothing but a signed file of our own Storage: %s', async (source) => {
    const response = await download(source);
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says the link expired when Storage refuses it', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'InvalidJWT' }, { status: 400 }));
    const response = await download(signed);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: 'not_found' });
  });

  it('refuses a missing name', async () => {
    expect((await download(signed, ' ')).status).toBe(400);
  });
});

describe('attachment', () => {
  it('gives an ASCII name and the real one, encoded as RFC 8187 asks', () => {
    expect(
      contentDisposition('attachment', `Copertă – Deciziile „interne” (O'Neil) "x".docx`)
    ).toBe(
      `attachment; filename="Coperta _ Deciziile _interne_ (O'Neil) _x_.docx"; ` +
        `filename*=UTF-8''Copert%C4%83%20%E2%80%93%20Deciziile%20%E2%80%9Einterne%E2%80%9D%20%28O%27Neil%29%20%22x%22.docx`
    );
  });
});
