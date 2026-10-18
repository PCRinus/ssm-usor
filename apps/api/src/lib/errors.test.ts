import { SigningAgreementDataError } from '@ssm-usor/document-engine';
import { describe, expect, it } from 'vitest';

import { ApiError, fromEngineError } from './errors';

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
