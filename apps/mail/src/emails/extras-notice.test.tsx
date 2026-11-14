import { describe, expect, it } from 'vitest';

import type { MailEnv } from '../env';
import type { OutgoingEmail } from '../provider';
import { sendEmail } from '../send';
import ExtrasNotice, { credits, type ExtrasNoticeProps, subject } from './extras-notice';

const env: MailEnv = {
  MAIL_FROM: 'SSM Ușor <noreply@mail.ssmusor.ro>',
  MAIL_REPLY_TO: 'contact@ssmusor.ro',
};

const sms: ExtrasNoticeProps = {
  kind: 'sms',
  level: 'near',
  organizationName: 'Prevenire Plus SRL',
  ceilingCents: 1000,
  spentCents: 800,
  used: 80,
  limit: 100,
  periodEnd: '2026-12-01T08:00:00.000Z',
  subscriptionUrl: 'https://app.ssmusor.ro/organizatie/abonament',
};

async function send(props: ExtrasNoticeProps) {
  const sent: OutgoingEmail[] = [];
  await sendEmail(
    env,
    { to: 'olga@exemplu.example', subject: subject(props), body: <ExtrasNotice {...props} /> },
    { send: async (email) => (sent.push(email), { id: 'msg_1' }) }
  );
  return sent[0]!;
}

describe('extras notice', () => {
  it('at 80 % of the SMS ceiling, says what was used of it and what happens at it', async () => {
    const email = await send(sms);

    expect(email.subject).toBe('Ai trimis 80 din cele 100 de coduri SMS extra ale plafonului');
    for (const body of [email.html, email.text]) {
      expect(body).toContain(
        'a trimis 80 de coduri extra, adică 8 € + TVA din plafonul de 10 € pe lună, care ajunge pentru 100 de coduri.'
      );
      expect(body).toContain('La plafon, codurile de semnare pleacă pe email până pe 01.12.2026');
      expect(body).toContain('o singură dată pe lună');
    }
  });

  it('at the AI credits ceiling, says the new imports wait and leads to raising it', async () => {
    const email = await send({
      ...sms,
      kind: 'credits',
      level: 'reached',
      ceilingCents: 1000,
      spentCents: 900,
      used: 600,
      limit: 600,
    });

    expect(email.subject).toBe('Plafonul pentru creditele AI extra e atins');
    expect(email.text).toContain(
      'a cumpărat 600 de credite AI extra, în 6 pachete de 100: 9 € + TVA. Plafonul de 10 € pe lună ajunge pentru 600 de credite AI, în 6 pachete de 100.'
    );
    expect(email.text).toContain('Încă un pachet de 1,50 € nu mai încape în plafon');
    expect(email.text).toContain('unul mai mic pornește');
    expect(email.html).toContain('Mărește plafonul');
  });

  it('at 80 % of the AI credits the ceiling buys, words it by the credits, not the euro', async () => {
    const email = await send({
      ...sms,
      kind: 'credits',
      ceilingCents: 1000,
      spentCents: 750,
      used: 500,
      limit: 600,
    });

    expect(email.subject).toBe('Ai cumpărat 500 de credite AI extra din cele 600 ale plafonului');
    expect(email.text).toContain(
      'Când încă un pachet de 1,50 € nu mai încape în plafon, ne oprim.'
    );
  });

  it.each([
    [1, 'un credit AI'],
    [19, '19 credite AI'],
    [1000, '1.000 de credite AI'],
  ])('agrees the words with %i credits', (count, words) => {
    expect(credits(count)).toBe(words);
  });
});
