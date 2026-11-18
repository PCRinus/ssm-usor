import { describe, expect, it } from 'vitest';

import { sentEmail } from '../testing';
import PasswordChanged, { subject } from './password-changed';

const forgotPasswordUrl = 'https://app.ssmusor.ro/parola-uitata';

describe('password changed', () => {
  it('says what happened and gives the way out, in the HTML and in the plain text', async () => {
    const email = await sentEmail({
      to: 'ion@example.ro',
      subject,
      body: <PasswordChanged forgotPasswordUrl={forgotPasswordUrl} />,
    });

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
