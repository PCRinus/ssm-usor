import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiHttpError, createApiHttp } from './http';

const onFailure = vi.fn();
const { apiFetch, apiUpload } = createApiHttp({ onFailure });

const fetchMock = vi.fn<typeof fetch>();
const baseUrl = 'https://api.example.test';

beforeEach(() => {
  onFailure.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('fetching from the API', () => {
  it('reads the current token on every request and returns the decoded body', async () => {
    let token = 'first-token';
    const options = { baseUrl, getAccessToken: () => token };
    const body = { user: { id: 'test-user', email: 'test@example.test' } };
    fetchMock.mockImplementation(async () => Response.json(body));
    expect(await apiFetch('/me', options)).toEqual(body);
    token = 'refreshed-token';
    await apiFetch('/me', options);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${baseUrl}/me`);
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer first-token'
    );
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer refreshed-token'
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: 'omit', redirect: 'error' });
  });

  it('sends no Authorization header without a session, even one the caller set', async () => {
    fetchMock.mockResolvedValue(Response.json({}));
    await apiFetch('/me', {
      baseUrl,
      headers: { Authorization: 'Bearer stale' },
      getAccessToken: () => null,
    });
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).has('Authorization')).toBe(false);
  });

  it.each([401, 503])('throws a typed error for HTTP %s', async (status) => {
    const body = { error: 'test_error', message: 'Test error' };
    fetchMock.mockResolvedValue(Response.json(body, { status }));
    await expect(apiFetch('/me', { baseUrl })).rejects.toMatchObject({
      status,
      body,
      name: 'ApiHttpError',
    });
  });

  it('returns a PDF as a blob', async () => {
    const pdf = '%PDF-1.7 printed';
    fetchMock.mockResolvedValue(
      new Response(pdf, { headers: { 'Content-Type': 'application/pdf' } })
    );
    const printed = await apiFetch<Blob>('/documents/d/print', { baseUrl, method: 'POST' });
    expect(printed).toBeInstanceOf(Blob);
    expect(await printed.text()).toBe(pdf);
  });

  it('returns a zip as a file under the name the API gives it', async () => {
    const name = 'S.C. PIPETECH S.R.L. - documentația SSM - Word.zip';
    fetchMock.mockResolvedValue(
      new Response('PK', {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="S.C. PIPETECH S.R.L. - documentatia SSM - Word.zip"; filename*=UTF-8''${encodeURIComponent(name)}`,
        },
      })
    );
    const archive = await apiFetch<Blob>('/clients/c/documents/archive', { baseUrl });
    expect(archive).toBeInstanceOf(File);
    expect((archive as File).name).toBe(name);
    expect(await archive.text()).toBe('PK');
  });

  it('preserves the status of non-JSON proxy errors', async () => {
    fetchMock.mockResolvedValue(new Response('<h1>Bad gateway</h1>', { status: 502 }));
    await expect(apiFetch('/me', { baseUrl })).rejects.toBeInstanceOf(ApiHttpError);
  });

  it('refuses a successful answer that is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }));
    await expect(apiFetch('/me', { baseUrl })).rejects.toThrow('invalid JSON');
  });

  it('blocks missing configuration and endpoint URLs outside the configured origin', async () => {
    await expect(apiFetch('/me')).rejects.toThrow('not configured');
    await expect(apiFetch('/me', { baseUrl: 'ftp://api.example.test' })).rejects.toThrow(
      'Invalid API URL'
    );
    await expect(
      apiFetch('https://attacker.example/me', { baseUrl, getAccessToken: () => 'secret' })
    ).rejects.toThrow('configured origin');
    await expect(
      apiFetch('//attacker.example/me', { baseUrl, getAccessToken: () => 'secret' })
    ).rejects.toThrow('configured origin');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not send a token or request after cancellation while waiting for auth', async () => {
    const controller = new AbortController();
    let resolve!: (value: string) => void;
    const pending = apiFetch('/me', {
      baseUrl,
      signal: controller.signal,
      getAccessToken: () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    });
    controller.abort();
    resolve('token');
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('reporting failed requests', () => {
  const clientId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';

  it('reports a server failure with its route, status and ray id, without ids', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { error: 'service_unavailable' },
        { status: 503, headers: { 'cf-ray': 'abc-OTP' } }
      )
    );
    await expect(apiFetch(`/clients/${clientId}/documents`, { baseUrl })).rejects.toThrow();
    expect(onFailure).toHaveBeenCalledWith({
      method: 'GET',
      route: '/clients/:id/documents',
      kind: 'status',
      status: 503,
      cf_ray: 'abc-OTP',
      duration_ms: expect.any(Number),
    });
  });

  it('reports a request that never got an answer, without its query string', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      apiFetch('/contract-returns/lookup?token=secret', { baseUrl, method: 'POST' })
    ).rejects.toThrow('Failed to fetch');
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        route: '/contract-returns/lookup',
        kind: 'network',
        error: 'TypeError: Failed to fetch',
      })
    );
    expect(JSON.stringify(onFailure.mock.calls)).not.toContain('secret');
  });

  it.each([400, 403, 404, 409])('leaves out an answer the forms handle (%s)', async (status) => {
    fetchMock.mockResolvedValue(Response.json({ error: 'x' }, { status }));
    await expect(apiFetch('/me', { baseUrl })).rejects.toThrow();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('leaves out a request the caller cancelled', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async () => {
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    });
    await expect(apiFetch('/me', { baseUrl, signal: controller.signal })).rejects.toThrow();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('works without a failure callback', async () => {
    fetchMock.mockResolvedValue(Response.json({}, { status: 503 }));
    await expect(createApiHttp().apiFetch('/me', { baseUrl })).rejects.toBeInstanceOf(ApiHttpError);
  });
});

describe('uploading a file', () => {
  type Answer = { status: number; body: string; responseURL?: string };
  const sent: { url: string; headers: Record<string, string>; body: unknown }[] = [];
  let answer: Answer = { status: 201, body: '{"file":{"id":"f"}}' };

  class FakeXhr {
    upload: { onprogress: ((event: Partial<ProgressEvent>) => void) | null } = {
      onprogress: null,
    };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    status = 0;
    responseText = '';
    responseURL = '';
    private url = '';
    private headers: Record<string, string> = {};
    open(_method: string, url: URL | string) {
      this.url = String(url);
    }
    setRequestHeader(name: string, value: string) {
      this.headers[name] = value;
    }
    getResponseHeader() {
      return null;
    }
    abort() {
      this.onabort?.();
    }
    send(body: unknown) {
      sent.push({ url: this.url, headers: this.headers, body });
      this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
      this.status = answer.status;
      this.responseText = answer.body;
      this.responseURL = answer.responseURL ?? this.url;
      this.onload?.();
    }
  }

  beforeEach(() => {
    sent.length = 0;
    answer = { status: 201, body: '{"file":{"id":"f"}}' };
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
  });

  it('sends the body with the current token, reports progress and returns the answer', async () => {
    const progress: number[] = [];
    const file = new Blob(['bytes']);
    const result = await apiUpload('/clients/c/files?fileName=a.pdf', file, {
      baseUrl,
      getAccessToken: () => 'upload-token',
      onProgress: (loaded, total) => progress.push(loaded / total),
    });
    expect(result).toEqual({ file: { id: 'f' } });
    expect(sent).toEqual([
      {
        url: `${baseUrl}/clients/c/files?fileName=a.pdf`,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/octet-stream',
          Authorization: 'Bearer upload-token',
        },
        body: file,
      },
    ]);
    expect(progress).toEqual([0.5]);
  });

  it('throws a typed error with the reason the API gave, and reports a server failure', async () => {
    answer = { status: 400, body: '{"error":"validation_error","reason":"client_file_empty"}' };
    await expect(apiUpload('/clients/c/files', new Blob([]), { baseUrl })).rejects.toMatchObject({
      name: 'ApiHttpError',
      status: 400,
      body: { reason: 'client_file_empty' },
    });
    expect(onFailure).not.toHaveBeenCalled();

    answer = { status: 503, body: '' };
    await expect(apiUpload('/clients/c/files', new Blob([]), { baseUrl })).rejects.toMatchObject({
      status: 503,
    });
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', route: '/clients/c/files', status: 503 })
    );
  });

  it('refuses another origin before sending, and an answer that came through a redirect', async () => {
    await expect(
      apiUpload('https://attacker.example/files', new Blob(['x']), {
        baseUrl,
        getAccessToken: () => 'secret',
      })
    ).rejects.toThrow('configured origin');
    expect(sent).toHaveLength(0);

    answer = { status: 201, body: '{}', responseURL: 'https://elsewhere.example/files' };
    await expect(apiUpload('/clients/c/files', new Blob(['x']), { baseUrl })).rejects.toThrow(
      'redirected'
    );
  });
});
