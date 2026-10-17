import { afterEach, describe, expect, it, vi } from 'vitest';

import { createProvider } from './index';

afterEach(() => {
  vi.restoreAllMocks();
});

const twilio = { TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'token', SMS_FROM: 'SSMUsor' };

describe('createProvider', () => {
  it('sends through Twilio when the account, the token and the sender are all set', async () => {
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ sid: 'SM1', status: 'queued' }, { status: 201 }));

    const receipt = await createProvider(twilio).send({ to: '+40722123456', body: 'Salut' });

    expect(receipt).toEqual({ id: 'SM1' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'SMS_FROM'] as const)(
    'logs the message instead of sending it while %s is missing',
    async (missing) => {
      const fetcher = vi.spyOn(globalThis, 'fetch');
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});

      const receipt = await createProvider({ ...twilio, [missing]: undefined }).send({
        to: '+40722123456',
        body: 'Codul tau SSM Usor: 493027.',
      });

      expect(receipt).toEqual({ id: null });
      expect(fetcher).not.toHaveBeenCalled();
      expect(log.mock.calls[0]![0]).toContain('to: +40722123456');
      expect(log.mock.calls[0]![0]).toContain('Codul tau SSM Usor: 493027.');
    }
  );
});
