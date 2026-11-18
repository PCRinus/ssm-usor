import { describe, expect, it } from 'vitest';

import WaitlistConfirmation, { subject } from './emails/waitlist-confirmation';
import { sendEmail } from './send';
import { captureProvider, testEnv } from './testing';

const confirmUrl = 'https://api.ssmusor.ro/waitlist/confirm?token=abc123';

async function sendWaitlistConfirmation() {
  const provider = captureProvider();
  const receipt = await sendEmail(
    testEnv,
    { to: 'ana@example.ro', subject, body: <WaitlistConfirmation confirmUrl={confirmUrl} /> },
    provider
  );

  return { receipt, email: provider.sent[0]! };
}

describe('sendEmail', () => {
  it('hands the provider the sender, recipient, and subject', async () => {
    const { receipt, email } = await sendWaitlistConfirmation();

    expect(receipt).toEqual({ id: 'msg_1' });
    expect(email).toMatchObject({
      from: testEnv.MAIL_FROM,
      replyTo: testEnv.MAIL_REPLY_TO,
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
