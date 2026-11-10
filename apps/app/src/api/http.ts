import {
  type ApiRequestOptions,
  createApiHttp,
  type ErrorType as ApiErrorType,
} from '@ssm-usor/api-http';
import { clientContract } from '@ssm-usor/contracts';

import { captureEvent } from '@/app/observability/posthog';
import { openReloadDialog } from '@/features/reload-prompts/reload-dialog-store';

export { ApiHttpError, type ApiRequestOptions, isClientOutdatedError } from '@ssm-usor/api-http';

const http = createApiHttp({
  clientContract: clientContract('app'),
  onClientOutdated: ({ method }) =>
    openReloadDialog('426', { unsavedChange: !['GET', 'HEAD'].includes(method.toUpperCase()) }),
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
