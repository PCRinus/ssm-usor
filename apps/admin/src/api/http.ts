import { ApiHttpError, type ApiRequestOptions, createApiHttp } from '@ssm-usor/api-http';

export { ApiHttpError, type ApiRequestOptions } from '@ssm-usor/api-http';

const http = createApiHttp({ credentials: 'same-origin' });

export function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return http.apiFetch<T>(path, options);
}

// The admin Worker's own 403, for a request without a valid Access token, is plain text; only
// the API's JSON one means the account lacks the admin claim or the second factor.
export const isRefusedByApi = (error: Error) =>
  error instanceof ApiHttpError &&
  error.status === 403 &&
  (error.body as { error?: unknown } | undefined)?.error === 'forbidden';
