import type { EmployeesOverStepNoticeEmail } from '@ssm-usor/contracts/mail';
import { countOf, printedDate } from '@ssm-usor/contracts/romanian';

import { Layout } from './_components/layout';
import { Action, FallbackLink, Paragraph, Title } from './_components/text';

export type EmployeesOverStepNoticeProps = Omit<EmployeesOverStepNoticeEmail, 'to'>;

export const workers = (count: number) =>
  count === 1 ? 'un lucrător' : countOf(count, 'lucrător', 'lucrători');

export function subject({ kind, lastDay }: EmployeesOverStepNoticeProps) {
  return kind === 'employees_soon'
    ? `Din ${printedDate(nextDay(lastDay))} nu mai poți adăuga lucrători noi`
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
  const rule = `Poți adăuga lucrători noi până pe ${printedDate(lastDay)} inclusiv. Dacă după această dată ai tot mai mulți lucrători decât treapta, nu mai poți adăuga lucrători noi, nici clienți cu lucrători, până nu treci pe o treaptă mai mare sau arhivezi clienții cu care nu mai lucrezi, ori îi treci la foști pe lucrătorii care nu mai lucrează la clienți.`;
  const kept =
    'Tot ce ai lucrat merge mai departe: editezi, emiți documente, instruiești și semnezi ca până acum.';

  return (
    <Layout
      preview={
        kind === 'employees_soon'
          ? `Mai poți adăuga lucrători noi până pe ${printedDate(lastDay)} inclusiv.`
          : `Poți adăuga lucrători noi până pe ${printedDate(lastDay)} inclusiv.`
      }
      reason={reason}
    >
      <Title>
        {kind === 'employees_soon'
          ? `Mai poți adăuga lucrători noi până pe ${printedDate(lastDay)}`
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
