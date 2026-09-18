import { describe, expect, it } from 'vitest';

import WaitlistConfirmation, { subject } from './emails/waitlist-confirmation';
import type { MailEnv } from './env';
import type { OutgoingEmail } from './provider';
import { sendEmail } from './send';

const env: MailEnv = {
  MAIL_FROM: 'SSM Ușor <noreply@mail.ssmusor.ro>',
  MAIL_REPLY_TO: 'contact@ssmusor.ro',
};

const confirmUrl = 'https://api.ssmusor.ro/waitlist/confirm?token=abc123';

async function sendWaitlistConfirmation() {
  const sent: OutgoingEmail[] = [];
  const receipt = await sendEmail(
    env,
    { to: 'ana@example.ro', subject, body: <WaitlistConfirmation confirmUrl={confirmUrl} /> },
    {
      send: async (email) => {
        sent.push(email);
        return { id: 'msg_1' };
      },
    }
  );

  return { receipt, email: sent[0]! };
}

describe('sendEmail', () => {
  it('hands the provider the sender, recipient, and subject', async () => {
    const { receipt, email } = await sendWaitlistConfirmation();

    expect(receipt).toEqual({ id: 'msg_1' });
    expect(email).toMatchObject({
      from: env.MAIL_FROM,
      replyTo: env.MAIL_REPLY_TO,
      to: 'ana@example.ro',
      subject,
    });
  });

  it('renders the confirmation link into both the HTML and the plain text', async () => {
    const { email } = await sendWaitlistConfirmation();

    expect(email.html).toContain('lang="ro"');
    expect(email.html).toContain(`href="${confirmUrl}"`);
    expect(email.html).toContain('Confirmă abonarea');
    expect(email.text).toContain(confirmUrl);
    expect(email.text).not.toContain('<');
  });

  it('keeps the rendered email far below the size at which Gmail clips it', async () => {
    const { email } = await sendWaitlistConfirmation();

    expect(new TextEncoder().encode(email.html).length).toBeLessThan(102 * 1024);
  });
});
