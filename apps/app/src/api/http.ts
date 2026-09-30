import { captureEvent } from '../app/observability/posthog';

export interface ApiRequestOptions extends RequestInit {
  baseUrl?: string;
  getAccessToken?: () => string | null | Promise<string | null>;
}

export class ApiHttpError<T = unknown> extends Error {
  constructor(
    readonly status: number,
    readonly body: T
  ) {
    super(`API request failed (${status}).`);
    this.name = 'ApiHttpError';
  }
}

export type ErrorType<T> = ApiHttpError<T> | Error;

function apiUrl(baseUrl: string | undefined, path: string) {
  if (!baseUrl) throw new Error('The API URL is not configured.');
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Invalid API URL.');
  const url = new URL(path, `${base.href.replace(/\/$/, '')}/`);
  // Never send a bearer token to an origin chosen by an endpoint path or redirect.
  if (url.origin !== base.origin) throw new Error('API requests must use the configured origin.');
  return url;
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { baseUrl, getAccessToken, ...request } = options;
  const url = apiUrl(baseUrl, path);
  request.signal?.throwIfAborted();
  const token = await getAccessToken?.();
  request.signal?.throwIfAborted();
  const headers = new Headers(request.headers);
  headers.set('Accept', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  else headers.delete('Authorization');

  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(url, {
      ...request,
      headers,
      credentials: 'omit',
      redirect: 'error',
    });
  } catch (error) {
    if (!request.signal?.aborted) {
      reportFailure(request.method, url, started, { kind: 'network', error: String(error) });
    }
    throw error;
  }
  if (reportedStatus(response.status)) {
    reportFailure(request.method, url, started, {
      kind: 'status',
      status: response.status,
      cf_ray: response.headers.get('cf-ray'),
    });
  }
  if (response.ok && response.headers.get('Content-Type')?.startsWith('application/pdf')) {
    return (await response.blob()) as T;
  }
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    if (response.ok) throw new Error('The API returned invalid JSON.');
  }
  if (!response.ok) throw new ApiHttpError(response.status, body);
  // Generated types describe the OpenAPI contract; they are not runtime validators.
  return body as T;
}

// fetch cannot tell how much of a request body has been sent, so a file goes up through
// XMLHttpRequest, under the same rules as `apiFetch`.
export async function apiUpload<T>(
  path: string,
  body: Blob,
  options: ApiRequestOptions & { onProgress?: (sent: number, total: number) => void }
): Promise<T> {
  const { baseUrl, getAccessToken, signal, onProgress } = options;
  const url = apiUrl(baseUrl, path);
  signal?.throwIfAborted();
  const token = await getAccessToken?.();
  signal?.throwIfAborted();
  const started = performance.now();
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.setRequestHeader('Accept', 'application/json');
    request.setRequestHeader('Content-Type', 'application/octet-stream');
    if (token) request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded, event.total);
    };
    request.onerror = () => {
      reportFailure('POST', url, started, { kind: 'network', error: 'XMLHttpRequest failed' });
      reject(new TypeError('Failed to upload.'));
    };
    request.onabort = () => reject(signal?.reason ?? new DOMException('Aborted.', 'AbortError'));
    request.onload = () => {
      if (reportedStatus(request.status)) {
        reportFailure('POST', url, started, {
          kind: 'status',
          status: request.status,
          cf_ray: request.getResponseHeader('cf-ray'),
        });
      }
      // XMLHttpRequest follows redirects and cannot refuse them the way fetch does.
      if (request.responseURL && request.responseURL !== url.href) {
        reject(new Error('The API redirected an upload.'));
        return;
      }
      let answer: unknown;
      try {
        answer = request.responseText ? JSON.parse(request.responseText) : undefined;
      } catch {
        if (request.status >= 200 && request.status < 300) {
          reject(new Error('The API returned invalid JSON.'));
          return;
        }
      }
      if (request.status < 200 || request.status >= 300) {
        reject(new ApiHttpError(request.status, answer));
        return;
      }
      resolve(answer as T);
    };
    signal?.addEventListener('abort', () => request.abort(), { once: true });
    request.send(body);
  });
}

// Not the answers the forms handle (validation, conflicts, a missing record), only those
// that mean the service or the session failed.
const reportedStatus = (status: number) => status >= 500 || status === 401 || status === 429;

const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// Recorded in the browser because a request that never reaches the API leaves no trace
// there. The route has its ids replaced so failures group, and no query string: the public
// contract link carries its token in one.
function reportFailure(
  method: string | undefined,
  url: URL,
  started: number,
  details: Record<string, unknown>
) {
  captureEvent('api_request_failed', {
    method: method ?? 'GET',
    route: url.pathname.replace(uuid, ':id'),
    duration_ms: Math.round(performance.now() - started),
    ...details,
  });
}
