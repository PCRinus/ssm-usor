import {
  type ApiRequestOptions,
  createApiHttp,
  type ErrorType as ApiErrorType,
} from '@ssm-usor/api-http';
import { clientContract } from '@ssm-usor/contracts';
import { toast } from '@ssm-usor/ui/lib/toast';

import { captureEvent } from '@/app/observability/posthog';
import {
  impersonationRefusedMessage,
  isImpersonationRefused,
} from '@/features/impersonation/refusal';
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

// Every page words its own failures; this one has a single cause wherever it comes from.
function sayWhyRefused(error: unknown): never {
  if (isImpersonationRefused(error)) {
    toast.error(impersonationRefusedMessage, { id: 'impersonation-refused' });
  }
  throw error;
}

export function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return http.apiFetch<T>(path, options).catch(sayWhyRefused);
}

export function apiUpload<T>(
  path: string,
  body: Blob,
  options: Parameters<typeof http.apiUpload>[2]
): Promise<T> {
  return http.apiUpload<T>(path, body, options).catch(sayWhyRefused);
}
