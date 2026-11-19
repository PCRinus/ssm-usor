import './api-mock';

import { describe, expect, it } from 'vitest';

import {
  getGetPortalMeQueryKey,
  getPortalTrainingSheet,
  PortalMeResponseParticipationsItemKind,
  useGetPortalMe,
  useGetPortalSigningAgreementState,
  useListPortalSignatureRequests,
  useSetPortalLanguage,
} from '@/api/generated/api';

import { takeUnexpectedCalls } from './api-mock';
import { mockFailure, mockPending, mockQuery, readySheets } from './portal';

describe('the generated API mock', () => {
  it('leaves every query pending until a test answers it', () => {
    expect(useGetPortalMe()).toMatchObject({ isPending: true, data: undefined });
    expect(useListPortalSignatureRequests('participant')).toMatchObject({ isPending: true });
  });

  it('keeps mutations idle and refuses a raw call nobody stubbed', async () => {
    expect(useSetPortalLanguage()).toMatchObject({ isPending: false, isError: false });
    await expect(getPortalTrainingSheet('participant', 'ssm')).rejects.toThrow(
      'Unexpected call: getPortalTrainingSheet'
    );
    expect(takeUnexpectedCalls()).toEqual(['getPortalTrainingSheet']);
  });

  it('keeps the query keys and the constants real', () => {
    expect(getGetPortalMeQueryKey()).toEqual(['/portal/me']);
    expect(PortalMeResponseParticipationsItemKind.employee).toBe('employee');
  });

  it('answers a query with data of its own response type, pending or failed', () => {
    mockQuery(useGetPortalSigningAgreementState, { agreement: null, unavailable: null });
    expect(useGetPortalSigningAgreementState('participant')).toMatchObject({
      isSuccess: true,
      data: { agreement: null, unavailable: null },
    });

    // @ts-expect-error the response always carries `unavailable`
    mockQuery(useGetPortalSigningAgreementState, { agreement: null });

    mockQuery(useGetPortalMe, { participations: [] });
    mockPending(useGetPortalMe);
    expect(useGetPortalMe()).toMatchObject({ isPending: true });

    mockFailure(useGetPortalMe, 403);
    expect(useGetPortalMe().error).toMatchObject({ status: 403 });
  });

  it('builds both training sheets ready, with per-domain overrides', () => {
    expect(readySheets({ ssm: { stored: true, sequences: [1] } })).toEqual({
      ssm: { ready: true, missing: [], stored: true, sequences: [1], versions: {} },
      su: { ready: true, missing: [], stored: false, sequences: [], versions: {} },
    });
  });
});
