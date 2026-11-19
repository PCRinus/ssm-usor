import { describe, expect, it } from 'vitest';

import { sentEmail } from '../testing';
import OrganizationInvitation, { subject } from './organization-invitation';

const acceptUrl = 'https://app.ssmusor.ro/invitatie?token=abc123';

async function sendInvitation(inviterName: string | null) {
  return sentEmail({
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
  });
}

describe('organization invitation', () => {
  it('names the organization in the subject', async () => {
    const email = await sendInvitation('Ana Popescu');

    expect(email.subject).toBe('Invitație în Protect SSM pe SSM Ușor');
  });

  it('renders the accept link into both the HTML and the plain text', async () => {
    const email = await sendInvitation('Ana Popescu');

    expect(email.html).toContain(`href="${acceptUrl.replace('&', '&amp;')}"`);
    expect(email.html).toContain('Acceptă invitația');
    expect(email.text).toContain(acceptUrl);
    expect(email.text).toContain('Ana Popescu te invită');
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
});
