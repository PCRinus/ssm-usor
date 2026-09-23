import { describe, expect, it } from 'vitest';

import type { MailEnv } from '../env';
import type { OutgoingEmail } from '../provider';
import { sendEmail } from '../send';
import ServiceContract, { type ServiceContractProps, subject } from './service-contract';

const env: MailEnv = {
  MAIL_FROM: 'SSM Ușor <noreply@mail.ssmusor.ro>',
  MAIL_FROM_CONTRACTS: 'SSM Ușor <contracte@mail.ssmusor.ro>',
  MAIL_REPLY_TO: 'contact@ssmusor.ro',
};
const contract: ServiceContractProps = {
  senderName: 'Olga Popescu',
  senderEmail: 'olga@exemplu.example',
  returnUrl: 'https://app.ssmusor.ro/contract?token=abc',
  organizationName: 'S.C. Exemplu SSM S.R.L.',
  clientName: 'S.C. Gelateria Florești S.R.L.',
  contractNumber: 52,
  contractDate: '2026-09-21',
  note: 'Am trecut abonamentul lunar convenit.',
};
const attachment = { fileName: 'Contract nr. 52.pdf', contentBase64: 'JVBERi0=' };

async function send(props: ServiceContractProps = contract) {
  const sent: OutgoingEmail[] = [];
  await sendEmail(
    env,
    {
      to: 'andrei@gelateria.example',
      subject: subject(props.organizationName),
      body: <ServiceContract {...props} />,
      sender: { name: props.senderName, email: props.senderEmail },
      from: env.MAIL_FROM_CONTRACTS,
      attachments: [attachment],
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

describe('service contract', () => {
  it('goes out in the name of the owner, who gets the replies and a copy', async () => {
    const email = await send();
    expect(email.from).toBe('"Olga Popescu prin SSM Ușor" <contracte@mail.ssmusor.ro>');
    expect(email.replyTo).toBe('olga@exemplu.example');
    expect(email.cc).toBe('olga@exemplu.example');
    expect(email.to).toBe('andrei@gelateria.example');
    expect(email.subject).toBe('Contract de prestări servicii – S.C. Exemplu SSM S.R.L.');
    expect(email.attachments).toEqual([attachment]);
  });

  it('names the contract and the parties, with the owner’s note, in the HTML and in the plain text', async () => {
    const email = await send();
    expect(email.html).toContain('lang="ro"');
    for (const body of [email.html, email.text]) {
      expect(body).toContain('nr. 52 din');
      expect(body).toContain('21.09.2026');
      expect(body).toContain('S.C. Gelateria Florești S.R.L.');
      expect(body).toContain('Am trecut abonamentul lunar convenit.');
      expect(body).toContain('certificatul calificat');
      expect(body).toContain('Olga Popescu, olga@exemplu.example');
      expect(body).toContain('https://app.ssmusor.ro/contract?token=abc');
    }
  });

  it('signs as the organization when the owner has no name, and keeps our own sender', async () => {
    const email = await send({ ...contract, senderName: null, note: null });
    expect(email.from).toBe(env.MAIL_FROM_CONTRACTS);
    expect(email.text).toContain('S.C. Exemplu SSM S.R.L., olga@exemplu.example');
    expect(email.text).toContain('Cu stimă');
    expect(email.text).not.toContain('Am trecut');
  });
});
