import { describe, expect, it } from 'vitest';

import type { MailEnv } from '../env';
import type { OutgoingEmail } from '../provider';
import { sendEmail } from '../send';
import PasswordReset, { subject } from './password-reset';

const env: MailEnv = {
  MAIL_FROM: 'SSM Ușor <noreply@mail.ssmusor.ro>',
  MAIL_REPLY_TO: 'contact@ssmusor.ro',
};

const resetUrl = 'https://app.ssmusor.ro/reset-password?token_hash=abc123';

async function sendReset(expiresInMinutes = 60) {
  const sent: OutgoingEmail[] = [];
  await sendEmail(
    env,
    {
      to: 'ion@example.ro',
      subject,
      body: <PasswordReset resetUrl={resetUrl} expiresInMinutes={expiresInMinutes} />,
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

describe('password reset', () => {
  it('renders the reset link into both the HTML and the plain text', async () => {
    const email = await sendReset();

    expect(email.subject).toBe('Resetează parola contului SSM Ușor');
    expect(email.html).toContain('lang="ro"');
    expect(email.html).toContain(`href="${resetUrl}"`);
    expect(email.html).toContain('Resetează parola');
    expect(email.text).toContain(resetUrl);
    expect(email.text).not.toContain('<');
  });

  it('tells someone who did not ask that nothing changes', async () => {
    const email = await sendReset();

    expect(email.text).toContain('parola rămâne neschimbată');
  });

  it.each([
    [60, 'valabil o oră'],
    [120, 'valabil 2 ore'],
    [15, 'valabil 15 minute'],
    [30, 'valabil 30 de minute'],
  ])('words a validity of %s minutes', async (minutes, text) => {
    const email = await sendReset(minutes);

    expect(email.text).toContain(text);
  });

  it('stays far below the size at which Gmail clips an email', async () => {
    const email = await sendReset();

    expect(new TextEncoder().encode(email.html).length).toBeLessThan(102 * 1024);
  });
});
