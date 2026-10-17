import { describe, expect, it, vi } from 'vitest';

import { twilioProvider } from './twilio';

const credentials = { accountSid: 'AC123', authToken: 'secret-token', from: 'SSMUsor' };
const sms = { to: '+40722123456', body: 'Codul tau SSM Usor: 493027.' };

const created = (status: string) =>
  Response.json({ sid: 'SM1', status, error_code: null }, { status: 201 });

describe('twilioProvider', () => {
  it('posts the message form to Twilio with Basic auth and returns the message sid', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => created('queued'));

    const receipt = await twilioProvider(credentials, fetcher).send(sms);

    expect(receipt).toEqual({ id: 'SM1' });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      `Basic ${btoa('AC123:secret-token')}`
    );
    expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
      To: '+40722123456',
      Body: 'Codul tau SSM Usor: 493027.',
      From: 'SSMUsor',
    });
  });

  it('sends through a Messaging Service when the sender is one', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => created('accepted'));
    const service = `MG${'0'.repeat(32)}`;

    await twilioProvider({ ...credentials, from: service }, fetcher).send(sms);

    const form = fetcher.mock.calls[0]![1]?.body as URLSearchParams;
    expect(form.get('MessagingServiceSid')).toBe(service);
    expect(form.has('From')).toBe(false);
  });

  it.each(['queued', 'accepted', 'sent'])('takes the status %s as sent', async (status) => {
    const fetcher = vi.fn<typeof fetch>(async () => created(status));

    await expect(twilioProvider(credentials, fetcher).send(sms)).resolves.toEqual({ id: 'SM1' });
  });

  it.each(['failed', 'canceled', 'undelivered'])(
    'rejects a message Twilio created with the status %s',
    async (status) => {
      const fetcher = vi.fn<typeof fetch>(async () => created(status));

      await expect(twilioProvider(credentials, fetcher).send(sms)).rejects.toThrow(
        `Twilio did not accept the message: ${status}`
      );
    }
  );

  it("rejects with Twilio's error code and message when it refuses the message", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(
        {
          code: 21211,
          message: "The 'To' number is not a valid phone number.",
          more_info: 'https://www.twilio.com/docs/errors/21211',
          status: 400,
        },
        { status: 400 }
      )
    );

    await expect(twilioProvider(credentials, fetcher).send(sms)).rejects.toThrow(
      "Twilio rejected the message (400): 21211 The 'To' number is not a valid phone number."
    );
  });

  it('rejects with the body as it came when the error is not JSON', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response('Service Unavailable', { status: 503 })
    );

    await expect(twilioProvider(credentials, fetcher).send(sms)).rejects.toThrow(
      'Twilio rejected the message (503): Service Unavailable'
    );
  });
});
