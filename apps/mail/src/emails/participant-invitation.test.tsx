import { describe, expect, it } from 'vitest';

import type { MailEnv } from '../env';
import type { OutgoingEmail } from '../provider';
import { sendEmail } from '../send';
import ParticipantInvitation, { subject } from './participant-invitation';

const env: MailEnv = {
  MAIL_FROM: 'SSM Ușor <noreply@mail.ssmusor.ro>',
  MAIL_REPLY_TO: 'contact@ssmusor.ro',
};

const portalUrl = 'https://portal.ssmusor.ro';

async function sendInvitation() {
  const sent: OutgoingEmail[] = [];
  await sendEmail(
    env,
    {
      to: 'ion@example.ro',
      subject: subject('Fabrica Sigma SRL'),
      body: (
        <ParticipantInvitation
          clientName="Fabrica Sigma SRL"
          organizationName="Protect SSM"
          portalUrl={portalUrl}
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

describe('participant invitation', () => {
  it('names the client in the subject', async () => {
    const email = await sendInvitation();

    expect(email.subject).toBe('Invitație în portalul SSM Ușor – Fabrica Sigma SRL');
  });

  it('says who invited, for which client, and links the portal in both versions', async () => {
    const email = await sendInvitation();

    expect(email.html).toContain('lang="ro"');
    expect(email.html).toContain(`href="${portalUrl}"`);
    expect(email.html).toContain('Deschide portalul');
    expect(email.text).toContain('Protect SSM, care se ocupă de securitatea și sănătatea în muncă');
    expect(email.text).toContain('la Fabrica Sigma SRL');
    expect(email.text).toContain(portalUrl);
    expect(email.text).not.toContain('<');
  });

  it('tells the person to sign in with the address the email came to, with no password', async () => {
    const email = await sendInvitation();

    expect(email.text).toContain('Intră cu adresa la care a sosit acest email');
    expect(email.text).toContain('nu ai nevoie de parolă');
  });

  it('stays far below the size at which Gmail clips an email', async () => {
    const email = await sendInvitation();

    expect(new TextEncoder().encode(email.html).length).toBeLessThan(102 * 1024);
  });
});
