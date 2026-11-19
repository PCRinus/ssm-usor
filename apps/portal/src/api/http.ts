import {
  apiErrorBody as readApiErrorBody,
  type ApiRequestOptions,
  createApiHttp,
  type ErrorType as ApiErrorType,
} from '@ssm-usor/api-http';
import { clientContract } from '@ssm-usor/contracts';

import type { ApiErrorResponse } from '@/api/generated/api';
import { captureEvent } from '@/app/observability/posthog';
import { openOutdatedDialog } from '@/features/reload/reload-store';

export {
  apiErrorReason,
  ApiHttpError,
  type ApiRequestOptions,
  isClientOutdatedError,
} from '@ssm-usor/api-http';

export const apiErrorBody = (cause: unknown) => readApiErrorBody<ApiErrorResponse>(cause);

const http = createApiHttp({
  clientContract: clientContract('portal'),
  onClientOutdated: () => openOutdatedDialog('426'),
  onFailure: (failure) => captureEvent('api_request_failed', failure),
});

// Orval reads the declarations of this file, not what it re-exports: without a function
// named apiFetch it refuses the mutator, and without a type named ErrorType it types every
// query error as the bare response body.
export type ErrorType<T> = ApiErrorType<T>;

export function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return http.apiFetch<T>(path, options);
}
