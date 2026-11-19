import { describe, expect, it } from 'vitest';

import { sentEmail } from '../testing';
import SignupConfirmation, { subject } from './signup-confirmation';

const confirmUrl = 'https://app.ssmusor.ro/confirmare-email?token_hash=abc123';

async function sendConfirmation() {
  return sentEmail({
    to: 'ion@example.ro',
    subject,
    body: <SignupConfirmation confirmUrl={confirmUrl} expiresInMinutes={60} />,
  });
}

describe('signup confirmation', () => {
  it('renders the confirmation link into both the HTML and the plain text', async () => {
    const email = await sendConfirmation();

    expect(email.subject).toBe('Confirmă adresa de email pentru contul SSM Ușor');
    expect(email.html).toContain(`href="${confirmUrl}"`);
    expect(email.text).toContain(confirmUrl);
    expect(email.text).toContain('valabil o oră');
  });

  it('tells someone who did not register that the account cannot be used', async () => {
    const email = await sendConfirmation();

    expect(email.text).toContain('fără confirmare contul nu poate fi folosit');
  });
});
