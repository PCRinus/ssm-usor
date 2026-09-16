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

  const response = await fetch(url, {
    ...request,
    headers,
    credentials: 'omit',
    redirect: 'error',
  });
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
