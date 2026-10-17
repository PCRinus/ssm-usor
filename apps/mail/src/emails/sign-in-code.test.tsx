import { describe, expect, it } from 'vitest';

import type { MailEnv } from '../env';
import type { OutgoingEmail } from '../provider';
import { sendEmail } from '../send';
import SignInCode, { subject } from './sign-in-code';

const env: MailEnv = {
  MAIL_FROM: 'SSM Ușor <noreply@mail.ssmusor.ro>',
  MAIL_REPLY_TO: 'contact@ssmusor.ro',
};

async function sendCode(expiresInMinutes = 60) {
  const sent: OutgoingEmail[] = [];
  await sendEmail(
    env,
    {
      to: 'ion@example.ro',
      subject: subject('493027'),
      body: <SignInCode code="493027" expiresInMinutes={expiresInMinutes} />,
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

describe('sign-in code', () => {
  it('puts the code in the subject and in both versions of the body', async () => {
    const email = await sendCode();

    expect(email.subject).toBe('Codul tău de conectare SSM Ușor: 493027');
    expect(email.html).toContain('lang="ro"');
    expect(email.html).toContain('493027');
    expect(email.text).toContain('493027');
    expect(email.text).not.toContain('<');
  });

  it('carries no link to sign in with', async () => {
    const email = await sendCode();

    expect(email.html).not.toContain('portal.ssmusor.ro');
    expect(email.text).not.toMatch(/token|https:\/\/app\./);
  });

  it('says how long the code works and that nobody will ask for it', async () => {
    const email = await sendCode(10);

    expect(email.text).toContain('valabil 10 minute');
    expect(email.text).toContain('nimeni de la SSM Ușor nu ți-l va cere');
  });

  it('stays far below the size at which Gmail clips an email', async () => {
    const email = await sendCode();

    expect(new TextEncoder().encode(email.html).length).toBeLessThan(102 * 1024);
  });
});
