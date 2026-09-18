import { describe, expect, it } from 'vitest';

import type { MailEnv } from '../env';
import type { OutgoingEmail } from '../provider';
import { sendEmail } from '../send';
import OrganizationInvitation, { subject } from './organization-invitation';

const env: MailEnv = {
  MAIL_FROM: 'SSM Ușor <noreply@mail.ssmusor.ro>',
  MAIL_REPLY_TO: 'contact@ssmusor.ro',
};

const acceptUrl = 'https://app.ssmusor.ro/accept-invitation?token=abc123';

async function sendInvitation(inviterName: string | null) {
  const sent: OutgoingEmail[] = [];
  await sendEmail(
    env,
    {
      to: 'ion@example.ro',
      subject: subject('Protect SSM'),
      body: (
        <OrganizationInvitation
          acceptUrl={acceptUrl}
          organizationName="Protect SSM"
          inviterName={inviterName}
          expiresAt="2026-09-25T21:30:00.000Z"
        />
      ),
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

describe('organization invitation', () => {
  it('names the organization in the subject', async () => {
    const email = await sendInvitation('Ana Popescu');

    expect(email.subject).toBe('Invitație în Protect SSM pe SSM Ușor');
  });

  it('renders the accept link into both the HTML and the plain text', async () => {
    const email = await sendInvitation('Ana Popescu');

    expect(email.html).toContain('lang="ro"');
    expect(email.html).toContain(`href="${acceptUrl.replace('&', '&amp;')}"`);
    expect(email.html).toContain('Acceptă invitația');
    expect(email.text).toContain(acceptUrl);
    expect(email.text).toContain('Ana Popescu te invită');
    expect(email.text).not.toContain('<');
  });

  it('gives the expiry as a Romanian date in Bucharest time', async () => {
    const email = await sendInvitation('Ana Popescu');

    // 21:30 UTC is already the next day in Bucharest.
    expect(email.text).toContain('26 septembrie 2026');
  });

  it('reads well without an inviter name', async () => {
    const email = await sendInvitation(null);

    expect(email.text).toContain('Ai primit o invitație în organizația Protect SSM');
    expect(email.text).not.toContain('null');
  });

  it('stays far below the size at which Gmail clips an email', async () => {
    const email = await sendInvitation('Ana Popescu');

    expect(new TextEncoder().encode(email.html).length).toBeLessThan(102 * 1024);
  });
});
