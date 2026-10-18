import { describe, expect, it } from 'vitest';

import type { MailEnv } from '../env';
import type { OutgoingEmail } from '../provider';
import { sendEmail } from '../send';
import SignatureRequest, { type SignatureRequestProps, subject } from './signature-request';

const env: MailEnv = {
  MAIL_FROM: 'SSM Ușor <noreply@mail.ssmusor.ro>',
  MAIL_REPLY_TO: 'contact@ssmusor.ro',
};

async function sendRequest(props: Partial<SignatureRequestProps> = {}) {
  const request: SignatureRequestProps = {
    count: 7,
    organizationName: 'Protect SSM',
    signUrl: 'https://portal.ssmusor.ro',
    place: 'portal',
    ...props,
  };
  const sent: OutgoingEmail[] = [];
  await sendEmail(
    env,
    {
      to: 'ion@example.ro',
      subject: subject(request.count),
      body: <SignatureRequest {...request} />,
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

describe('signature request', () => {
  it('counts the trainings in the subject and the title', async () => {
    const email = await sendRequest();

    expect(email.subject).toBe('Ai 7 instruiri de semnat în SSM Ușor');
    expect(email.html).toContain('Ai 7 instruiri de semnat');
    expect(email.text).toContain('Protect SSM a înregistrat instruiri care îți cer semnătura');
  });

  it.each([
    [1, 'Ai o instruire de semnat în SSM Ușor'],
    [20, 'Ai 20 de instruiri de semnat în SSM Ușor'],
    [102, 'Ai 102 instruiri de semnat în SSM Ușor'],
  ])('agrees the words with %i', async (count, words) => {
    const email = await sendRequest({ count });

    expect(email.subject).toBe(words);
  });

  it('sends a participant to the portal', async () => {
    const email = await sendRequest();

    expect(email.html).toContain('href="https://portal.ssmusor.ro"');
    expect(email.html).toContain('Deschide portalul');
    expect(email.text).toContain('Le vezi și le semnezi în portalul SSM Ușor');
  });

  it('sends a member to the app', async () => {
    const email = await sendRequest({ place: 'app', signUrl: 'https://app.ssmusor.ro', count: 1 });

    expect(email.html).toContain('href="https://app.ssmusor.ro"');
    expect(email.html).toContain('Deschide SSM Ușor');
    expect(email.text).toContain('O vezi și o semnezi în SSM Ușor');
  });

  it('lists nothing of what is signed', async () => {
    const email = await sendRequest();

    expect(email.text).not.toMatch(/Popescu|SSM periodic|instruirea periodică/);
  });
});
