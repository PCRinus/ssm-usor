import { describe, expect, it } from 'vitest';

import type { MailEnv } from '../env';
import type { OutgoingEmail } from '../provider';
import { sendEmail } from '../send';
import SmsUsageNotice, { codes, euro, type SmsUsageNoticeProps, subject } from './sms-usage-notice';

const env: MailEnv = {
  MAIL_FROM: 'SSM Ușor <noreply@mail.ssmusor.ro>',
  MAIL_REPLY_TO: 'contact@ssmusor.ro',
};

const paid: SmsUsageNoticeProps = {
  kind: 'sms_80',
  organizationName: 'Prevenire Plus SRL',
  planName: 'Profesional',
  billed: true,
  used: 240,
  included: 300,
  cap: 900,
  overageCents: 10,
  periodStart: '2026-10-14T08:00:00.000Z',
  periodEnd: '2026-11-14T08:00:00.000Z',
  subscriptionUrl: 'https://app.ssmusor.ro/organization/subscription',
};

const hardStop: SmsUsageNoticeProps = {
  ...paid,
  planName: 'Start',
  billed: false,
  used: 40,
  included: 50,
  cap: null,
};

async function sendNotice(props: SmsUsageNoticeProps) {
  const sent: OutgoingEmail[] = [];
  await sendEmail(
    env,
    { to: 'olga@exemplu.example', subject: subject(props), body: <SmsUsageNotice {...props} /> },
    { send: async (email) => (sent.push(email), { id: 'msg_1' }) }
  );
  return sent[0]!;
}

const bodies = (email: OutgoingEmail) => [email.html, email.text];

describe('SMS usage notice', () => {
  it('at 80 % on a paid plan, tells the month, the counts and the price past the included codes', async () => {
    const email = await sendNotice(paid);

    expect(email.subject).toBe('Ai folosit 240 din cele 300 de coduri SMS ale lunii');
    expect(email.text).toContain(
      'Prevenire Plus SRL a trimis 240 din cele 300 de coduri de semnare prin SMS incluse în Profesional, în luna 14.10 – 13.11.2026.'
    );
    for (const body of bodies(email)) {
      expect(body).toContain('Rămase până pe 14.11.2026');
      expect(body).toContain('0,10 € + TVA, pe factura din 14.11.2026');
      expect(body).toContain('https://app.ssmusor.ro/organization/subscription');
      expect(body).toContain('o singură dată pe lună');
    }
  });

  it('at 80 % before the first payment, says the codes stop, without a price', async () => {
    const email = await sendNotice(hardStop);

    expect(email.subject).toBe('Ai folosit 40 din cele 50 de coduri SMS ale lunii');
    expect(email.text).toContain('nu mai pleacă prin SMS până pe 14.11.2026');
    expect(email.html).not.toContain('€');
  });

  it('at 100 % on a paid plan, says the codes go on, at what price, up to the cap', async () => {
    const email = await sendNotice({ ...paid, kind: 'sms_100', used: 300 });

    expect(email.subject).toBe('Ai folosit toate cele 300 de coduri SMS incluse');
    expect(email.html).toContain('De acum, fiecare cod SMS costă 0,10 €');
    for (const body of bodies(email)) {
      expect(body).toContain('Peste plan, pe factura din 14.11.2026');
      expect(body).toContain('Mergem până la 900 pe lună, de trei ori cele incluse');
    }
  });

  it('at the hard stop, says the codes are stopped until the month starts again, without a price', async () => {
    const email = await sendNotice({ ...hardStop, kind: 'sms_100', used: 50 });

    expect(email.subject).toBe('Codurile de semnare nu mai pleacă prin SMS până pe 14.11');
    for (const body of bodies(email)) {
      expect(body).toContain(
        'a trimis toate cele 50 de coduri de semnare prin SMS incluse în Start'
      );
      expect(body).toContain('Până pe 14.11.2026, angajații cu email primesc codul pe email.');
      expect(body).toContain('răspunde la acest email');
      expect(body).not.toContain('€');
    }
  });

  it("speaks of a tester's trial, which has no plan", async () => {
    const email = await sendNotice({
      ...hardStop,
      planName: null,
      kind: 'sms_100',
      used: 300,
      included: 300,
    });

    expect(email.text).toContain('incluse în perioada de probă');
    expect(email.text).not.toContain('Incluse în plan');
  });

  it('at the cap, says what the month costs and leads to raising the limit', async () => {
    const email = await sendNotice({ ...paid, kind: 'sms_cap', used: 900 });

    expect(email.subject).toBe('Codurile de semnare nu mai pleacă prin SMS până pe 14.11');
    for (const body of bodies(email)) {
      expect(body).toContain('de trei ori cele 300 incluse');
      expect(body).toContain('Peste plan: 600 × 0,10 €');
      expect(body).toContain('60 € + TVA');
      expect(body).toContain('Ridică limita');
    }
  });

  it('leaves out the multiple where granted codes break it', async () => {
    const email = await sendNotice({
      ...paid,
      kind: 'sms_cap',
      used: 920,
      included: 320,
      cap: 920,
    });

    expect(email.text).toContain('peste cele 320 incluse');
    expect(email.text).not.toContain('ori');
  });

  it('writes the month across a new year in full', async () => {
    const email = await sendNotice({
      ...paid,
      periodStart: '2026-12-14T08:00:00.000Z',
      periodEnd: '2027-01-14T08:00:00.000Z',
    });

    expect(email.text).toContain('în luna 14.12.2026 – 13.01.2027');
  });

  it.each([
    [1, 'un cod'],
    [15, '15 coduri'],
    [50, '50 de coduri'],
    [101, '101 coduri'],
    [300, '300 de coduri'],
  ])('agrees the words with %i', (count, words) => {
    expect(codes(count)).toBe(words);
  });

  it.each([
    [10, '0,10 €'],
    [6000, '60 €'],
  ])('writes %i cents as %s', (cents, words) => {
    expect(euro(cents)).toBe(words);
  });
});
