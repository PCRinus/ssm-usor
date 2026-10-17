import {
  type ApiRequestOptions,
  createApiHttp,
  type ErrorType as ApiErrorType,
} from '@ssm-usor/api-http';

import { captureEvent } from '@/app/observability/posthog';

export { ApiHttpError, type ApiRequestOptions } from '@ssm-usor/api-http';

const http = createApiHttp({
  onFailure: (failure) => captureEvent('api_request_failed', failure),
});

// Orval reads the declarations of this file, not what it re-exports: without a function
// named apiFetch it refuses the mutator, and without a type named ErrorType it types every
// query error as the bare response body.
export type ErrorType<T> = ApiErrorType<T>;

export function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return http.apiFetch<T>(path, options);
}

export const apiUpload = http.apiUpload;
