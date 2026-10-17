import type { SmsProvider } from './index';

export function logProvider(): SmsProvider {
  return {
    async send({ to, body }) {
      console.log(`[sms] not sent, Twilio is not configured\nto: ${to}\n\n${body}`);
      return { id: null };
    },
  };
}
