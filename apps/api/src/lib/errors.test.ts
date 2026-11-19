import { SigningAgreementDataError } from '@ssm-usor/document-engine';
import { describe, expect, it } from 'vitest';

import { ApiError, errorMessage, failureLabel, fromEngineError } from './errors';

describe('errorMessage', () => {
  it("is an error's message, or the thrown value as text", () => {
    expect(errorMessage(new TypeError('fetch failed'))).toBe('fetch failed');
    expect(errorMessage('timeout')).toBe('timeout');
    expect(errorMessage(undefined)).toBe('undefined');
  });

  it('is the fallback for what is not an error, when the caller gives one', () => {
    expect(errorMessage({ code: 'x' }, 'unknown')).toBe('unknown');
    expect(errorMessage(new Error('down'), 'unknown')).toBe('down');
  });
});

describe('fromEngineError', () => {
  it('answers a signing agreement without the representative as the data it lacks', () => {
    const error = fromEngineError(new SigningAgreementDataError(['client.representativeName']));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: 'conflict',
      reason: 'missing_document_data',
      missing: ['client.representativeName'],
    });
  });

  it('leaves any other error as it is', () => {
    const error = new Error('boom');
    expect(fromEngineError(error)).toBe(error);
  });
});

describe('failureLabel', () => {
  it('names an API error by its reason, else its code', () => {
    expect(failureLabel(new ApiError('conflict', 'x', undefined, 'slot_signed'))).toBe(
      'slot_signed'
    );
    expect(failureLabel(new ApiError('service_unavailable'))).toBe('service_unavailable');
  });

  it('names any other error by its name alone, never its message', () => {
    expect(failureLabel(new TypeError('the row of Popescu Ion'))).toBe('TypeError');
    expect(failureLabel('a string')).toBe('unknown');
  });
});

describe('ApiError.conflict', () => {
  it('answers a 409 with the reason the client words', () => {
    expect(ApiError.conflict('client_archived', 'The client is archived.')).toMatchObject({
      code: 'conflict',
      message: 'The client is archived.',
      reason: 'client_archived',
    });
  });
});
