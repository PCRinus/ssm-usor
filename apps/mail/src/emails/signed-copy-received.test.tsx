import { describe, expect, it } from 'vitest';

import { sentEmail, testEnv } from '../testing';
import SignedCopyReceived, { type SignedCopyReceivedProps, subject } from './signed-copy-received';

const received: SignedCopyReceivedProps = {
  clientName: 'S.C. Gelateria Florești S.R.L.',
  contractNumber: 52,
  contractDate: '2026-09-21',
  leadUrl: 'https://app.ssmusor.ro/oferte/lead-1',
};

describe('signed copy received', () => {
  it('tells the owner which contract came back and where to confirm it', async () => {
    const email = await sentEmail({
      to: 'olga@exemplu.example',
      subject: subject(received.clientName),
      body: <SignedCopyReceived {...received} />,
    });
    expect(email.from).toBe(testEnv.MAIL_FROM);
    expect(email.subject).toBe('Exemplar semnat primit – S.C. Gelateria Florești S.R.L.');
    for (const body of [email.html, email.text]) {
      expect(body).toContain('nr. 52 din 21.09.2026');
      expect(body).toContain('https://app.ssmusor.ro/oferte/lead-1');
      expect(body).toContain('nu este socotit semnat');
    }
  });
});
