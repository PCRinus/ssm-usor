import { describe, expect, it } from 'vitest';

import type { MailEnv } from '../env';
import type { OutgoingEmail } from '../provider';
import { sendEmail } from '../send';
import SignupConfirmation, { subject } from './signup-confirmation';

const env: MailEnv = {
  MAIL_FROM: 'SSM Ușor <noreply@mail.ssmusor.ro>',
  MAIL_REPLY_TO: 'contact@ssmusor.ro',
};

const confirmUrl = 'https://app.ssmusor.ro/confirm-email?token_hash=abc123';

async function sendConfirmation() {
  const sent: OutgoingEmail[] = [];
  await sendEmail(
    env,
    {
      to: 'ion@example.ro',
      subject,
      body: <SignupConfirmation confirmUrl={confirmUrl} expiresInMinutes={60} />,
    },
    {
      send: async (email) => {
        sent.push(email);
        return { id: 'msg_1' };
      },
    }
  );

  return sent[0]!;
}

describe('signup confirmation', () => {
  it('renders the confirmation link into both the HTML and the plain text', async () => {
    const email = await sendConfirmation();

    expect(email.subject).toBe('Confirmă adresa de email pentru contul SSM Ușor');
    expect(email.html).toContain('lang="ro"');
    expect(email.html).toContain(`href="${confirmUrl}"`);
    expect(email.text).toContain(confirmUrl);
    expect(email.text).toContain('valabil o oră');
    expect(email.text).not.toContain('<');
  });

  it('tells someone who did not register that the account cannot be used', async () => {
    const email = await sendConfirmation();

    expect(email.text).toContain('fără confirmare contul nu poate fi folosit');
  });

  it('stays far below the size at which Gmail clips an email', async () => {
    const email = await sendConfirmation();

    expect(new TextEncoder().encode(email.html).length).toBeLessThan(102 * 1024);
  });
});
