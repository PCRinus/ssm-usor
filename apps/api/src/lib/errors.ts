import type { ApiErrorCode, ApiErrorResponse } from '@ssm-usor/contracts';

export const errorStatus = {
  unauthorized: 401,
  forbidden: 403,
  validation_error: 400,
  not_found: 404,
  conflict: 409,
  service_unavailable: 503,
  internal_error: 500,
} as const satisfies Record<ApiErrorCode, number>;

export const defaultMessages = {
  unauthorized: 'A valid access token is required.',
  forbidden: 'You do not have access to this resource.',
  validation_error: 'The request is invalid.',
  not_found: 'The requested resource does not exist.',
  conflict: 'The request conflicts with existing data.',
  service_unavailable: 'The service is temporarily unavailable.',
  internal_error: 'An unexpected error occurred.',
} as const satisfies Record<ApiErrorCode, string>;

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string = defaultMessages[code],
    // Field-level details for validation errors raised by handlers, not by body parsing.
    readonly issues?: ApiErrorResponse['issues']
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
