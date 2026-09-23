import { describe, expect, it } from 'vitest';

import type { MailEnv } from '../env';
import type { OutgoingEmail } from '../provider';
import { sendEmail } from '../send';
import SignedCopyReceived, { type SignedCopyReceivedProps, subject } from './signed-copy-received';

const env: MailEnv = { MAIL_FROM: 'SSM Ușor <noreply@mail.ssmusor.ro>' };
const received: SignedCopyReceivedProps = {
  clientName: 'S.C. Gelateria Florești S.R.L.',
  contractNumber: 52,
  contractDate: '2026-09-21',
  leadUrl: 'https://app.ssmusor.ro/leads/lead-1',
};

describe('signed copy received', () => {
  it('tells the owner which contract came back and where to confirm it', async () => {
    const sent: OutgoingEmail[] = [];
    await sendEmail(
      env,
      {
        to: 'olga@exemplu.example',
        subject: subject(received.clientName),
        body: <SignedCopyReceived {...received} />,
      },
      { send: async (email) => (sent.push(email), { id: 'msg_1' }) }
    );
    const email = sent[0]!;
    expect(email.from).toBe(env.MAIL_FROM);
    expect(email.subject).toBe('Exemplar semnat primit – S.C. Gelateria Florești S.R.L.');
    for (const body of [email.html, email.text]) {
      expect(body).toContain('nr. 52 din 21.09.2026');
      expect(body).toContain('https://app.ssmusor.ro/leads/lead-1');
      expect(body).toContain('nu este socotit semnat');
    }
  });
});
