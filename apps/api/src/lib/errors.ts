import type { ApiErrorCode, ApiErrorResponse, MissingDocumentData } from '@ssm-usor/contracts';
import { SigningAgreementDataError } from '@ssm-usor/document-engine';

export const errorStatus = {
  unauthorized: 401,
  forbidden: 403,
  validation_error: 400,
  not_found: 404,
  conflict: 409,
  unprocessable: 422,
  service_unavailable: 503,
  internal_error: 500,
} as const satisfies Record<ApiErrorCode, number>;

export const defaultMessages = {
  unauthorized: 'A valid access token is required.',
  forbidden: 'You do not have access to this resource.',
  validation_error: 'The request is invalid.',
  not_found: 'The requested resource does not exist.',
  conflict: 'The request conflicts with existing data.',
  unprocessable: 'The request is well formed but cannot be carried out.',
  service_unavailable: 'The service is temporarily unavailable.',
  internal_error: 'An unexpected error occurred.',
} as const satisfies Record<ApiErrorCode, string>;

export interface BrokenConstraint {
  name: string;
  // Null when the database's message names no table, as for a unique violation.
  table: string | null;
}

export class ApiError extends Error {
  // Names only: the database's message and details quote the refused row's values.
  constraint?: BrokenConstraint;

  constructor(
    readonly code: ApiErrorCode,
    message: string = defaultMessages[code],
    // Field-level details for validation errors raised by handlers, not by body parsing.
    readonly issues?: ApiErrorResponse['issues'],
    // A stable identifier for an error the client words itself.
    readonly reason?: string,
    readonly missing?: MissingDocumentData[],
    readonly extra?: Pick<ApiErrorResponse, 'attemptsLeft' | 'retryAfterSeconds' | 'credits'>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** A refusal of the document engine as the response the app already knows how to word. */
export function fromEngineError(error: Error): Error {
  if (error instanceof SigningAgreementDataError) {
    return new ApiError(
      'conflict',
      `Data the signing agreement prints is missing: ${error.missing.join(', ')}.`,
      undefined,
      'missing_document_data',
      error.missing
    );
  }
  return error;
}
