import { describe, expect, it } from 'vitest';

import { sentEmail } from '../testing';
import SigningCode, { subject } from './signing-code';

async function sendCode() {
  return sentEmail({
    to: 'ion@example.ro',
    subject: subject('123456'),
    body: <SigningCode code="123456" expiresInMinutes={10} />,
  });
}

describe('signing code', () => {
  it('puts the code in the subject and in both versions of the body', async () => {
    const email = await sendCode();

    expect(email.subject).toBe('Codul tău de semnare SSM Ușor: 123456');
    expect(email.html).toContain('lang="ro"');
    expect(email.html).toContain('123456');
    expect(email.text).toContain('123456');
    expect(email.text).not.toContain('<');
  });

  it('says how long the code works, that it signs what was listed, and that nobody will ask for it', async () => {
    const email = await sendCode();

    expect(email.text).toContain('valabil 10 minute');
    expect(email.text).toContain('documentele pe care le-ai văzut în listă');
    expect(email.text).toContain('nimeni de la SSM Ușor nu ți-l va cere');
  });

  it('carries no link', async () => {
    const email = await sendCode();

    expect(email.text).not.toMatch(/https:\/\/(app|portal)\./);
  });

  it('stays far below the size at which Gmail clips an email', async () => {
    const email = await sendCode();

    expect(new TextEncoder().encode(email.html).length).toBeLessThan(102 * 1024);
  });
});
