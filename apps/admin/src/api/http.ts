import { type ApiRequestOptions, createApiHttp } from '@ssm-usor/api-http';

export { ApiHttpError, type ApiRequestOptions } from '@ssm-usor/api-http';

const http = createApiHttp();

export function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return http.apiFetch<T>(path, options);
}
