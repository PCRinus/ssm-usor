import type { ExtrasNoticeEmail } from '@ssm-usor/contracts/mail';

import { Layout } from './_components/layout';
import { Action, FallbackLink, Paragraph, Title } from './_components/text';
import { codes, euro } from './sms-usage-notice';

export type ExtrasNoticeProps = Omit<ExtrasNoticeEmail, 'to'>;

const fullDate = new Intl.DateTimeFormat('ro-RO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Bucharest',
});

export function credits(count: number) {
  if (count === 1) return 'un credit AI';
  const tail = count % 100;
  const grouped = String(count).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return tail === 0 || tail >= 20 ? `${grouped} de credite AI` : `${grouped} credite AI`;
}

const what = { sms: 'codurile SMS extra', credits: 'creditele AI extra' } as const;

const blocks = (credits: number) =>
  credits / 100 === 1 ? 'un pachet de 100' : `${credits / 100} pachete de 100`;

export function subject({ kind, level, used, limit }: ExtrasNoticeProps) {
  if (kind === 'sms') {
    return level === 'near'
      ? `Ai trimis ${used} din cele ${codes(limit)} SMS extra ale plafonului`
      : 'Ai atins plafonul pentru codurile SMS extra';
  }
  return level === 'near'
    ? `Ai cumpărat ${credits(used)} extra din cele ${limit} ale plafonului`
    : 'Plafonul pentru creditele AI extra e atins';
}

export default function ExtrasNotice(props: ExtrasNoticeProps) {
  const { kind, level, organizationName, ceilingCents, spentCents, used, limit, periodEnd } = props;
  const renewal = fullDate.format(new Date(periodEnd));
  const ceiling = euro(ceilingCents);
  const reason = `Primești acest email pentru că ești adminul organizației ${organizationName} în SSM Ușor și ai pornit Extra. Îl trimitem o singură dată pe lună, când se întâmplă.`;
  const smsAfter = `Până pe ${renewal}, codurile de semnare pleacă pe email; lucrătorii fără email nu pot semna până atunci.`;
  const creditsAfter = `Până pe ${renewal}, un import pe care creditele rămase nu-l acoperă nu pornește; unul mai mic pornește.`;
  const summary =
    kind === 'sms'
      ? `Luna aceasta, ${organizationName} a trimis ${codes(used)} extra, adică ${euro(spentCents)} + TVA din plafonul de ${ceiling} pe lună, care ajunge pentru ${codes(limit)}.`
      : `Luna aceasta, ${organizationName} a cumpărat ${credits(used)} extra, în ${blocks(used)}: ${euro(spentCents)} + TVA. Plafonul de ${ceiling} pe lună ajunge pentru ${credits(limit)}, în ${blocks(limit)}.`;
  const next =
    level === 'near'
      ? kind === 'sms'
        ? `La plafon, codurile de semnare pleacă pe email până pe ${renewal}, iar lucrătorii fără email nu pot semna până atunci.`
        : `Când încă un pachet de 1,50 € nu mai încape în plafon, ne oprim. ${creditsAfter}`
      : kind === 'sms'
        ? `Ne-am oprit aici, ca factura să nu treacă de plafon. ${smsAfter}`
        : `Încă un pachet de 1,50 € nu mai încape în plafon, așa că ne-am oprit aici. ${creditsAfter}`;

  return (
    <Layout preview={subject(props)} reason={reason}>
      <Title>
        {level === 'near'
          ? `${kind === 'sms' ? 'Codurile SMS extra' : 'Creditele AI extra'} se apropie de plafon`
          : `Ai atins plafonul pentru ${what[kind]}`}
      </Title>
      <Paragraph>{summary}</Paragraph>
      <Paragraph>{next}</Paragraph>
      <Paragraph>
        {`Suma apare pe factura din ${renewal}. Plafonul îl mărești, îl micșorezi sau oprești Extra oricând, din Abonament.`}
      </Paragraph>
      <Action href={props.subscriptionUrl}>
        {level === 'near' ? 'Vezi consumul' : 'Mărește plafonul'}
      </Action>
      <FallbackLink href={props.subscriptionUrl} />
    </Layout>
  );
}

ExtrasNotice.PreviewProps = {
  kind: 'sms',
  level: 'near',
  organizationName: 'Prevenire Plus SRL',
  ceilingCents: 1000,
  spentCents: 800,
  used: 80,
  limit: 100,
  periodEnd: '2026-12-01T08:00:00.000Z',
  subscriptionUrl: 'https://app.ssmusor.ro/organizatie/abonament',
} satisfies ExtrasNoticeProps;
