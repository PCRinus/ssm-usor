import type { SmsReceipt } from '@ssm-usor/contracts';

import type { SmsEnv } from '../env';
import { logProvider } from './log';
import { twilioProvider } from './twilio';

export type OutgoingSms = { to: string; body: string };

export type SmsProvider = { send(sms: OutgoingSms): Promise<SmsReceipt> };

export function createProvider(env: SmsEnv): SmsProvider {
  const { TWILIO_ACCOUNT_SID: accountSid, TWILIO_AUTH_TOKEN: authToken, SMS_FROM: from } = env;
  return accountSid && authToken && from
    ? twilioProvider({ accountSid, authToken, from })
    : logProvider();
}
