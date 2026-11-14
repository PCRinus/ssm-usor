import { describe, expect, it } from 'vitest';

import type { MailEnv } from '../env';
import type { OutgoingEmail } from '../provider';
import { sendEmail } from '../send';
import EmployeesOverStepNotice, {
  type EmployeesOverStepNoticeProps,
  subject,
  workers,
} from './employees-over-step-notice';

const env: MailEnv = {
  MAIL_FROM: 'SSM Ușor <noreply@mail.ssmusor.ro>',
  MAIL_REPLY_TO: 'contact@ssmusor.ro',
};

const over: EmployeesOverStepNoticeProps = {
  kind: 'employees_over',
  organizationName: 'Prevenire Plus SRL',
  employees: 262,
  limit: 250,
  lastDay: '2026-12-14',
  subscriptionUrl: 'https://app.ssmusor.ro/organizatie/abonament',
};

async function sendNotice(props: EmployeesOverStepNoticeProps) {
  const sent: OutgoingEmail[] = [];
  await sendEmail(
    env,
    {
      to: 'olga@exemplu.example',
      subject: subject(props),
      body: <EmployeesOverStepNotice {...props} />,
    },
    { send: async (email) => (sent.push(email), { id: 'msg_1' }) }
  );
  return sent[0]!;
}

describe('employees over the step notice', () => {
  it('says the counts, the last day and the way back, and that nothing done is blocked', async () => {
    const email = await sendNotice(over);

    expect(email.subject).toBe('Ai mai mulți lucrători decât treapta abonamentului');
    for (const body of [email.html, email.text]) {
      expect(body).toContain(
        'Prevenire Plus SRL are acum 262 de lucrători activi la clienții activi, iar treapta abonamentului acoperă 250 de lucrători.'
      );
      expect(body).toContain('Poți adăuga lucrători noi până pe 14.12.2026 inclusiv.');
      expect(body).toContain(
        'nu mai poți adăuga lucrători noi, nici clienți cu lucrători, până nu treci pe o treaptă mai mare sau arhivezi clienții cu care nu mai lucrezi, ori marchezi plecarea lucrătorilor care nu mai lucrează la clienți.'
      );
      expect(body).toContain('Tot ce ai lucrat merge mai departe');
      expect(body).toContain('https://app.ssmusor.ro/organizatie/abonament');
    }
  });

  it('three days before, names the first day without new employees', async () => {
    const email = await sendNotice({ ...over, kind: 'employees_soon', lastDay: '2026-12-31' });

    expect(email.subject).toBe('Din 01.01.2027 nu mai poți adăuga lucrători noi');
    expect(email.html).toContain('Mai poți adăuga lucrători noi până pe 31.12.2026');
  });

  it('counts workers in Romanian', () => {
    expect(workers(1)).toBe('un lucrător');
    expect(workers(12)).toBe('12 lucrători');
    expect(workers(262)).toBe('262 de lucrători');
    expect(workers(1500)).toBe('1.500 de lucrători');
  });
});
