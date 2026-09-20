import { describe, expect, it } from 'vitest';

import type { MailEnv } from '../env';
import type { OutgoingEmail } from '../provider';
import { sendEmail } from '../send';
import PasswordChanged, { subject } from './password-changed';

const env: MailEnv = {
  MAIL_FROM: 'SSM Ușor <noreply@mail.ssmusor.ro>',
  MAIL_REPLY_TO: 'contact@ssmusor.ro',
};

const forgotPasswordUrl = 'https://app.ssmusor.ro/forgot-password';

describe('password changed', () => {
  it('says what happened and gives the way out, in the HTML and in the plain text', async () => {
    const sent: OutgoingEmail[] = [];
    await sendEmail(
      env,
      {
        to: 'ion@example.ro',
        subject,
        body: <PasswordChanged forgotPasswordUrl={forgotPasswordUrl} />,
      },
      {
        send: async (email) => {
          sent.push(email);
          return { id: 'msg_1' };
        },
      }
    );
    const email = sent[0]!;

    expect(email.subject).toBe('Parola contului tău SSM Ușor a fost schimbată');
    expect(email.html).toContain('lang="ro"');
    for (const body of [email.html, email.text]) {
      expect(body).toContain('a fost schimbată');
      expect(body).toContain('Dacă nu ai fost tu');
      expect(body).toContain(forgotPasswordUrl);
      expect(body).toContain('contact@ssmusor.ro');
    }
    // Nothing in it acts on the account: no token, only the public page that asks for a link.
    expect(email.html).not.toContain('token');
  });
});
