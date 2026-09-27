import { captureEvent } from '../observability/posthog';

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

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { baseUrl, getAccessToken, ...request } = options;
  if (!baseUrl) throw new Error('The API URL is not configured.');
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Invalid API URL.');
  const url = new URL(path, `${base.href.replace(/\/$/, '')}/`);
  // Never send a bearer token to an origin chosen by an endpoint path or redirect.
  if (url.origin !== base.origin) throw new Error('API requests must use the configured origin.');
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
