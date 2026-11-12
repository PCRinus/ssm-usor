import {
  type ApiRequestOptions as BaseRequestOptions,
  createApiHttp,
  type ErrorType as ApiErrorType,
} from '@ssm-usor/api-http';
import { clientContract } from '@ssm-usor/contracts';
import { toast } from '@ssm-usor/ui/lib/toast';

import { captureEvent } from '@/app/observability/posthog';
import { actingAsHeader } from '@/features/impersonation/acting-as';
import {
  impersonationRefusedMessage,
  isIdentityChanged,
  isImpersonationRefused,
} from '@/features/impersonation/refusal';
import { openReloadDialog } from '@/features/reload-prompts/reload-dialog-store';

export { ApiHttpError, isClientOutdatedError } from '@ssm-usor/api-http';

export interface ApiRequestOptions extends BaseRequestOptions {
  pageIdentity?: { header: () => string | undefined; identityChanged: () => void };
  refusalShownByPage?: boolean;
}

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

// `/me` goes without it: it is how the page learns whom the API now acts as.
function prepare(path: string, options: ApiRequestOptions) {
  const { pageIdentity, refusalShownByPage, ...request } = options;
  const isMe = path === '/me' && (request.method ?? 'GET').toUpperCase() === 'GET';
  const actingAs = isMe ? undefined : pageIdentity?.header();
  if (actingAs !== undefined) {
    const headers = new Headers(request.headers);
    headers.set(actingAsHeader, actingAs);
    request.headers = headers;
  }
  // Every page words its own failures; these two have a single cause wherever they come from.
  const failed = (error: unknown): never => {
    if (isIdentityChanged(error)) pageIdentity?.identityChanged();
    if (isImpersonationRefused(error) && !refusalShownByPage) {
      toast.error(impersonationRefusedMessage, { id: 'impersonation-refused' });
    }
    throw error;
  };
  return { request, failed };
}

export function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { request, failed } = prepare(path, options);
  return http.apiFetch<T>(path, request).catch(failed);
}

export function apiUpload<T>(
  path: string,
  body: Blob,
  options: ApiRequestOptions & Pick<Parameters<typeof http.apiUpload>[2], 'onProgress'>
): Promise<T> {
  const { onProgress, ...rest } = options;
  const { request, failed } = prepare(path, rest);
  return http.apiUpload<T>(path, body, { ...request, onProgress }).catch(failed);
}
