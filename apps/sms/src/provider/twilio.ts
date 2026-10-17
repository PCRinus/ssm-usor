import type { SmsProvider } from './index';

type TwilioCredentials = { accountSid: string; authToken: string; from: string };

// The status of a message Twilio has just created. Delivery is reported later, by callback;
// at creation these say Twilio took the message, anything else ("failed", "canceled") that it
// will not deliver it.
const acceptedStatuses = new Set(['queued', 'accepted', 'scheduled', 'sending', 'sent']);

const messagingServiceSid = /^MG[0-9a-f]{32}$/;

export function twilioProvider(
  { accountSid, authToken, from }: TwilioCredentials,
  fetcher: typeof fetch = fetch
): SmsProvider {
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;

  return {
    async send({ to, body }) {
      const form = new URLSearchParams({ To: to, Body: body });
      form.set(messagingServiceSid.test(from) ? 'MessagingServiceSid' : 'From', from);

      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form,
      });

      if (!response.ok) {
        const text = await response.text();
        let detail = text;
        try {
          const error = JSON.parse(text) as { code?: number; message?: string };
          if (error.message) detail = `${error.code ?? 'no code'} ${error.message}`;
        } catch {
          // Not JSON: the body as it came.
        }
        throw new Error(`Twilio rejected the message (${response.status}): ${detail}`);
      }

      const { sid, status } = (await response.json()) as { sid?: string; status?: string };
      if (!status || !acceptedStatuses.has(status)) {
        throw new Error(`Twilio did not accept the message: ${status ?? 'no status'}`);
      }
      return { id: sid ?? null };
    },
  };
}
