import type { EmployeesOverStepNoticeEmail } from '@ssm-usor/contracts/mail';

import { Layout } from './_components/layout';
import { Action, FallbackLink, Paragraph, Title } from './_components/text';

export type EmployeesOverStepNoticeProps = Omit<EmployeesOverStepNoticeEmail, 'to'>;

const printed = (isoDate: string) => isoDate.split('-').reverse().join('.');

export function workers(count: number) {
  if (count === 1) return 'un lucrător';
  const tail = count % 100;
  const number = new Intl.NumberFormat('ro-RO').format(count);
  return tail === 0 || tail >= 20 ? `${number} de lucrători` : `${number} lucrători`;
}

export function subject({ kind, lastDay }: EmployeesOverStepNoticeProps) {
  return kind === 'employees_soon'
    ? `Din ${printed(nextDay(lastDay))} nu mai poți adăuga lucrători noi`
    : 'Ai mai mulți lucrători decât treapta abonamentului';
}

function nextDay(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export default function EmployeesOverStepNotice(props: EmployeesOverStepNoticeProps) {
  const { kind, organizationName, employees, limit, lastDay, subscriptionUrl } = props;
  const reason = `Primești acest email pentru că ești adminul organizației ${organizationName} în SSM Ușor. Îl trimitem când treci de treaptă și încă o dată cu trei zile înainte de termen.`;
  const counts = `${organizationName} are acum ${workers(employees)} activi la clienții activi, iar treapta abonamentului acoperă ${workers(limit)}.`;
  const rule = `Poți adăuga lucrători noi până pe ${printed(lastDay)} inclusiv. Dacă după această dată ai tot mai mulți lucrători decât treapta, nu mai poți adăuga lucrători noi, nici clienți cu lucrători, până nu treci pe o treaptă mai mare sau arhivezi clienții cu care nu mai lucrezi.`;
  const kept =
    'Tot ce ai lucrat merge mai departe: editezi, emiți documente, instruiești și semnezi ca până acum.';

  return (
    <Layout
      preview={
        kind === 'employees_soon'
          ? `Mai poți adăuga lucrători noi până pe ${printed(lastDay)} inclusiv.`
          : `Poți adăuga lucrători noi până pe ${printed(lastDay)} inclusiv.`
      }
      reason={reason}
    >
      <Title>
        {kind === 'employees_soon'
          ? `Mai poți adăuga lucrători noi până pe ${printed(lastDay)}`
          : 'Ai trecut de treapta de lucrători'}
      </Title>
      <Paragraph>{counts}</Paragraph>
      <Paragraph>{rule}</Paragraph>
      <Paragraph>{kept}</Paragraph>
      <Action href={subscriptionUrl}>Vezi abonamentul</Action>
      <FallbackLink href={subscriptionUrl} />
    </Layout>
  );
}

EmployeesOverStepNotice.PreviewProps = {
  kind: 'employees_over',
  organizationName: 'Prevenire Plus SRL',
  employees: 262,
  limit: 250,
  lastDay: '2026-12-14',
  subscriptionUrl: 'https://app.ssmusor.ro/organizatie/abonament',
} satisfies EmployeesOverStepNoticeProps;
