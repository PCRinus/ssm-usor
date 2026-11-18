import type { MailService, SmsService } from '@ssm-usor/contracts';
import { vi } from 'vitest';

import {
  mockUpstream as mockSignedInUpstream,
  testEnv,
  testSecretKey,
  type UpstreamRoutes,
} from '../../test/upstream';

export {
  callsTo,
  databaseError,
  fetchMock,
  testOrganizationId as organizationId,
  type UpstreamCall,
  type UpstreamRoute,
  testUser as user,
} from '../../test/upstream';

export const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

export const sendSignatureRequestEmail = vi.fn<MailService['sendSignatureRequest']>();
export const sendSignatureRequestSms = vi.fn<SmsService['sendSignatureRequest']>();

export const env = testEnv({
  SUPABASE_SECRET_KEY: testSecretKey,
  APP_ORIGIN: 'https://app.example.ro',
  PORTAL_ORIGIN: 'https://portal.example.ro',
  MAIL: { sendSignatureRequest: sendSignatureRequestEmail } as unknown as MailService,
  SMS: { sendSignatureRequest: sendSignatureRequestSms } as unknown as SmsService,
});

const signingRoutes: UpstreamRoutes = {
  'GET /rest/v1/subscriptions': () => [],
  'POST /rest/v1/rpc/claim_sms_send': () => ({ id: 'sms-1', refusal: null, overage: false }),
  'PATCH /rest/v1/sms_sends': () => new Response(null, { status: 204 }),
  'DELETE /rest/v1/sms_sends': () => new Response(null, { status: 204 }),
};

export const mockUpstream = (routes: UpstreamRoutes) => mockSignedInUpstream(routes, signingRoutes);
